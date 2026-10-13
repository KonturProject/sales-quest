import { looksLikeList } from './intraday.ts';
import { headerRowIndex } from './payments.ts';
import type { ImportProfile } from './profiles.ts';

/**
 * Which kind of export a file is (plan 2a): the funnel by its sheet's name, the paid invoices by the
 * date and invoice headers in the first rows of their sheet (the header's row varies between exports),
 * the intraday totals by a group's row followed by an operator with a number (D-55); the kinds are tried
 * in this order whatever the order of the profiles.
 * `firstRows` gives the first rows of a sheet (its name or index). Null: not an export the game knows.
 */
export function detectProfile(
  sheets: string[],
  firstRows: (sheet: string | number) => unknown[][],
  profiles: ImportProfile[],
): ImportProfile | null {
  for (const p of profiles) if (p.kind === 'matrix' && sheets.includes(p.sheet)) return p;
  for (const p of profiles)
    if (p.kind === 'events' && headerRowIndex(firstRows(p.sheet), p) !== null) return p;
  for (const p of profiles) if (p.kind === 'list' && looksLikeList(firstRows(p.sheet), p)) return p;
  return null;
}
