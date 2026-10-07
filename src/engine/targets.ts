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

/** Σ over the team's members of `perDay(member)` × the working days they spent in the team. */
export function planOverDays(
  teamId: string,
  config: SeasonConfig,
  calendar: Calendar,
  perDay: (manager: Manager) => number,
): number {
  let plan = 0;
  for (const m of config.managers)
    plan += workingDaysInTeam(m, teamId, calendar).length * perDay(m);
  return plan;
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
  return planOverDays(teamId, config, calendar, (m) =>
    dailyTargetPoints(m, weights, config.defaultDailyTargetPoints),
  );
}

/** Average headcount over the game: member working days / game working days (R-3). */
export function averageHeadcount(teamId: string, config: SeasonConfig, calendar: Calendar): number {
  return planOverDays(teamId, config, calendar, () => 1) / calendar.workingDays.length;
}
