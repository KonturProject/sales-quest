import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import {
  activeAdjustments,
  entriesBetween,
  managerPointsBetween,
  type PointEntry,
} from './adjustments.ts';
import type { Calendar } from './calendar.ts';
import { dateOf } from './dates.ts';
import { buildTeamPlans, type TeamPlan, type TeamPlans } from './plans.ts';
import { teamOn } from './roster.ts';
import { pointsOf, weightsOf, type DailySeries } from './scoring.ts';
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
  /** Built once per game by the caller (`buildTeamPlans`); built here when missing. */
  plans?: TeamPlans;
  /** Achievement bonuses that move teams (FR-SCORE-5, `achievementBonusAffectsSteps`). */
  bonuses?: PointEntry[];
};

const EPS = 1e-9;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type DayPoints = { date: string; teamId: string; managerId: string; points: number };

/**
 * Every manager-day's points with the team that gets them (FR-SCORE-4, R-1): records, point
 * corrections (D-25) and bonuses that move teams, inside the period, in date order.
 */
function teamDayPoints(input: Omit<ProgressInput, 'asOf'>): DayPoints[] {
  const { config, series } = input;
  const { start, end } = config.period;
  const weights = weightsOf(config);
  const managers = new Map(config.managers.map((m) => [m.id, m]));
  const days: DayPoints[] = [];
  for (const [managerId, byDate] of series) {
    const manager = managers.get(managerId);
    if (!manager) continue;
    for (const [date, values] of byDate)
      days.push({
        date,
        teamId: teamOn(manager, date),
        managerId,
        points: pointsOf(values, weights),
      });
  }
  const entries = [
    ...managerPointsBetween(input.adjustments, start, end),
    ...entriesBetween(input.bonuses ?? [], start, end),
  ];
  for (const e of entries) {
    const manager = managers.get(e.managerId);
    if (manager)
      days.push({
        date: e.date,
        teamId: teamOn(manager, e.date),
        managerId: e.managerId,
        points: e.value,
      });
  }
  return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Team points up to `asOf` (FR-SCORE-4, R-1): each day goes to the team the manager was in. */
/** An operator's points earned for a team (R-1, D-38). */
export type Contribution = { teamId: string; managerId: string; points: number };

/**
 * Each operator's points earned for each team up to `asOf`: the same day points as the team's,
 * so for a team they add up to its points. A transferred operator has a share in both teams.
 */
export function teamContributions(input: ProgressInput): Contribution[] {
  const sums = new Map<string, Contribution>();
  for (const d of teamDayPoints(input)) {
    if (d.date > input.asOf) continue;
    const key = `${d.teamId}|${d.managerId}`;
    const c = sums.get(key);
    if (c) c.points += d.points;
    else sums.set(key, { teamId: d.teamId, managerId: d.managerId, points: d.points });
  }
  return [...sums.values()];
}

export function teamPoints(input: ProgressInput): Map<string, number> {
  const points = new Map(input.config.teams.map((t) => [t.id, 0]));
  for (const d of teamDayPoints(input))
    if (d.date <= input.asOf) points.set(d.teamId, (points.get(d.teamId) ?? 0) + d.points);
  return points;
}

function placeFromData(plan: TeamPlan, points: number, input: ProgressInput) {
  const { config, track } = input;
  const { targetPoints } = plan;
  if (config.progressMode === 'absolute') {
    const pointsPerStep = config.pointsPerStep as number; // buildTeamPlans refuses a config without it
    return {
      targetPoints,
      progress: points / targetPoints,
      computedPosition: Math.floor(points / pointsPerStep + EPS),
    };
  }
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
  const plans = input.plans ?? buildTeamPlans(input.config, input.calendar, input.track);
  return standings(
    input,
    plans,
    teamPoints(input),
    activeAdjustments(input.adjustments, input.asOf),
  );
}

/**
 * Standings at the end of each of `dates` (ascending) — the timeline. Same result as
 * `computeTeamProgress` per date, but the day points and the adjustments are gathered once.
 * `lastAsOf` — a later day whose adjustments the last date also takes (the end of a finished
 * game takes the corrections made after it, as the current state does).
 */
export function teamProgressByDay(
  input: Omit<ProgressInput, 'asOf'>,
  dates: string[],
  lastAsOf?: string,
): TeamProgress[][] {
  const last = dates[dates.length - 1];
  if (last === undefined) return [];
  const cutoff = lastAsOf !== undefined && lastAsOf > last ? lastAsOf : last;
  const plans = input.plans ?? buildTeamPlans(input.config, input.calendar, input.track);
  const days = teamDayPoints(input);
  const adjustments = activeAdjustments(input.adjustments, cutoff).map((a) => ({
    a,
    day: dateOf(a.at),
  }));
  const points = new Map(input.config.teams.map((t) => [t.id, 0]));
  let next = 0;
  return dates.map((date, i) => {
    for (let d = days[next]; d !== undefined && d.date <= date; d = days[++next])
      points.set(d.teamId, (points.get(d.teamId) ?? 0) + d.points);
    const until = i === dates.length - 1 ? cutoff : date;
    const inForce = adjustments.filter((x) => x.day <= until).map((x) => x.a);
    return standings({ ...input, asOf: date }, plans, points, inForce);
  });
}

function standings(
  input: ProgressInput,
  plans: TeamPlans,
  points: Map<string, number>,
  adjustments: Adjustment[],
): TeamProgress[] {
  return [...input.config.teams]
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const teamPointsValue = points.get(team.id) ?? 0;
      const plan = plans.get(team.id) as TeamPlan; // plans cover every team of the config
      const place = placeFromData(plan, teamPointsValue, input);
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
