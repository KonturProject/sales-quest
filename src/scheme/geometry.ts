import type { Track } from '../engine/track.ts';
import { poseAt, type Plan, type Timing } from '../scene/choreography.ts';
import { PANEL_DEPTH, PANEL_WIDTH, buildLayout, type Layout } from '../scene/layout.ts';
import type { ThemePanel } from '../scene/themes.ts';

/**
 * The geometry of the 2D scheme (GFX-6): the scene's own cells and order, from above. The panels
 * lie as the reserve «snake» (D-42): two rows of two fit one screen, where the strip of the scene
 * would need scrolling. Pure: the scheme only draws it.
 */
export function schemeLayout(
  track: Pick<Track, 'cellsPerLocation' | 'trackLength' | 'overflowCells'>,
  themes: ThemePanel[],
): Layout {
  return foldOverflow(buildLayout(track, themes, 'snake'), track.trackLength);
}

/**
 * The cells beyond the finish: the scene's two-row zigzag would make the scheme much wider than
 * the screen allows; here they fold into three rows next to the finish, column by column.
 */
function foldOverflow(layout: Layout, trackLength: number): Layout {
  const finish = layout.spots[trackLength];
  const first = layout.spots[trackLength + 1];
  if (!finish || !first) return layout;
  const dir = first.x < finish.x ? -1 : 1;
  const step = layout.cellSize * 1.1;
  const spots = layout.spots.map((s) => {
    if (s.kind !== 'overflow') return s;
    const k = s.position - trackLength - 1;
    const col = Math.floor(k / 3);
    // A serpentine: down the even columns, up the odd ones.
    const row = col % 2 === 0 ? k % 3 : 2 - (k % 3);
    return { ...s, x: finish.x + dir * step * (1.3 + col), z: finish.z + (row - 1) * step };
  });
  const extra = spots.filter((s) => s.kind === 'overflow').map((s) => s.x);
  const pad = layout.cellSize;
  const xs = [
    ...spots.map((s) => s.x),
    ...layout.panels.flatMap((p) => [p.x0, p.x0 + PANEL_WIDTH]),
  ];
  const zs = [
    ...spots.map((s) => s.z),
    ...layout.panels.flatMap((p) => [p.z0 - PANEL_DEPTH / 2, p.z0 + PANEL_DEPTH / 2]),
  ];
  return {
    ...layout,
    spots,
    overflow: { x0: Math.min(...extra), x1: Math.max(...extra), z: finish.z },
    bounds: {
      minX: Math.min(...xs) - pad,
      maxX: Math.max(...xs) + pad,
      minZ: Math.min(...zs) - pad * 0.5,
      maxZ: Math.max(...zs) + pad * 0.5,
    },
  };
}

/** «Алина С.»: a leader's name short enough for a token's plate (the cards keep it whole). */
export function shortName(full: string): string {
  const [first, last] = full.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : (first ?? '');
}

export function viewBox(b: Layout['bounds']): string {
  return `${b.minX} ${b.minZ} ${b.maxX - b.minX} ${b.maxZ - b.minZ}`;
}

/**
 * The transform `translate(tx, ty) scale(scale)` of the board that puts `at` in the middle of the
 * view, kept so the board still fills it («К лидеру»); scale 1 — the whole track («Весь трек»).
 */
export function zoomOn(
  b: Layout['bounds'],
  at: { x: number; z: number },
  scale: number,
): { tx: number; ty: number; scale: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  // Covering the view: s·min + t ≤ min and s·max + t ≥ max.
  const tx = clamp(cx - scale * at.x, b.maxX - scale * b.maxX, b.minX - scale * b.minX);
  const ty = clamp(cz - scale * at.z, b.maxZ - scale * b.maxZ, b.minZ - scale * b.minZ);
  return { tx: tx + 0, ty: ty + 0, scale }; // + 0: no −0 from the products
}

/** No camera in 2D: no flights and shorter pauses; hops as in the scene (FR-MOVE-1). */
export const SCHEME_TIMING: Timing = {
  flyMs: 0,
  hopMs: 300,
  maxWalkMs: 3000,
  pauseMs: 500,
  cheerMs: 900,
  overviewMs: 0,
};

/**
 * The cell a token heads for at `t` of the plan: during a hop already the next one — the CSS
 * transition of `hopMs` takes it there, so a walk goes cell by cell without a frame loop.
 */
export function tokenCell(
  plan: Plan,
  teamId: string,
  t: number,
  rest: number,
): { cell: number; hopMs: number } {
  const pose = poseAt(plan, teamId, t, rest);
  const hopMs = plan.moves.find((m) => m.teamId === teamId)?.hopMs ?? SCHEME_TIMING.hopMs;
  return { cell: pose.f > 0 ? pose.b : pose.a, hopMs };
}
