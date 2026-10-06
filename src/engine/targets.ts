import type { Manager, SeasonConfig } from '../data/schemas/season.ts';
import type { Calendar } from './calendar.ts';
import { workingDaysInTeam } from './roster.ts';
import { pointsOf, type MetricValues } from './scoring.ts';

/** A manager's target for one working day: daily norms × weights (R-2), else the default (D-24). */
export function dailyTargetPoints(
  manager: Manager,
  weights: MetricValues,
  defaultDailyTargetPoints: number,
): number {
  return manager.dailyNorms ? pointsOf(manager.dailyNorms, weights) : defaultDailyTargetPoints;
}

/** Points that make 100 % of the plan (FR-STEP-1): explicit, else Σ over members' days in the team (R-2). */
export function teamTargetPoints(
  teamId: string,
  config: SeasonConfig,
  calendar: Calendar,
  weights: MetricValues,
): number {
  const explicit = config.teams.find((t) => t.id === teamId)?.targetPoints;
  if (explicit !== undefined) return explicit;
  let target = 0;
  for (const m of config.managers)
    target +=
      workingDaysInTeam(m, teamId, calendar).length *
      dailyTargetPoints(m, weights, config.defaultDailyTargetPoints);
  return target;
}

/** Average headcount over the game: member working days / game working days (R-3). */
export function averageHeadcount(teamId: string, config: SeasonConfig, calendar: Calendar): number {
  let days = 0;
  for (const m of config.managers) days += workingDaysInTeam(m, teamId, calendar).length;
  return days / calendar.workingDays.length;
}
