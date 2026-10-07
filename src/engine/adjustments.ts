import type { Adjustment } from '../data/schemas/records.ts';
import { dateOf } from './dates.ts';

export type ManagerPoints = Extract<Adjustment, { type: 'manager_points' }>;

/**
 * Points for a manager's day beyond the metric records: a point correction (D-25) or an
 * achievement bonus (FR-SCORE-5). Both count for their day, like records.
 */
export type PointEntry = { managerId: string; date: string; value: number };

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
): PointEntry[] {
  const entries: PointEntry[] = [];
  for (const a of adjustments)
    if (a.type === 'manager_points' && !a.revoked)
      entries.push({ managerId: a.managerId, date: pointsDateOf(a), value: a.value });
  return entriesBetween(entries, from, to);
}

export function entriesBetween(entries: PointEntry[], from: string, to: string): PointEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to);
}
