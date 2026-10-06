import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import { activeAdjustments, managerPointsBetween, pointsDateOf } from './adjustments.ts';
import type { Calendar } from './calendar.ts';
import { teamOn } from './roster.ts';
import { pointsOf, weightsOf, type DailySeries } from './scoring.ts';
import { averageHeadcount, teamTargetPoints } from './targets.ts';
import type { Track } from './track.ts';

export type TeamProgress = {
  teamId: string;
  points: number;
  targetPoints: number;
  progress: number;
  /**
   * Position from the data alone, before the track's limits: it may exceed the overflow zone.
   * A reset stores this value (D-17), so a team stopped at the end of the zone still moves on.
   */
  computedPosition: number;
  /** Position after admin steps and resets — where the figure stands. */
  position: number;
};

export type ProgressInput = {
  config: SeasonConfig;
  calendar: Calendar;
  track: Track;
  series: DailySeries;
  adjustments: Adjustment[];
  asOf: string;
};

const EPS = 1e-9;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Team points up to `asOf` (FR-SCORE-4, R-1): each day goes to the team the manager was in. */
export function teamPoints(input: ProgressInput): Map<string, number> {
  const { config, series, asOf } = input;
  const weights = weightsOf(config);
  const points = new Map(config.teams.map((t) => [t.id, 0]));
  const managers = new Map(config.managers.map((m) => [m.id, m]));
  const add = (teamId: string, value: number) =>
    points.set(teamId, (points.get(teamId) ?? 0) + value);
  for (const [managerId, days] of series) {
    const manager = managers.get(managerId);
    if (!manager) continue;
    for (const [date, values] of days)
      if (date <= asOf) add(teamOn(manager, date), pointsOf(values, weights));
  }
  const until = asOf < config.period.end ? asOf : config.period.end;
  for (const a of managerPointsBetween(input.adjustments, config.period.start, until)) {
    const manager = managers.get(a.managerId);
    if (manager) add(teamOn(manager, pointsDateOf(a)), a.value);
  }
  return points;
}

function placeFromData(team: Team, points: number, input: ProgressInput) {
  const { config, calendar, track } = input;
  if (config.progressMode === 'absolute') {
    if (config.pointsPerStep === undefined) throw new Error('режим absolute требует pointsPerStep');
    const targetPoints = config.pointsPerStep * track.trackLength;
    return {
      targetPoints,
      progress: points / targetPoints,
      computedPosition: Math.floor(points / config.pointsPerStep + EPS),
    };
  }
  const targetPoints =
    config.progressMode === 'per_capita'
      ? averageHeadcount(team.id, config, calendar) *
        config.defaultDailyTargetPoints *
        calendar.workingDays.length
      : teamTargetPoints(team.id, config, calendar, weightsOf(config));
  const progress = targetPoints > 0 ? points / targetPoints : 0;
  return {
    targetPoints,
    progress,
    computedPosition: Math.floor(progress * track.trackLength + EPS),
  };
}

/** Admin steps and resets in time order on top of the computed position (FR-STEP-3, D-17). */
function adjustedPosition(
  teamId: string,
  computed: number,
  adjustments: Adjustment[],
  max: number,
): number {
  let removed = 0;
  let steps = 0;
  for (const a of adjustments) {
    if (a.type === 'team_reset' && a.teamId === teamId) {
      removed = a.value;
      steps = 0;
    } else if (a.type === 'season_reset') {
      removed = a.value[teamId] ?? 0;
      steps = 0;
    } else if (a.type === 'team_steps' && a.teamId === teamId) {
      steps += a.value;
    }
  }
  return clamp(computed - removed + steps, 0, max);
}

/** Progress and track position of every team on `asOf` (FR-STEP-1…3, D-17, D-24). */
export function computeTeamProgress(input: ProgressInput): TeamProgress[] {
  const points = teamPoints(input);
  const adjustments = activeAdjustments(input.adjustments, input.asOf);
  return [...input.config.teams]
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const teamPointsValue = points.get(team.id) ?? 0;
      const place = placeFromData(team, teamPointsValue, input);
      return {
        teamId: team.id,
        points: teamPointsValue,
        ...place,
        position: adjustedPosition(
          team.id,
          place.computedPosition,
          adjustments,
          input.track.maxPosition,
        ),
      };
    });
}
