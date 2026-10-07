import type { Manager, Membership } from '../data/schemas/season.ts';
import type { Calendar } from './calendar.ts';
import { daysBetween } from './dates.ts';

const OPEN_END = '9999-12-31';

/** Memberships cut at the firing date: nobody belongs to a team after being fired (R-5). */
export function effectiveMemberships(manager: Manager): Membership[] {
  const fired = manager.firedAt;
  if (fired === undefined) return manager.memberships;
  return manager.memberships
    .filter((p) => p.from <= fired)
    .map((p) => ({ ...p, to: p.to !== undefined && p.to < fired ? p.to : fired }));
}

/**
 * Team that gets a manager's result for `date` (R-1): the membership covering the date,
 * otherwise the nearest one (a payment after firing goes to the last team, OQ-11);
 * on a tie the later membership wins.
 */
export function teamOn(manager: Manager, date: string): string {
  const effective = effectiveMemberships(manager);
  const pool = effective.length > 0 ? effective : manager.memberships;
  let best = pool[0] as Membership;
  let bestDistance = Infinity;
  for (const p of pool) {
    const to = p.to ?? OPEN_END;
    const distance =
      date < p.from ? daysBetween(date, p.from) : date > to ? daysBetween(to, date) : 0;
    if (distance <= bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best.teamId;
}

/** Working days of the game the manager spent in `teamId` (R-2, R-3). */
export function workingDaysInTeam(manager: Manager, teamId: string, calendar: Calendar): string[] {
  const periods = effectiveMemberships(manager).filter((p) => p.teamId === teamId);
  return calendar.workingDays.filter((d) =>
    periods.some((p) => d >= p.from && d <= (p.to ?? OPEN_END)),
  );
}

/** Fired managers leave the leaderboard from the firing date on (R-5, ADM-ROSTER-3). */
export function isFiredOn(manager: Manager, date: string): boolean {
  return manager.firedAt !== undefined && manager.firedAt <= date;
}

/** Working days of the game the manager spent in any team (a personal plan, D-29). */
export function workingDaysInGame(manager: Manager, calendar: Calendar): string[] {
  const periods = effectiveMemberships(manager);
  return calendar.workingDays.filter((d) =>
    periods.some((p) => d >= p.from && d <= (p.to ?? OPEN_END)),
  );
}
