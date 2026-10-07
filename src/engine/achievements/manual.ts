import type { Adjustment } from '../../data/schemas/records.ts';
import { activeAdjustments } from '../adjustments.ts';
import { dateOf } from '../dates.ts';

export type Grant = Extract<Adjustment, { type: 'grant_achievement' }>;
export type Revoke = Extract<Adjustment, { type: 'revoke_achievement' }>;

export type ManualActions = { grants: Grant[]; revokes: Revoke[] };

/** Grants and revokes in force today (ACH-2, ACH-3), oldest first. */
export function manualActions(adjustments: Adjustment[], today: string): ManualActions {
  const grants: Grant[] = [];
  const revokes: Revoke[] = [];
  for (const a of activeAdjustments(adjustments, today))
    if (a.type === 'grant_achievement') grants.push(a);
    else if (a.type === 'revoke_achievement') revokes.push(a);
  return { grants, revokes };
}

/** The day a grant or revoke is for (D-29): its `date`, else the day it was made. */
export function actionDateOf(a: Grant | Revoke): string {
  return a.date ?? dateOf(a.at);
}

export const subjectOf = (a: { managerId?: string; teamId?: string }) =>
  a.managerId ?? a.teamId ?? '';
