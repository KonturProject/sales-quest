import type { Adjustment } from '../data/schemas/records.ts';
import { dateOf } from './dates.ts';

/** Adjustments in force on `asOf` (ADM-1, ADM-UNDO): not revoked, made on or before that date, oldest first. */
export function activeAdjustments(adjustments: Adjustment[], asOf: string): Adjustment[] {
  return adjustments
    .filter((a) => !a.revoked && dateOf(a.at) <= asOf)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
