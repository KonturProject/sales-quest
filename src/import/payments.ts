import { plural } from '../text.ts';
import { ImportError, cellDate, cellText, type Grid } from './grid.ts';
import type { Parsed, ParsedRow, Person } from './parsed.ts';
import type { PaymentsProfile } from './profiles.ts';

/**
 * The paid invoices (`docs/IMPORT_FORMATS.md` §2): one invoice number is one payment, on the day and
 * by the author of its first counted line; excluded product types (`Академия`) are not counted.
 * Only author, group and day leave this function — clients, INN, sums and invoice numbers stay in
 * the file (SEC-10).
 */
export function parsePayments(grid: Grid, p: PaymentsProfile): Parsed {
  const header = grid[p.headerRow - 1] ?? [];
  const index = (title: string) => {
    const i = header.findIndex((h) => cellText(h) === title);
    if (i < 0)
      throw new ImportError(`в выгрузке оплат нет колонки «${title}» (строка ${p.headerRow})`);
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
  for (let i = p.headerRow; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const date = cellDate(line[c.date]);
    const name = cellText(line[c.author]);
    const number = cellText(line[c.invoice]);
    // The final «Сумма заказа» row and empty lines have no date or author.
    if (!date || !name || !number || excluded.has(cellText(line[c.product]))) continue;
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
  const dates = rows.map((r) => r.date);
  const mixed = [...invoices.values()].filter((i) => i.mixed).length;
  const warnings =
    mixed > 0
      ? [
          `${mixed} ${plural(mixed, 'счёт', 'счёта', 'счетов')} с разными авторами или датами в строках — посчитаны по первой строке`,
        ]
      : [];
  return {
    profileId: p.id,
    metrics: [p.metricId],
    rows,
    period: [dates[0] as string, dates[dates.length - 1] as string],
    groups: [...new Set([...invoices.values()].flatMap((i) => (i.group ? [i.group] : [])))],
    people: [...people.values()],
    warnings,
  };
}
