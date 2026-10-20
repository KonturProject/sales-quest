import type { Adjustment, ImportLog } from '../data/schemas/records.ts';
import { pointsDateOf } from '../engine/adjustments.ts';
import { dateOf } from '../engine/dates.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { buildDailySeries } from '../engine/scoring.ts';
import { dayMonth } from '../import/grid.ts';
import type { BatchView } from './BatchDraft.tsx';
import { revokeAdjustments } from './corrections.ts';
import type { CommitInfo } from './github.ts';
import { importChanges, manualCounts, type OperatorChange } from './importDiff.ts';
import { previewChange, type RepoState } from './pipeline.ts';
import { teamLabel } from './roster.ts';

/**
 * The admin's journal (ADM-LOG, ADM-UNDO, 2b-3): the season's actions from the repository's history — every
 * admin commit says what it did in a public line (SEC-5) — what one commit changed, the corrections the exports
 * brought since (a double count) and the cancel of corrections as a batch. Pure.
 */

export type JournalKind =
  'import' | 'corrections' | 'cancels' | 'roster' | 'finale' | 'launch' | 'other';

export type JournalEntry = {
  sha: string;
  parent: string | null;
  /** The moment of the commit (ISO, GitHub's). */
  at: string;
  kind: JournalKind;
  /** The public line without `data(<season>): ` and `[by …]`. */
  line: string;
  by: string;
};

/** `data(<season>): <line> [by <login>]` — the admin's commit message (SEC-5). */
const LINE = /^data\(([^)]+)\): (.*?)(?: \[by ([^\]]+)\])?$/;

export function kindOf(line: string): JournalKind {
  if (line.startsWith('импорт:')) return 'import';
  if (line.startsWith('отмена корректировок:')) return 'cancels';
  if (line.startsWith('корректировки:')) return 'corrections';
  if (line.startsWith('состав:')) return 'roster';
  if (line.startsWith('итоги игры') || line.startsWith('игра снова идёт')) return 'finale';
  if (line.startsWith('новая игра')) return 'launch';
  return 'other';
}

/** The season's entries, newest first, down to and including its launch; other seasons' and non-data commits out. */
export function journalOf(commits: CommitInfo[], seasonId: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const c of commits) {
    const found = LINE.exec(c.message.split('\n')[0] ?? '');
    if (!found || found[1] !== seasonId) continue;
    const line = found[2] ?? '';
    const kind = kindOf(line);
    entries.push({ sha: c.sha, parent: c.parent, at: c.at, kind, line, by: found[3] ?? '' });
    if (kind === 'launch') break;
  }
  return entries;
}

/** The commit a correction was written in: the oldest import or corrections entry at or after its `at`. */
export function commitOf(
  entries: JournalEntry[],
  adjustment: Adjustment,
): JournalEntry | undefined {
  const made = Date.parse(adjustment.at);
  return [...entries]
    .reverse()
    .find((e) => (e.kind === 'import' || e.kind === 'corrections') && Date.parse(e.at) >= made);
}

export type EntryDetails = {
  /** The imports the commit added. */
  imports: ImportLog[];
  /** Per operator over the added imports' days; empty without an import. */
  changes: OperatorChange[];
  /** The adjustments the commit added. */
  added: Adjustment[];
  /** The adjustments the commit cancelled. */
  revoked: Adjustment[];
};

/** What one commit changed: the season before it and after it. */
export function entryDetails(before: EngineInput, after: EngineInput): EntryDetails {
  const known = new Set(before.imports.map((i) => i.id));
  const imports = after.imports.filter((i) => !known.has(i.id));
  const was = new Map(before.adjustments.map((a) => [a.id, a]));
  const days = imports.flatMap((i) => i.dateRange);
  const period: [string, string] | null =
    days.length > 0
      ? [days.reduce((a, b) => (a < b ? a : b)), days.reduce((a, b) => (a > b ? a : b))]
      : null;
  return {
    imports,
    changes: period ? importChanges(before, after, period) : [],
    added: after.adjustments.filter((a) => !was.has(a.id)),
    revoked: after.adjustments.filter((a) => a.revoked && was.has(a.id) && !was.get(a.id)?.revoked),
  };
}

