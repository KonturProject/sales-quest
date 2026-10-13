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
 * The batch of the state shown: a recompute without events keeps it; another season or key drops it, so
 * no card shows points of another state (review D-56). A remembered snapshot that breaks the comparison
 * gives no moments — never an exception that would cost the map.
 */
export function momentsTracker(seen: SeenStore) {
  let shown: Snapshot | null = null;
  let restored = false;
  let last: Moments | null = null;
  let id = 0;
  return {
    next(game: GameState, config: SeasonConfig): Moments | null {
      const after = snapshotOf(game, config);
      if (shown === null || shown.seasonId !== after.seasonId) {
        shown = seen.read(after.seasonId);
        restored = shown !== null;
        last = null;
      }
      const before = shown;
      shown = after;
      seen.write(after);
      if (before === null) return null;
      if (before.key !== after.key) {
        restored = false;
        last = null;
        return null;
      }
      let events: MomentEvent[];
      try {
        events = diffMoments(before, after, game.unlocks, config);
      } catch {
        restored = false;
        return last;
      }
      if (events.length === 0) return last;
      const kind = restored ? 'since' : 'live';
      restored = false;
      id += 1;
      last = {
        id,
        kind,
        since: before.dataAsOf,
        events,
        before: before.teams.map(({ teamId, position }) => ({ teamId, position })),
      };
      return last;
    },
  };
}
