import { plural } from '../text.ts';
import { ImportError, cellText, column, type Grid } from './grid.ts';
import { normalizeName } from './match.ts';
import type { Parsed, ParsedRow, Person } from './parsed.ts';
import type { IntradayProfile } from './profiles.ts';

/**
 * The intraday totals «Промежуточные итоги» (D-55, `docs/IMPORT_FORMATS.md` §3): a group's row (its name
 * has the team's code; its own numbers, if any, are ignored), then its operators with the day's running
 * totals; an empty cell is 0. The file has no dates — the rows take `day`, chosen at the import.
 */
export function parseIntraday(grid: Grid, p: IntradayProfile, day: string): Parsed {
  const code = new RegExp(p.groupCode);
  const nameCol = column(p.nameColumn);
  const metrics = p.metrics.map((m) => ({ ...m, col: column(m.column) }));
  const groups: string[] = [];
  const people: Person[] = [];
  const rows: ParsedRow[] = [];
  let group: string | null = null;
  for (let i = 0; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const name = cellText(line[nameCol]);
    if (!name) continue;
    const found = code.exec(name)?.[0];
    if (found) {
      group = found;
      if (!groups.includes(found)) groups.push(found);
      continue;
    }
    if (group === null)
      throw new ImportError(
        `строка ${i + 1}: оператор выше первой группы — над операторами должна быть строка группы с кодом вроде «СР1»`,
      );
    const values: Record<string, number> = {};
    for (const m of metrics) values[m.metricId] = count(line[m.col], i + 1, m.column);
    const person: Person = { name, group };
    people.push(person);
    rows.push({ ...person, date: day, values });
  }
  if (people.length === 0)
    throw new ImportError('в файле промежуточных итогов нет ни одного оператора');

  // A name twice (a copy, a move between groups): `applyImport` sums the rows — say so.
  const times = new Map<string, { name: string; n: number }>();
  for (const person of people) {
    const key = normalizeName(person.name);
    const seen = times.get(key);
    if (seen) seen.n += 1;
    else times.set(key, { name: person.name, n: 1 });
  }
  const warnings = [...times.values()]
    .filter((t) => t.n > 1)
    .map(
      (t) =>
        `${t.name}: в файле ${t.n} ${plural(t.n, 'раз', 'раза', 'раз')} — показатели сложены, проверьте файл`,
    );

  return {
    profileId: p.id,
    metrics: metrics.map((m) => m.metricId),
    rows,
    period: [day, day],
    days: [day],
    groups,
    people,
    warnings,
  };
}

/** An empty cell is 0; an integer ≥ 0, also as text; anything else stops — by place, never by value. */
function count(v: unknown, row: number, letter: string): number {
  const text = cellText(v);
  if (text === '') return 0;
  const n = typeof v === 'number' ? v : /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(n) || n < 0)
    throw new ImportError(
      `строка ${row}, столбец ${letter}: нужно целое число не меньше 0 или пустая ячейка — проверьте файл`,
    );
  return n;
}

/**
 * Whether the first rows of a sheet look like this file: a group's row followed by an operator with a
 * number in one of the profile's columns.
 */
export function looksLikeList(rows: unknown[][], p: IntradayProfile): boolean {
  const code = new RegExp(p.groupCode);
  const nameCol = column(p.nameColumn);
  const cols = p.metrics.map((m) => column(m.column));
  const named = (r: unknown[] | undefined) => cellText(r?.[nameCol]) !== '';
  return rows.some((row, i) => {
    if (!code.test(cellText(row[nameCol]))) return false;
    const next = rows.slice(i + 1).find(named);
    return (
      next !== undefined &&
      !code.test(cellText(next[nameCol])) &&
      cols.some((c) => typeof next[c] === 'number' || /^\d+$/.test(cellText(next[c])))
    );
  });
}

/** The same file for another day (the admin's «День», D-55). */
export function onDay(parsed: Parsed, day: string): Parsed {
  return {
    ...parsed,
    rows: parsed.rows.map((r) => ({ ...r, date: day })),
    period: [day, day],
    days: [day],
  };
}
