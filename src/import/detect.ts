import { headerRowIndex } from './payments.ts';
import type { ImportProfile } from './profiles.ts';

/**
 * Which kind of export a file is (plan 2a): the funnel by its sheet's name, the paid invoices by the
 * date and invoice headers in the first rows of their sheet (the header's row varies between exports).
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
  return null;
}
