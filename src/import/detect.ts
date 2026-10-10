import { cellText } from './grid.ts';
import type { ImportProfile } from './profiles.ts';

/**
 * Which kind of export a file is (plan 2a): the funnel by its sheet's name, the paid invoices by the
 * date and invoice headers of their sheet. `firstRow` reads the header row of a sheet (its name or
 * index) — so only that row is read, not the whole book. Null: not an export the game knows.
 */
export function detectProfile(
  sheets: string[],
  firstRow: (sheet: string | number) => unknown[],
  profiles: ImportProfile[],
): ImportProfile | null {
  for (const p of profiles) if (p.kind === 'matrix' && sheets.includes(p.sheet)) return p;
  for (const p of profiles) {
    if (p.kind !== 'events') continue;
    const headers = firstRow(p.sheet).map(cellText);
    if (headers.includes(p.columns.date) && headers.includes(p.columns.invoice)) return p;
  }
  return null;
}
