import type { ImportLog } from '../data/schemas/records.ts';
import { evaluateAchievements } from './achievements/evaluate.ts';
import type { Unlock } from './achievements/types.ts';

export type { Unlock };
import type { Calendar } from './calendar.ts';
import { dateOf } from './dates.ts';
import { buildLeaderboard, type LeaderboardRow } from './leaderboard.ts';
import { buildTeamPlans, paceOn, type TeamPlan } from './plans.ts';
import { prepare, type EngineInput, type Prepared } from './prepare.ts';
import { computeTeamProgress, type TeamProgress } from './progress.ts';
import type { TimelineDay } from './timeline.ts';
import { locationIndexOf, type Track } from './track.ts';

export type TeamState = TeamProgress & {
  pacePosition: number;
  /** Cells ahead of (+) or behind (−) the pace line (FR-PACE-3). */
  deltaVsPace: number;
  locationIndex: number;
  headcount: number;
};

export type ManagerState = LeaderboardRow & { weekly: Record<number, number> };

/** Derived state — never stored (§14). */
export type GameState = {
  today: string;
  calendar: Calendar;
  track: Track;
  teams: TeamState[];
  managers: ManagerState[];
  /** Achievements earned so far, oldest first (ACH-1). */
  unlocks: Unlock[];
  /** Team standings at the end of every completed working day (team achievements, replay). */
  timeline: TimelineDay[];
  dataAsOf: string | null;
  warnings: string[];
};

/** The whole game state from the stored inputs (ARCH-2, ARCH-3); `now` is a local timestamp (D-11). */
export function computeGameState(input: EngineInput, now: string): GameState {
  const today = dateOf(now);
  return computeGameStateFrom(prepare(inputsAsOf(input, today)), today);
}

/**
 * The inputs as they stood on `today` (D-35): records of later imports and adjustments made later
 * are not seen yet. For live data this changes nothing — everything stored was made already; it
 * keeps a view of an earlier day (`?date=`, replay, the demo) true to that day.
 */
export function inputsAsOf(input: EngineInput, today: string): EngineInput {
  const later = new Set(input.imports.filter((i) => dateOf(i.at) > today).map((i) => i.id));
  return {
    ...input,
    records: later.size > 0 ? input.records.filter((r) => !later.has(r.importId)) : input.records,
    adjustments: input.adjustments.filter((a) => dateOf(a.at) <= today),
    imports: input.imports.filter((i) => dateOf(i.at) <= today),
  };
}

/**
 * The game state from already prepared inputs on `today` (taken as of that day, `inputsAsOf`).
 * Order (D-29): manager achievements → their bonuses → team positions and the timeline → team
 * achievements.
 */
export function computeGameStateFrom(p: Prepared, today: string): GameState {
  const plans = buildTeamPlans(p.config, p.calendar, p.track);
  const achievements = evaluateAchievements(p, today, plans);
  const { bonuses } = achievements;
  const stepBonuses = p.config.achievementBonusAffectsSteps ? bonuses : [];
  const teams = computeTeamProgress({ ...p, asOf: today, plans, bonuses: stepBonuses }).map((t) => {
    const plan = plans.get(t.teamId) as TeamPlan;
    const pace = paceOn(plan, p.calendar, today);
    return {
      ...t,
      pacePosition: pace,
      deltaVsPace: t.position - pace,
      locationIndex: locationIndexOf(p.track, t.position),
      headcount: plan.headcount,
    };
  });

  const board = (from: string, to: string) => buildLeaderboard({ ...p, from, to, today, bonuses });
  const weeks = p.calendar.weeks.map((w) => ({
    index: w.index,
    points: new Map(board(w.start, w.end).map((r) => [r.managerId, r.points])),
  }));
  const managers = board(p.calendar.start, p.calendar.end).map((row) => ({
    ...row,
    weekly: Object.fromEntries(weeks.map((w) => [w.index, w.points.get(row.managerId) ?? 0])),
  }));

  const warnings = [...p.warnings, ...achievements.warnings];
  for (const t of teams)
    if (p.config.progressMode !== 'absolute' && t.targetPoints === 0 && t.headcount > 0)
      warnings.push(`у команды ${t.teamId} план 0 баллов — фигурка не сдвинется`);

  return {
    today,
    calendar: p.calendar,
    track: p.track,
    teams,
    managers,
    unlocks: achievements.unlocks,
    timeline: achievements.timeline,
    dataAsOf: latestImport(p.imports, today),
    warnings,
  };
}

/** The latest import made by `today` (FR-LB-4): a view of an earlier day shows that day's data. */
function latestImport(imports: ImportLog[], today: string): string | null {
  let latest: string | null = null;
  for (const i of imports)
    if (dateOf(i.at) <= today && (latest === null || Date.parse(i.at) > Date.parse(latest)))
      latest = i.at;
  return latest;
}
