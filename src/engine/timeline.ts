import type { PointEntry } from './adjustments.ts';
import { buildTeamPlans, type TeamPlans } from './plans.ts';
import type { Prepared } from './prepare.ts';
import { teamProgressByDay, type TeamProgress } from './progress.ts';

export type TimelineTeam = TeamProgress & { pacePosition: number };
export type TimelineDay = { date: string; teams: TimelineTeam[] };

export type TimelineOptions = {
  plans?: TeamPlans;
  /** Achievement bonuses that move teams (FR-SCORE-5, `achievementBonusAffectsSteps`). */
  bonuses?: PointEntry[];
};

/** Team standings and pace at the end of every completed working day (team achievements, replay). */
export function buildTimeline(
  prepared: Prepared,
  today: string,
  options: TimelineOptions = {},
): TimelineDay[] {
  const { config, calendar, track } = prepared;
  const plans = options.plans ?? buildTeamPlans(config, calendar, track);
  const bonuses = options.bonuses ?? [];
  const dates = calendar.workingDays.filter((date) => date < today);
  return teamProgressByDay({ ...prepared, plans, bonuses }, dates).map((teams, i) => ({
    date: dates[i] as string,
    // The pace at the end of the (i + 1)-th working day: it and every day before it are done.
    teams: teams.map((t) => ({ ...t, pacePosition: plans.get(t.teamId)?.paceAfter[i + 1] ?? 0 })),
  }));
}
