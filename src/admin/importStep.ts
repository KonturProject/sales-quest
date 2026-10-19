import { applyImport, type ImportResult, type Resolution } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import { namesWithNumbers, type Unknown } from '../import/match.ts';
import type { Parsed } from '../import/parsed.ts';
import type { ParsedFile } from '../import/parseFile.ts';
import { plural } from '../text.ts';
import { applyCorrections, revokeAdjustments, type Correction } from './corrections.ts';
import {
  doubleCounts,
  importChanges,
  type DoubleCount,
  type OperatorChange,
} from './importDiff.ts';
import { previewChange, type Preview, type RepoState } from './pipeline.ts';

/** What the author adds in the preview (2b-3): corrections of operators' numbers, corrections to cancel. */
export type PreviewExtras = { fixes: Correction[]; cancels: string[] };

export type ImportStep = {
  state: RepoState;
  /** `result.input` — the season after the file, the fixes and the cancels: what «Записать» writes. */
  result: ImportResult;
  preview: Preview;
  message: string;
  /** Per operator: before the file → after it, with the manual counts after the batch. */
  changes: OperatorChange[];
  /** Days the file brings what the author had added by hand (before the batch). */
  doubles: DoubleCount[];
  /** Fixes that do not apply, by their index; cancels that do not apply at −1. Any — no «Записать». */
  problems: { index: number; message: string }[];
  /** The fixes in words, for the screen — names inside: never public. */
  lines: string[];
};

const NO_EXTRAS: PreviewExtras = { fixes: [], cancels: [] };
const NOT_IN_INTRADAY = 'в промежуточных итогах правок нет — правьте после утренней воронки';

/**
 * One import as the admin's screen runs it (plan 2a), pure: the file applied to the season read from
 * GitHub, then the preview's fixes and cancels (2b-3), the preview «было → станет», what the file changes per
 * operator and the public commit message — counts, never names. After a conflict the screen calls it again
 * on the season read anew, with the same resolutions, fixes and cancels.
 */
export function prepareImport(
  state: RepoState,
  file: ParsedFile,
  resolutions: Map<string, Resolution>,
  opts: { by: string; at: string; now: string; period?: [string, string] },
  extras: PreviewExtras = NO_EXTRAS,
): ImportStep {
  const result = applyImport(state.input, file.parsed, resolutions, {
    fileName: file.fileName,
    sha256: file.sha256,
    by: opts.by,
    at: opts.at,
    ...(opts.period ? { period: opts.period } : {}),
  });
  const { period } = result.summary;
  const problems: ImportStep['problems'] = [];
  // The next morning's funnel rewrites an intraday day: a fix made on it would count twice then.
  const fixes = extras.fixes.flatMap((fix, index) => {
    if (file.profile.kind === 'list') problems.push({ index, message: NOT_IN_INTRADAY });
    else if (fix.kind !== 'metric')
      problems.push({ index, message: 'в превью — только показатели оператора' });
    else return [{ fix, index }];
    return [];
  });
  const fixed = applyCorrections(
    result.input,
    fixes.map((f) => f.fix),
    { now: opts.now, by: opts.by },
  );
  for (const p of fixed.problems)
    problems.push({ index: fixes[p.index]?.index ?? p.index, message: p.message });
  const cancelled = revokeAdjustments(fixed.input, extras.cancels, {
    by: opts.by,
    at: opts.now,
    reason: `пришло в выгрузке ${dayMonth(period[1])}`,
  });
  for (const p of cancelled.problems) {
    const found = state.input.adjustments.find((a) => a.id === p.id);
    const what = found ? `«${found.reason}»` : `корректировки ${p.id}`;
    problems.push({ index: -1, message: `Отмена ${what}: ${p.message}` });
  }
  const after = { ...result, input: cancelled.input };
  return {
    // «Записать» commits on this read, never on a later one (review 2a).
    state,
    result: after,
    preview: previewChange(state.input, after.input, opts.now),
    message: importCommitMessage(
      file.profile.title,
      period,
      result.summary.matched,
      result.summary.added,
      fixes.length - fixed.problems.length,
      extras.cancels.length - cancelled.problems.length,
    ),
    changes: importChanges(state.input, after.input, period),
    doubles: doubleCounts(state.input, result.input, period),
    problems: problems.sort((a, b) => a.index - b.index),
    lines: fixed.lines,
  };
}

/** `05.10–12.10`, or `13.10` for one day. */
export function periodText([from, to]: [string, string]): string {
  return from === to ? dayMonth(from) : `${dayMonth(from)}–${dayMonth(to)}`;
}

/**
 * `импорт: воронка по дням 05.10–12.10, 49 операторов, 1 новый`, `импорт: промежуточные итоги 13.10,
 * 49 операторов`, `…, корректировок: 1, отменено корректировок: 1` (2b-3) — public, so counts only.
 */
export function importCommitMessage(
  title: string,
  period: [string, string],
  matched: number,
  added: number,
  fixes = 0,
  cancels = 0,
): string {
  const people = `${matched} ${plural(matched, 'оператор', 'оператора', 'операторов')}`;
  const fresh = added > 0 ? `, ${added} ${plural(added, 'новый', 'новых', 'новых')}` : '';
  const fixed = fixes > 0 ? `, корректировок: ${fixes}` : '';
  const undone = cancels > 0 ? `, отменено корректировок: ${cancels}` : '';
  return `импорт: ${title.toLowerCase()} ${periodText(period)}, ${people}${fresh}${fixed}${undone}`;
}

/**
 * The people to ask about: unknown and with a number in this file. Nothing is preselected — a wrong
 * «новый» would add a person the admin left out, or a second copy of one written otherwise (review 2a).
 */
export function toAsk(unknown: Unknown[], parsed: Parsed): Unknown[] {
  const busy = namesWithNumbers(parsed.rows);
  return unknown.filter((u) => busy.has(u.norm));
}
