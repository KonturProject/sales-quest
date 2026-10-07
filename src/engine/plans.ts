import type { Manager, SeasonConfig } from '../data/schemas/season.ts';
import { completedWorkingDays, type Calendar } from './calendar.ts';
import { workingDaysInTeam } from './roster.ts';
import { weightsOf } from './scoring.ts';
import { averageHeadcount, dailyTargetPoints, teamTargetPoints } from './targets.ts';
import type { Track } from './track.ts';

const EPS = 1e-9;

/** A team's plan for the whole game: it does not change from day to day, so it is built once. */
export type TeamPlan = {
  teamId: string;
  /** Points that make 100 % of the plan (FR-STEP-1, R-2); absolute mode — pointsPerStep × track. */
  targetPoints: number;
  /** Average headcount over the game (R-3). */
  headcount: number;
  /** Pace position after k completed working days, k = 0…workingDays (FR-PACE-1, D-26). */
  paceAfter: number[];
};

export type TeamPlans = Map<string, TeamPlan>;

/** Targets, headcounts and pace lines of every team (D-24, D-26, R-2, R-3). */
export function buildTeamPlans(config: SeasonConfig, calendar: Calendar, track: Track): TeamPlans {
  const weights = weightsOf(config);
  const days = calendar.workingDays.length;
  const dayIndex = new Map(calendar.workingDays.map((d, i) => [d, i]));
  const perDay =
    config.progressMode === 'per_capita'
      ? () => config.defaultDailyTargetPoints
      : (m: Manager) => dailyTargetPoints(m, weights, config.defaultDailyTargetPoints);
  const line = (share: (k: number) => number) =>
    Array.from({ length: days + 1 }, (_, k) => Math.floor(share(k) * track.trackLength + EPS));
  const commonLine = line((k) => k / days);

  return new Map(
    config.teams.map((team) => {
      const headcount = averageHeadcount(team.id, config, calendar);
      let targetPoints: number;
      if (config.progressMode === 'absolute') {
        if (config.pointsPerStep === undefined)
          throw new Error('режим absolute требует pointsPerStep');
        targetPoints = config.pointsPerStep * track.trackLength;
      } else if (config.progressMode === 'per_capita') {
        targetPoints = headcount * config.defaultDailyTargetPoints * days;
      } else {
        targetPoints = teamTargetPoints(team.id, config, calendar, weights);
      }

      // Explicit team plans and absolute mode accrue evenly — the common line (D-26).
      let paceAfter = commonLine;
      if (config.progressMode !== 'absolute' && team.targetPoints === undefined) {
        // Plan of each working day, then running totals: accrued[k] — the plan of the first k days.
        const daily = new Array<number>(days).fill(0);
        for (const m of config.managers)
          for (const d of workingDaysInTeam(m, team.id, calendar)) {
            const i = dayIndex.get(d) ?? 0;
            daily[i] = (daily[i] ?? 0) + perDay(m);
          }
        const accrued = [0];
        for (const value of daily) accrued.push((accrued[accrued.length - 1] ?? 0) + value);
        const total = accrued[days] ?? 0;
        paceAfter = total > 0 ? line((k) => (accrued[k] ?? 0) / total) : line(() => 0);
      }
      return [team.id, { teamId: team.id, targetPoints, headcount, paceAfter }];
    }),
  );
}

/** Where the team's pace line stands on `today` (D-18: completed working days only). */
export function paceOn(plan: TeamPlan, calendar: Calendar, today: string): number {
  return plan.paceAfter[completedWorkingDays(calendar, today)] ?? 0;
}

/**
 * A team's own pace line (FR-PACE-1, OQ-21): the share of its plan accrued over the completed
 * working days. With a constant roster it equals the common line; a newcomer's norm only starts
 * accruing from their first day, so hiring mid-game does not make the team look behind.
 * Explicit team plans and absolute mode accrue evenly — they use the common line.
 */
export function teamPacePosition(
  teamId: string,
  config: SeasonConfig,
  calendar: Calendar,
  track: Track,
  today: string,
): number {
  const plan = buildTeamPlans(config, calendar, track).get(teamId);
  return plan ? paceOn(plan, calendar, today) : 0;
}
