import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState, Unlock } from '../engine/gameState.ts';

export type SnapTeam = { teamId: string; position: number; points: number; locationIndex: number };
export type SnapManager = {
  managerId: string;
  /** The operator's team today. */
  teamId: string;
  points: number;
  achievementPoints: number;
  totals: Record<string, number>;
};

/**
 * What a screen showed (D-56): enough to tell «было» from «стало» — the teams' cells and points, the
 * operators' points and numbers, how many of each achievement. Ids and numbers only, no names: it is kept
 * in the browser's storage.
 */
export type Snapshot = {
  seasonId: string;
  /** The season, the track's length and end, the weights: another key — no moments, a new snapshot. */
  key: string;
  /** The latest import the screen showed (FR-LB-4). */
  dataAsOf: string | null;
  trackLength: number;
  teams: SnapTeam[];
  managers: SnapManager[];
  /** Unlocks per `achievementId|managerId|teamId`. */
  unlocks: Record<string, number>;
};

export const unlockKey = (u: Pick<Unlock, 'achievementId' | 'managerId' | 'teamId'>): string =>
  `${u.achievementId}|${u.managerId ?? ''}|${u.teamId ?? ''}`;

export function snapshotOf(game: GameState, config: SeasonConfig): Snapshot {
  const weights = [...config.metrics]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => `${m.id}:${m.weight}`)
    .join(',');
  const unlocks: Record<string, number> = {};
  for (const u of game.unlocks) unlocks[unlockKey(u)] = (unlocks[unlockKey(u)] ?? 0) + 1;
  return {
    seasonId: config.id,
    key: `${config.id}|${game.track.trackLength}|${game.track.maxPosition}|${weights}`,
    dataAsOf: game.dataAsOf,
    trackLength: game.track.trackLength,
    teams: game.teams.map((t) => ({
      teamId: t.teamId,
      position: t.position,
      points: t.points,
      locationIndex: t.locationIndex,
    })),
    managers: game.managers.map((m) => ({
      managerId: m.managerId,
      teamId: m.teamId,
      points: m.points,
      achievementPoints: m.achievementPoints,
      totals: { ...m.totals },
    })),
    unlocks,
  };
}