export type PastDouble = {
  managerId: string;
  date: string;
  metricId: string;
  /** The net manual count now. */
  manual: number;
  /** The records when the earliest of its positive corrections was written. */
  then: number;
  /** The records now. */
  now: number;
  /** The active positive corrections of the key. */
  adjustmentIds: string[];
};

/**
 * Keys with a net manual count above zero now whose records grew since the earliest positive correction of the
 * key was written — the export brought what was added by hand. `thenOf(id)` — the season at that correction's
 * commit; undefined (not found) gives no flag: never guessed.
 */
export function pastDoubles(
  now: EngineInput,
  thenOf: (adjustmentId: string) => EngineInput | undefined,
): PastDouble[] {
  const { net, plus } = manualCounts(now.adjustments, now.config);
  const byId = new Map(now.adjustments.map((a) => [a.id, a]));
  const series = buildDailySeries(now.records, now.config.period).series;
  const found: PastDouble[] = [];
  for (const [k, manual] of net) {
    if (manual <= 0) continue;
    const ids = plus.get(k) ?? [];
    const first = [...ids].sort(
      (a, b) => Date.parse(byId.get(a)?.at ?? '') - Date.parse(byId.get(b)?.at ?? ''),
    )[0];
    const then = first === undefined ? undefined : thenOf(first);
    if (!then) continue;
    const [managerId = '', date = '', metricId = ''] = k.split('|');
    const was =
      buildDailySeries(then.records, then.config.period).series.get(managerId)?.get(date)?.[
        metricId
      ] ?? 0;
    const is = series.get(managerId)?.get(date)?.[metricId] ?? 0;
    if (is > was)
      found.push({ managerId, date, metricId, manual, then: was, now: is, adjustmentIds: ids });
  }
  return found.sort(
    (a, b) => a.date.localeCompare(b.date) || a.managerId.localeCompare(b.managerId),
  );
}

export type Cancel = { id: string; reason: string };

/** «Отменить «<reason>» — <who>, ДД.ММ: <причина отмены>» — names inside: the screen only. */
function cancelLine(input: EngineInput, c: Cancel): string {
  const a = input.adjustments.find((x) => x.id === c.id);
  if (!a) return `Отменить корректировку ${c.id}: ${c.reason.trim()}`;
  const { config } = input;
  let who = '';
  if (a.type === 'manager_points')
    who = config.managers.find((m) => m.id === a.managerId)?.fullName ?? a.managerId;
  else if ('teamId' in a && a.teamId !== undefined) {
    const team = config.teams.find((t) => t.id === a.teamId);
    who = team ? teamLabel(team) : a.teamId;
  }
  const day = a.type === 'manager_points' ? pointsDateOf(a) : dateOf(a.at);
  return `Отменить «${a.reason}» — ${who ? `${who}, ` : ''}${dayMonth(day)}: ${c.reason.trim()}`;
}

/** Cancels as a `BatchDraft` batch: one line each, problems by index, the public message «отмена корректировок: N». */
export function prepareCancels(
  state: RepoState,
  cancels: Cancel[],
  opts: { by: string; now: string },
): BatchView {
  let input = state.input;
  const problems: BatchView['problems'] = [];
  const lines: string[] = [];
  let applied = 0;
  cancels.forEach((c, index) => {
    lines.push(cancelLine(state.input, c));
    if (c.reason.trim() === '') {
      problems.push({ index, message: 'укажите причину отмены' });
      return;
    }
    const done = revokeAdjustments(input, [c.id], {
      by: opts.by,
      at: opts.now,
      reason: c.reason.trim(),
    });
    const problem = done.problems[0];
    if (problem) problems.push({ index, message: problem.message });
    else {
      input = done.input;
      applied += 1;
    }
  });
  return {
    state,
    input,
    lines,
    problems,
    warnings: [],
    preview: previewChange(state.input, input, opts.now),
    message: `отмена корректировок: ${String(applied)}`,
  };
}
