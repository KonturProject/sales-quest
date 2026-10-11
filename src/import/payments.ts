import { eachDate } from '../engine/dates.ts';
import { plural } from '../text.ts';
import { ImportError, cellDate, cellText, type Grid } from './grid.ts';
import type { Parsed, ParsedRow, Person } from './parsed.ts';
import type { PaymentsProfile } from './profiles.ts';

/** How far down a sheet its header may be: the October export has two lines above it (11.10.2026). */
export const HEADER_SEARCH_ROWS = 20;

/**
 * The 0-based row of the header: the first, from the profile's `headerRow` on, with the titles of the
 * date and the invoice number — by content, not by number, as the exports' lines above it vary.
 */
export function headerRowIndex(rows: unknown[][], p: PaymentsProfile): number | null {
  const end = Math.min(rows.length, p.headerRow - 1 + HEADER_SEARCH_ROWS);
  for (let r = p.headerRow - 1; r < end; r++) {
    const cells = (rows[r] ?? []).map(cellText);
    if (cells.includes(p.columns.date) && cells.includes(p.columns.invoice)) return r;
  }
  return null;
}

/**
 * The paid invoices (`docs/IMPORT_FORMATS.md` §2): one invoice number is one payment, on the day and
 * by the author of its first counted line; excluded product types (`Академия`) are not counted.
 * Only author, group and day leave this function — clients, INN, sums and invoice numbers stay in
 * the file (SEC-10).
 */
export function parsePayments(grid: Grid, p: PaymentsProfile): Parsed {
  const at = headerRowIndex(grid, p);
  if (at === null)
    throw new ImportError(
      `в выгрузке оплат не нашлась строка заголовков с «${p.columns.date}» и «${p.columns.invoice}» ` +
        `в первых ${HEADER_SEARCH_ROWS} строках — проверьте, тот ли это файл`,
    );
  const header = grid[at] ?? [];
  const index = (title: string) => {
    const i = header.findIndex((h) => cellText(h) === title);
    if (i < 0) throw new ImportError(`в выгрузке оплат нет колонки «${title}» (строка ${at + 1})`);
    return i;
  };
  const c = {
    date: index(p.columns.date),
    author: index(p.columns.author),
    group: index(p.columns.group),
    invoice: index(p.columns.invoice),
    product: index(p.columns.product),
  };
  const excluded = new Set(p.excludeProducts);
  const code = new RegExp(p.groupCode);

  type Invoice = Person & { date: string; mixed: boolean };
  const invoices = new Map<string, Invoice>();
  const undated = new Set<string>();
  for (let i = at + 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const date = cellDate(line[c.date]);
    const name = cellText(line[c.author]);
    const number = cellText(line[c.invoice]);
    // The final «Сумма заказа» row and empty lines have no author or number.
    if (!name || !number || excluded.has(cellText(line[c.product]))) continue;
    if (!date) {
      undated.add(number);
      continue;
    }
    const seen = invoices.get(number);
    if (seen) {
      if (seen.name !== name || seen.date !== date) seen.mixed = true;
      continue;
    }
    const group = cellText(line[c.group]);
    invoices.set(number, {
      name,
      group: code.exec(group)?.[0] ?? (group || null),
      date,
      mixed: false,
    });
  }
  if (invoices.size === 0) throw new ImportError('в выгрузке нет ни одной оплаты');

  const counts = new Map<string, ParsedRow>();
  const people = new Map<string, Person>();
  for (const inv of invoices.values()) {
    const key = `${inv.name}|${inv.date}`;
    const row = counts.get(key);
    if (row) row.values[p.metricId] = (row.values[p.metricId] ?? 0) + 1;
    else
      counts.set(key, {
        name: inv.name,
        group: inv.group,
        date: inv.date,
        values: { [p.metricId]: 1 },
      });
    if (!people.has(inv.name)) people.set(inv.name, { name: inv.name, group: inv.group });
  }
  const rows = [...counts.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ru'),
  );
  const dates = rows.map((r) => r.date).sort();
  const from = dates[0] as string;
  const to = dates[dates.length - 1] as string;
  const mixed = [...invoices.values()].filter((i) => i.mixed).length;
  const warnings: string[] = [];
  if (mixed > 0)
    warnings.push(
      `${mixed} ${plural(mixed, 'счёт', 'счёта', 'счетов')} с разными авторами или датами в строках — посчитаны по первой строке`,
    );
  // A second line of a counted invoice may have no date; an invoice with none on any line is lost.
  const lost = [...undated].filter((n) => !invoices.has(n)).length;
  if (lost > 0)
    warnings.push(
      `${lost} ${plural(lost, 'счёт', 'счёта', 'счетов')} без читаемой даты оплаты — не посчитаны`,
    );
  return {
    profileId: p.id,
    metrics: [p.metricId],
    rows,
    period: [from, to],
    days: eachDate(from, to),
    groups: [...new Set([...invoices.values()].flatMap((i) => (i.group ? [i.group] : [])))],
    people: [...people.values()],
    warnings,
  };
}
