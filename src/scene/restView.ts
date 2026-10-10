import type { Layout } from './layout.ts';

/**
 * What the camera shows at rest (D-42, the author's answer to OQ-23): not the thin whole strip but
 * the cells where the teams are. Teams more than `GROUP_GAP` cells apart are shown group by group,
 * the next group once a minute. Pure: the scene asks it which box to frame.
 */

/** Neighbours further apart than this many cells fall into different groups (the author's rule). */
export const GROUP_GAP = 4;
/** A group's window is at least this many cells long, so a lone figure is not framed too close. */
export const MIN_WINDOW_CELLS = 6;
/** The next group, once a minute. */
export const CYCLE_MS = 60_000;
/** On a TV screen (PERF-5): the next team every 20 s. */
export const TV_CYCLE_MS = 20_000;

/**
 * How the rest view moves on: groups of teams once a minute (D-42); on a TV screen nobody holds
 * the camera, so each team in turn — teams on one cell together — every 20 s (PERF-5).
 */
export function restCycle(tv: boolean): { everyMs: number; gap: number } {
  return tv ? { everyMs: TV_CYCLE_MS, gap: 0 } : { everyMs: CYCLE_MS, gap: GROUP_GAP };
}
/** The viewer's own camera is left alone this long after the last touch or button. */
export const VIEWER_PAUSE_MS = 120_000;

export type TeamGroup = { teamIds: string[]; min: number; max: number };
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The teams in groups, the leaders' group first; inside a group, from the front. */
export function teamGroups(
  positions: { teamId: string; position: number }[],
  gap = GROUP_GAP,
): TeamGroup[] {
  const sorted = [...positions].sort((a, b) => b.position - a.position);
  const groups: TeamGroup[] = [];
  for (const { teamId, position } of sorted) {
    const current = groups[groups.length - 1];
    if (current && current.min - position <= gap) {
      current.teamIds.push(teamId);
      current.min = position;
    } else groups.push({ teamIds: [teamId], min: position, max: position });
  }
  return groups;
}

/**
 * The world box of a group's window: its cells with one more on each side, stretched to at least
 * `minCells` cells (within the track), padded by a cell.
 */
export function groupBounds(
  layout: Layout,
  group: Pick<TeamGroup, 'min' | 'max'>,
  minCells = MIN_WINDOW_CELLS,
): Bounds {
  const last = layout.spots.length - 1;
  const clamp = (p: number) => Math.min(Math.max(Math.round(p), 0), last);
  let lo = clamp(group.min - 1);
  let hi = clamp(group.max + 1);
  while (hi - lo + 1 < minCells && (lo > 0 || hi < last)) {
    if (hi < last) hi++;
    if (hi - lo + 1 < minCells && lo > 0) lo--;
  }
  const spots = layout.spots.slice(lo, hi + 1);
  const xs = spots.map((s) => s.x);
  const zs = spots.map((s) => s.z);
  const pad = layout.cellSize;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minZ: Math.min(...zs) - pad,
    maxZ: Math.max(...zs) + pad,
  };
}

/** A key that changes with any position: after moves the cycle starts again from the leaders. */
export function positionsKey(positions: { teamId: string; position: number }[]): string {
  return [...positions]
    .sort((a, b) => a.teamId.localeCompare(b.teamId))
    .map((p) => `${p.teamId}:${p.position}`)
    .join('|');
}

/**
 * What the minute's tick does (D-42): nothing while moves play, the tab is hidden or frozen, or the
 * viewer was at the camera less than `VIEWER_PAUSE_MS` ago; else the next group (several groups),
 * or the camera back to the rest view (the viewer left it elsewhere), or nothing.
 */
export function cycleStep(s: {
  paused: boolean;
  animating: boolean;
  sinceViewerMs: number;
  groups: number;
  userCamera: boolean;
}): 'skip' | 'advance' | 'back' {
  if (s.paused || s.animating || s.sinceViewerMs < VIEWER_PAUSE_MS) return 'skip';
  if (s.groups > 1) return 'advance';
  return s.userCamera ? 'back' : 'skip';
}
