import type { PointEntry } from './adjustments.ts';
import { eachDate } from './dates.ts';
import { buildTeamPlans, type TeamPlans } from './plans.ts';
import type { Prepared } from './prepare.ts';
import { teamProgressByDay, type TeamProgress } from './progress.ts';

export type TimelineTeam = TeamProgress & { pacePosition: number };
export type TimelineDay = { date: string; working: boolean; teams: TimelineTeam[] };

export type TimelineOptions = {
  plans?: TeamPlans;
  /** Achievement bonuses that move teams (FR-SCORE-5, `achievementBonusAffectsSteps`). */
  bonuses?: PointEntry[];
};

/**
 * Team standings and pace at the end of every finished day of the game, days off included —
 * weekend data moves teams too (team achievements, replay). Once the game is over, its last day
 * also takes the adjustments made after it, so it matches the current state (D-29).
 */
export function buildTimeline(
  prepared: Prepared,
  today: string,
  options: TimelineOptions = {},
): TimelineDay[] {
  const { config, calendar, track } = prepared;
  const plans = options.plans ?? buildTeamPlans(config, calendar, track);
  const bonuses = options.bonuses ?? [];
  const working = new Set(calendar.workingDays);
  const dates = eachDate(calendar.start, calendar.end).filter((date) => date < today);
  const lastAsOf = today > calendar.end ? today : undefined;
  const standings = teamProgressByDay({ ...prepared, plans, bonuses }, dates, lastAsOf);
  let done = 0; // working days finished by the end of the date (D-18)
  return dates.map((date, i) => {
    if (working.has(date)) done++;
    return {
      date,
      working: working.has(date),
      teams: (standings[i] ?? []).map((t) => ({
        ...t,
        pacePosition: plans.get(t.teamId)?.paceAfter[done] ?? 0,
      })),
    };
  });
}
