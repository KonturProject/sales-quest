import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { diffMoments, type MomentEvent } from './events.ts';
import { snapshotOf, type Snapshot } from './snapshot.ts';

/** One portion of moments for the screen (D-56). */
export type Moments = {
  /** Grows with every batch: the HUD plays each once. */
  id: number;
  /** `since` — the first batch of a page opened over a remembered snapshot: «Что нового с …». */
  kind: 'live' | 'since';
  /** The data time of «было». */
  since: string | null;
  events: MomentEvent[];
  /** The teams' cells of «было»: on the first show the scene and the scheme walk from them. */
  before: { teamId: string; position: number }[];
};

export type SeenStore = { read(seasonId: string): Snapshot | null; write(s: Snapshot): void };

/**
 * «Было» for every live recompute (D-56): the page's own last snapshot, or — on the first one — what this
 * browser remembered. The new snapshot is remembered at once (a page closed mid-show loses that show).
 */
export function momentsTracker(seen: SeenStore) {
  let shown: Snapshot | null = null;
  let restored = false;
  let id = 0;
  return {
    next(game: GameState, config: SeasonConfig): Moments | null {
      const after = snapshotOf(game, config);
      if (shown === null || shown.seasonId !== after.seasonId) {
        shown = seen.read(after.seasonId);
        restored = shown !== null;
      }
      const before = shown;
      shown = after;
      seen.write(after);
      if (before === null) return null;
      if (before.key !== after.key) restored = false;
      const events = diffMoments(before, after, game.unlocks, config);
      if (events.length === 0) return null;
      const kind = restored ? 'since' : 'live';
      restored = false;
      id += 1;
      return {
        id,
        kind,
        since: before.dataAsOf,
        events,
        before: before.teams.map(({ teamId, position }) => ({ teamId, position })),
      };
    },
  };
}
