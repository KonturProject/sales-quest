import {
  ImportError,
  cellDate,
  cellNumber,
  cellText,
  column,
  dayMonth,
  type Grid,
} from './grid.ts';
import type { Parsed, ParsedRow, Person } from './parsed.ts';
import type { FunnelProfile } from './profiles.ts';

/** More mismatches than this are summed up in one line: the admin needs the sign, not a list. */
const MAX_CHECK_WARNINGS = 10;

type MetricColumns = { metricId: string; title: string; cols: { col: number; date: string }[] };

/**
 * The funnel by days (D-19, `docs/IMPORT_FORMATS.md` §1): blocks and sub-blocks found by their names,
 * never by letters — a block added to the export shifts every column; employees with the group above
 * them; an empty cell is 0. The groups' rows and the department's total check the employees' sums.
 */
export function parseFunnel(grid: Grid, p: FunnelProfile): Parsed {
  const row = (n: number) => grid[n - 1] ?? [];
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
  const nameCol = column(p.nameColumn);
  const blocks = row(p.blockRow);
  const subs = row(p.subBlockRow);
  const datesRow = row(p.dateRow);
  const starts = (line: unknown[], from: number, to: number) => {
    const out: number[] = [];
    for (let c = from; c < to; c++) if (cellText(line[c])) out.push(c);
    return out;
  };

  const blockStarts = starts(blocks, nameCol + 1, width);
  const metrics: MetricColumns[] = p.metrics.map((m) => {
    const b = blockStarts.findIndex((c) => cellText(blocks[c]) === m.block);
    if (b < 0)
      throw new ImportError(
        `в воронке нет блока «${m.block}» (строка ${p.blockRow}) — формат выгрузки изменился, сообщите разработчику`,
      );
    const from = blockStarts[b] as number;
    const to = blockStarts[b + 1] ?? width;
    const subStarts = starts(subs, from, to);
    const s = subStarts.findIndex((c) => cellText(subs[c]) === m.subBlock);
    if (s < 0)
      throw new ImportError(
        `в блоке «${m.block}» нет подблока «${m.subBlock}» (строка ${p.subBlockRow})`,
      );
    const cols: MetricColumns['cols'] = [];
    for (let c = subStarts[s] as number; c < (subStarts[s + 1] ?? to); c++) {
      const date = cellDate(datesRow[c]);
      if (date) cols.push({ col: c, date }); // week totals are text: skipped
    }
    if (cols.length === 0)
      throw new ImportError(`в подблоке «${m.subBlock}» нет дат (строка ${p.dateRow})`);
    return { metricId: m.metricId, title: m.block, cols };
  });
  const at = (line: unknown[], m: MetricColumns, date: string) => {
    const c = m.cols.find((x) => x.date === date);
    return c ? cellNumber(line[c.col]) : 0;
  };
  // The file's days: those the department has a number on (review 2a). An export taken mid-month
  // has the days ahead as columns of 0 — zero-filled, they would wipe the numbers a newer file gave.
  const total = row(p.totalRow);
  const dates = [...new Set(metrics.flatMap((m) => m.cols.map((c) => c.date)))]
    .sort()
    .filter((date) => metrics.some((m) => at(total, m, date) !== 0));
  if (dates.length === 0)
    throw new ImportError(
      `в воронке нет ни одного дня с данными: «Общий итог» (строка ${p.totalRow}) пуст или нулевой`,
    );

  const groupFlag = column(p.groupFlag);
  const employeeFlag = column(p.employeeFlag);
  const code = new RegExp(p.groupCode);
  type Group = { label: string; code: string | null; line: unknown[]; sums: Map<string, number> };
  const groups: Group[] = [];
  const people: Person[] = [];
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let group: Group | null = null;
  for (let i = p.firstDataRow - 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const name = cellText(line[nameCol]);
    if (cellNumber(line[groupFlag]) === 1) {
      const found = code.exec(name)?.[0] ?? null;
      if (!found) warnings.push(`у группы «${name}» нет кода команды — её операторы без команды`);
      group = { label: found ?? name, code: found, line, sums: new Map() };
      groups.push(group);
      continue;
    }
    // The tail of the pivot (A, B, C = 0, no name) and anything else: not a person.
    if (cellNumber(line[employeeFlag]) !== 1 || !name) continue;
    const person: Person = { name, group: group?.code ?? null };
    people.push(person);
    for (const date of dates) {
      const values: Record<string, number> = {};
      for (const m of metrics) {
        const v = at(line, m, date);
        if (v < 0)
          throw new ImportError(
            `в воронке отрицательное число: ${name}, ${dayMonth(date)}, «${m.title}» — в выгрузке такого быть не должно, проверьте файл`,
          );
        values[m.metricId] = v;
        if (group) {
          const key = `${m.metricId}|${date}`;
          group.sums.set(key, (group.sums.get(key) ?? 0) + v);
        }
      }
      rows.push({ ...person, date, values });
    }
  }

  // The self-check: employees against their group's row, groups against the department's total.
  const mismatches: string[] = [];
  for (const m of metrics)
    for (const date of dates) {
      let groupsSum = 0;
      for (const g of groups) {
        const own = at(g.line, m, date);
        groupsSum += own;
        const people = g.sums.get(`${m.metricId}|${date}`) ?? 0;
        if (people !== own)
          mismatches.push(
            `${g.label}, ${dayMonth(date)}, «${m.title}»: сотрудники ${people}, итог группы ${own}`,
          );
      }
      const all = at(total, m, date);
      if (groups.length > 0 && groupsSum !== all)
        mismatches.push(
          `весь отдел, ${dayMonth(date)}, «${m.title}»: группы ${groupsSum}, общий итог ${all}`,
        );
    }
  warnings.push(...mismatches.slice(0, MAX_CHECK_WARNINGS));
  if (mismatches.length > MAX_CHECK_WARNINGS)
    warnings.push(`и ещё ${mismatches.length - MAX_CHECK_WARNINGS} расхождений с итогами воронки`);

  return {
    profileId: p.id,
    metrics: metrics.map((m) => m.metricId),
    rows,
    period: [dates[0] as string, dates[dates.length - 1] as string],
    days: dates,
    groups: [...new Set(groups.flatMap((g) => (g.code ? [g.code] : [])))],
    people,
    warnings,
  };
}
