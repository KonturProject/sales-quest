import type { ImportLog, MetricRecord } from '../data/schemas/records.ts';
import type { Manager } from '../data/schemas/season.ts';
import { eachDate } from '../engine/dates.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { membersOn } from '../engine/roster.ts';
import { plural } from '../text.ts';
import { ImportError, dayMonth } from './grid.ts';
import { cleanName, matchPeople, namesWithNumbers, normalizeName } from './match.ts';
import type { Parsed } from './parsed.ts';

/** The admin's answer for a person the roster does not know (DATA-10). */
export type Resolution =
  { kind: 'link'; managerId: string } | { kind: 'new'; teamId: string } | { kind: 'ignore' };

export type ImportMeta = {
  fileName: string;
  sha256: string;
  /** The admin's GitHub login. */
  by: string;
  /** Local timestamp (D-11). */
  at: string;
  /** The period the admin set (the paid invoices); default — the file's own days. */
  period?: [string, string];
};

export type ImportResult = {
  input: EngineInput;
  log: ImportLog;
  summary: {
    rows: number;
    matched: number;
    added: number;
    ignored: number;
    period: [string, string];
    warnings: string[];
  };
};

/** `06.10 09:00` of a local timestamp. */
const when = (at: string) => `${dayMonth(at.slice(0, 10))} ${at.slice(11, 16)}`;

/** The next free id of a new operator, `op001…` after the largest (an import's, the roster's). */
export function nextManagerId(managers: Manager[]): string {
  const max = managers.reduce((n, m) => Math.max(n, Number(/^op(\d+)$/.exec(m.id)?.[1] ?? 0)), 0);
  return `op${String(max + 1).padStart(3, '0')}`;
}

/**
 * An export applied to the game (DATA-5…DATA-11, D-20, OQ-12), pure:
 * - the admin's resolutions first — an alias, a new operator (the season's default norms), the ignore
 *   list;
 * - then only the file's metrics, per operator and day of its period inside the game: its numbers, or 0
 *   for the operators of its groups and its people on days it has none — a file is complete for its
 *   period, so a cancelled payment disappears;
 * - a record that does not change keeps its bytes (a repeated import moves nothing, §18), records stay
 *   sorted by day and operator;
 * - a log entry with the file's fingerprint; a file seen before is warned, not refused (DATA-8).
 */
