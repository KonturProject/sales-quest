import type { Adjustment } from '../../data/schemas/records.ts';
import { activeAdjustments } from '../adjustments.ts';
import { dateOf } from '../dates.ts';

type Grant = Extract<Adjustment, { type: 'grant_achievement' }>;
type Revoke = Extract<Adjustment, { type: 'revoke_achievement' }>;

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

export const subjectOf = (a: { managerId?: string; teamId?: string }) =>
  a.managerId ?? a.teamId ?? '';

/**
 * Whether a revoke takes an unlock back (D-29): everything earned up to the day of the revoke,
 * auto by its data day, manual by the moment of the grant — a grant after the revoke stands.
 */
export function revokedBy(
  revokes: Revoke[],
  unlock: { subject: string; unlockedAt: string; grantedAt?: string },
): boolean {
  return revokes.some((r) =>
    subjectOf(r) !== unlock.subject
      ? false
      : unlock.grantedAt !== undefined
        ? Date.parse(unlock.grantedAt) <= Date.parse(r.at)
        : unlock.unlockedAt <= dateOf(r.at),
  );
}
