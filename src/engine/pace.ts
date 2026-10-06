import type { SeasonConfig } from '../data/schemas/season.ts';
import { completedWorkingDays, type Calendar } from './calendar.ts';
import { weightsOf } from './scoring.ts';
import { dailyTargetPoints, planOverDays } from './targets.ts';
import type { Track } from './track.ts';

const EPS = 1e-9;

/** Where a team exactly on plan stands after the completed working days (FR-PACE-1, D-18). */
export function pacePosition(calendar: Calendar, track: Track, today: string): number {
  const done = completedWorkingDays(calendar, today);
  return Math.floor((done / calendar.workingDays.length) * track.trackLength + EPS);
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
  const explicit = config.teams.find((t) => t.id === teamId)?.targetPoints;
  if (config.progressMode === 'absolute' || explicit !== undefined)
    return pacePosition(calendar, track, today);
  const weights = weightsOf(config);
  const perDay =
    config.progressMode === 'per_capita'
      ? () => config.defaultDailyTargetPoints
      : (m: SeasonConfig['managers'][number]) =>
          dailyTargetPoints(m, weights, config.defaultDailyTargetPoints);
  const plan = planOverDays(teamId, config, calendar, perDay);
  if (plan <= 0) return 0;
  const accrued = planOverDays(teamId, config, calendar, perDay, today);
  return Math.floor((accrued / plan) * track.trackLength + EPS);
}
