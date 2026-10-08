import type { ImportLog } from '../data/schemas/records.ts';
import { evaluateAchievements } from './achievements/evaluate.ts';
import type { Unlock } from './achievements/types.ts';

export type { Unlock };
import type { Calendar } from './calendar.ts';
import { dateOf } from './dates.ts';
import { buildLeaderboard, type LeaderboardRow } from './leaderboard.ts';
import { buildTeamPlans, paceOn, type TeamPlan } from './plans.ts';
import { prepare, type EngineInput, type Prepared } from './prepare.ts';
import {
  computeTeamProgress,
  teamContributions,
  type Contribution,
  type TeamProgress,
} from './progress.ts';
import { membersOn } from './roster.ts';
import type { TimelineDay } from './timeline.ts';
import { locationIndexOf, type Track } from './track.ts';

export type TeamState = TeamProgress & {
  pacePosition: number;
  /** Cells ahead of (+) or behind (−) the pace line (FR-PACE-3). */
  deltaVsPace: number;
  locationIndex: number;
  /** Average headcount over the game (R-3) — the plan's divisor. */
  headcount: number;
  /** Operators in the team today, not fired — what the team cards show (FR-LB-3). */
  members: number;
};

export type ManagerState = LeaderboardRow & { weekly: Record<number, number> };

/** Derived state — never stored (§14). */
export type GameState = {
  today: string;
  calendar: Calendar;
  track: Track;
  teams: TeamState[];
  /** Each operator's points earned for each team (D-38): the shares of the team's points. */
  contributions: Contribution[];
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
 * The inputs as they stood on `today` (D-35). A record is seen once an import of its kind (its
 * import's profile) made by `today` covered its date — a later re-import of the same days
 * re-stamps the record but does not hide it. Adjustments made later are not seen, revokes made
 * later not applied yet. For live data this changes nothing — everything stored was made
 * already; it keeps a view of an earlier day (`?date=`, replay, the demo) true to that day.
 */
export function inputsAsOf(input: EngineInput, today: string): EngineInput {
  const imports = input.imports.filter((i) => dateOf(i.at) <= today);
  const profileOf = new Map(input.imports.map((i) => [i.id, i.profileId]));
  const ranges = new Map<string, [string, string][]>(); // profile → date ranges imported by today
  for (const i of imports)
    ranges.set(i.profileId, [...(ranges.get(i.profileId) ?? []), i.dateRange]);
  const seen = (importId: string, date: string) => {
    const profile = profileOf.get(importId);
    if (profile === undefined) return true; // not from an import we know of
    return (ranges.get(profile) ?? []).some(([from, to]) => date >= from && date <= to);
  };
  return {
    ...input,
    records: input.records.filter((r) => seen(r.importId, r.date)),
    adjustments: input.adjustments
      .filter((a) => dateOf(a.at) <= today)
      .map((a) => (a.revoked && dateOf(a.revoked.at) > today ? { ...a, revoked: undefined } : a)),
    imports,
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
  const progressInput = { ...p, asOf: today, plans, bonuses: stepBonuses };
  const teams = computeTeamProgress(progressInput).map((t) => {
    const plan = plans.get(t.teamId) as TeamPlan;
    const pace = paceOn(plan, p.calendar, today);
    return {
      ...t,
      pacePosition: pace,
      deltaVsPace: t.position - pace,
      locationIndex: locationIndexOf(p.track, t.position),
      headcount: plan.headcount,
      members: membersOn(p.config.managers, t.teamId, today).length,
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
    contributions: teamContributions(progressInput),
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
