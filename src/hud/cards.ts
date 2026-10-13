import type { SeasonConfig } from '../data/schemas/season.ts';
import type { TeamState } from '../engine/gameState.ts';
import type { Track } from '../engine/track.ts';

/** The points of a portion count from «было» to «стало» this long (D-56). */
export const COUNT_MS = 1500;
/** The green «+12» and the flash of the card stay this long. */
export const BADGE_MS = 4000;

const EPS = 1e-9;

/**
 * The way to the next cell from the data (D-56): its share (the thin bar «до шага») and the points left.
 * The cell of the data is `floor(points / perCell + EPS)` as the engine counts it; admin steps and resets
 * move the figure, not the way to its next cell. None at the end of the overflow zone or without a plan.
 */
export function nextStep(
  team: Pick<TeamState, 'points' | 'targetPoints' | 'position'>,
  config: Pick<SeasonConfig, 'progressMode' | 'pointsPerStep'>,
  track: Pick<Track, 'trackLength' | 'maxPosition'>,
): { share: number; left: number } | null {
  if (team.position >= track.maxPosition) return null;
  const perCell =
    config.progressMode === 'absolute'
      ? (config.pointsPerStep ?? 0)
      : team.targetPoints / track.trackLength;
  if (!(perCell > 0)) return null;
  const cells = team.points / perCell;
  const whole = Math.floor(cells + EPS);
  return { share: Math.max(0, cells - whole), left: (whole + 1) * perCell - team.points };
}

/** «14» — the points left to the next cell, whole, at least 1. */
export function stepLeftText(left: number): string {
  return Math.max(1, Math.ceil(left - 1e-6)).toLocaleString('ru-RU');
}

/** The number shown `ms` after a count began (null — not yet): from «было» to «стало», easing out. */
export function countAt(from: number, to: number, ms: number | null, duration = COUNT_MS): number {
  if (ms === null) return from;
  const f = Math.min(1, Math.max(0, ms / duration));
  return from + (to - from) * (1 - (1 - f) ** 3);
}

/**
 * What a card shows (D-56): the portion's points running from «было» while it counts. A gain that no
 * longer matches the state — another season, other weights, a look at another day — shows the state
 * (review D-56); so does reduced motion (`still`).
 */
export function cardPoints(
  gain: { from: number; to: number } | null,
  points: number,
  ms: number | null,
  still: boolean,
): number {
  if (gain === null || still || Math.abs(gain.to - points) > 1e-6) return points;
  return countAt(gain.from, points, ms);
}

/**
 * The card's clock as it redraws (review D-56, PERF-1): every tick while the points count, then once —
 * when the badge goes. Null — not started.
 */
export function cardPhase(ms: number | null): number | null {
  if (ms === null) return null;
  return ms < COUNT_MS ? ms : ms < BADGE_MS ? COUNT_MS : BADGE_MS;
}
