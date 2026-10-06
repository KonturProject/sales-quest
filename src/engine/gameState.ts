import type { ImportLog } from '../data/schemas/records.ts';
import type { Calendar } from './calendar.ts';
import { dateOf } from './dates.ts';
import { buildLeaderboard, type LeaderboardRow } from './leaderboard.ts';
import { pacePosition } from './pace.ts';
import { prepare, type EngineInput } from './prepare.ts';
import { computeTeamProgress, type TeamProgress } from './progress.ts';
import { averageHeadcount } from './targets.ts';
import { locationIndexOf, type Track } from './track.ts';

/** An achievement earned (ACH-1); filled by plan 1b. */
export type Unlock = {
  achievementId: string;
  managerId?: string;
  teamId?: string;
  unlockedAt: string;
  source: 'auto' | 'manual';
};

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
  unlocks: Unlock[];
  dataAsOf: string | null;
  warnings: string[];
};

/** The whole game state from the stored inputs (ARCH-2, ARCH-3); `now` is a local timestamp (D-11). */
export function computeGameState(input: EngineInput, now: string): GameState {
  const today = dateOf(now);
  const p = prepare(input);
  const pace = pacePosition(p.calendar, p.track, today);
  const teams = computeTeamProgress({ ...p, asOf: today }).map((t) => ({
    ...t,
    pacePosition: pace,
    deltaVsPace: t.position - pace,
    locationIndex: locationIndexOf(p.track, t.position),
    headcount: averageHeadcount(t.teamId, p.config, p.calendar),
  }));

  const board = (from: string, to: string) => buildLeaderboard({ ...p, from, to, today });
  const weeks = p.calendar.weeks.map((w) => ({
    index: w.index,
    points: new Map(board(w.start, w.end).map((r) => [r.managerId, r.points])),
  }));
  const managers = board(p.calendar.start, p.calendar.end).map((row) => ({
    ...row,
    weekly: Object.fromEntries(weeks.map((w) => [w.index, w.points.get(row.managerId) ?? 0])),
  }));

  const warnings = [...p.warnings];
  for (const t of teams)
    if (p.config.progressMode !== 'absolute' && t.targetPoints === 0 && t.headcount > 0)
      warnings.push(`у команды ${t.teamId} план 0 баллов — фигурка не сдвинется`);

  return {
    today,
    calendar: p.calendar,
    track: p.track,
    teams,
    managers,
    unlocks: [],
    dataAsOf: latestImport(p.imports),
    warnings,
  };
}

function latestImport(imports: ImportLog[]): string | null {
  let latest: string | null = null;
  for (const i of imports)
    if (latest === null || Date.parse(i.at) > Date.parse(latest)) latest = i.at;
  return latest;
}