export function applyImport(
  input: EngineInput,
  parsed: Parsed,
  resolutions: Map<string, Resolution>,
  meta: ImportMeta,
): ImportResult {
  const season = input.config.period;
  const fileDays = meta.period ? eachDate(meta.period[0], meta.period[1]) : parsed.days;
  const days = fileDays.filter((d) => d >= season.start && d <= season.end);
  if (days.length === 0)
    throw new ImportError(
      `в файле нет дней игры (${dayMonth(season.start)}–${dayMonth(season.end)}): ` +
        `файл за ${dayMonth(parsed.period[0])}–${dayMonth(parsed.period[1])}`,
    );
  const inPeriod = new Set(days);
  const first = days[0] as string;
  const warnings = [...parsed.warnings];

  // The admin's resolutions change the roster first.
  const before = matchPeople(parsed.people, input.config, first);
  let managers = input.config.managers;
  const importIgnore = [...input.config.importIgnore];
  const unresolved: string[] = [];
  // A stranger with no number in the file loses nothing: not asked, not reported (review 2a).
  const busy = namesWithNumbers(parsed.rows);
  let added = 0;
  for (const u of before.unknown) {
    const r = resolutions.get(u.norm);
    if (!r) {
      if (busy.has(u.norm)) unresolved.push(u.name);
    } else if (r.kind === 'ignore') importIgnore.push(u.norm);
    else if (r.kind === 'link')
      managers = managers.map((m) =>
        m.id === r.managerId ? { ...m, aliases: [...m.aliases, cleanName(u.name)] } : m,
      );
    else {
      const norms = input.config.defaultDailyNorms;
      managers = [
        ...managers,
        {
          id: nextManagerId(managers),
          fullName: cleanName(u.name),
          aliases: [],
          ...(norms ? { dailyNorms: { ...norms } } : {}),
          memberships: [{ teamId: r.teamId, from: first }],
        },
      ];
      added += 1;
    }
  }
  const config = { ...input.config, managers, importIgnore };
  const match = matchPeople(parsed.people, config, first);
  warnings.push(...match.moved);
  if (unresolved.length > 0)
    warnings.push(
      `${unresolved.length} ${plural(unresolved.length, 'человек не сопоставлен', 'человека не сопоставлены', 'человек не сопоставлены')} — их показатели не учтены: ${unresolved.join(', ')}`,
    );

  // What the file says per operator and day: its numbers, then 0 where it has none.
  const writes = new Map<
    string,
    { managerId: string; date: string; values: Record<string, number> }
  >();
  const put = (managerId: string, date: string, values: Record<string, number>) => {
    const key = `${managerId}|${date}`;
    const w = writes.get(key) ?? { managerId, date, values: {} };
    for (const [metric, v] of Object.entries(values))
      w.values[metric] = (w.values[metric] ?? 0) + v;
    writes.set(key, w);
  };
  let outside = 0;
  for (const row of parsed.rows) {
    if (!inPeriod.has(row.date)) {
      if (row.date < season.start || row.date > season.end) outside += 1;
      continue;
    }
    const id = match.managerOf.get(normalizeName(row.name));
    if (id) put(id, row.date, row.values);
  }
  if (outside > 0)
    warnings.push(
      `${outside} ${plural(outside, 'строка', 'строки', 'строк')} вне дат игры (${dayMonth(season.start)}–${dayMonth(season.end)}) не учтены`,
    );
  const zero = Object.fromEntries(parsed.metrics.map((m) => [m, 0]));
  const fileTeams = config.teams.filter(
    (t) => t.sourceCode && parsed.groups.includes(t.sourceCode),
  );
  const filePeople = [...new Set(match.managerOf.values())];
  for (const date of days) {
    for (const team of fileTeams)
      for (const m of membersOn(managers, team.id, date)) put(m.id, date, zero);
    for (const id of filePeople) put(id, date, zero);
  }

  const log: ImportLog = {
    id: `imp-${meta.at.slice(0, 16).replace(/\D/g, '')}-${meta.sha256.slice(0, 6)}`,
    fileName: meta.fileName,
    fileSha256: meta.sha256,
    profileId: parsed.profileId,
    rows: parsed.rows.length,
    matched: match.managerOf.size,
    unmatched: unresolved.length + match.ignored.length,
    dateRange: [first, days[days.length - 1] as string],
    by: meta.by,
    at: meta.at,
    warnings: [],
  };
  const earlier = input.imports.find((i) => i.fileSha256 === meta.sha256);
  if (earlier) warnings.unshift(`этот файл уже загружался ${when(earlier.at)}`);
  log.warnings = warnings;

  // Upsert only the file's metrics; a record that does not change keeps its bytes.
  const records = new Map(input.records.map((r) => [`${r.managerId}|${r.date}`, r]));
  for (const [key, w] of writes) {
    const old = records.get(key);
    if (!old) {
      if (parsed.metrics.some((m) => (w.values[m] ?? 0) !== 0))
        records.set(key, {
          managerId: w.managerId,
          date: w.date,
          kind: 'daily',
          values: w.values,
          importId: log.id,
        });
      continue;
    }
    const values = { ...old.values };
    let changed = false;
    for (const metric of parsed.metrics) {
      const v = w.values[metric] ?? 0;
      if (
        (old.values[metric] === undefined && v !== 0) ||
        (old.values[metric] !== undefined && old.values[metric] !== v)
      ) {
        values[metric] = v;
        changed = true;
      }
    }
    if (changed) records.set(key, { ...old, values, importId: log.id });
  }
  const sorted: MetricRecord[] = [...records.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.managerId.localeCompare(b.managerId),
  );

  return {
    input: { ...input, config, records: sorted, imports: [...input.imports, log] },
    log,
    summary: {
      rows: parsed.rows.length,
      matched: match.managerOf.size,
      added,
      ignored: match.ignored.length,
      period: log.dateRange,
      warnings,
    },
  };
}
