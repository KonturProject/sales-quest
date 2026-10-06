import type { Adjustment } from '../data/schemas/records.ts';
import { dateOf } from './dates.ts';

export type ManagerPoints = Extract<Adjustment, { type: 'manager_points' }>;

/** Adjustments in force on `asOf` (ADM-1, ADM-UNDO): not revoked, made on or before that date, oldest first. */
export function activeAdjustments(adjustments: Adjustment[], asOf: string): Adjustment[] {
  return adjustments
    .filter((a) => !a.revoked && dateOf(a.at) <= asOf)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The day a point correction belongs to (D-25): its `date`, else the day it was made. */
export function pointsDateOf(a: ManagerPoints): string {
  return a.date ?? dateOf(a.at);
}

/** Point corrections in force for the days [from, to]: like records, they count by the day they are for. */
export function managerPointsBetween(
  adjustments: Adjustment[],
  from: string,
  to: string,
): ManagerPoints[] {
  return adjustments.filter(
    (a): a is ManagerPoints =>
      a.type === 'manager_points' && !a.revoked && pointsDateOf(a) >= from && pointsDateOf(a) <= to,
  );
}
