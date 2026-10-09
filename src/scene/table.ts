import type { Bounds } from './restView.ts';

/**
 * The board lies on a table (D-43, the author's reference of 09.10.2026): a slab in the panels' mist
 * colour under the board, a wooden table around it, the room's floor below. Pure: rectangles from
 * the board's bounds; `Table.tsx` draws them.
 */

/** The slab reaches this far past the board's bounds (the start pad and the overflow sit on it). */
export const SLAB_MARGIN = 0.8;
export const SLAB_HEIGHT = 0.35;
/** Table top past the slab: enough to fill the view around the whole strip at the widest. */
export const TABLE_MARGIN = { x: 16, z: 30 };
export const TABLE_THICKNESS = 1.4;
/** The floor lies this far below the table top, and reaches this far past the table. */
export const FLOOR_DROP = 9;
export const FLOOR_MARGIN = 80;

export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

export type TablePlan = {
  slab: Rect & { top: number; bottom: number };
  table: Rect & { top: number; bottom: number };
  floor: Rect & { y: number };
};

const grow = (r: Rect, dx: number, dz: number): Rect => ({
  minX: r.minX - dx,
  maxX: r.maxX + dx,
  minZ: r.minZ - dz,
  maxZ: r.maxZ + dz,
});

/** The panels lie at y = 0; everything else goes below them. */
export function tablePlan(bounds: Bounds): TablePlan {
  const slab = grow(bounds, SLAB_MARGIN, SLAB_MARGIN);
  const table = grow(slab, TABLE_MARGIN.x, TABLE_MARGIN.z);
  const tableTop = -SLAB_HEIGHT;
  return {
    slab: { ...slab, top: -0.01, bottom: tableTop },
    table: { ...table, top: tableTop, bottom: tableTop - TABLE_THICKNESS },
    floor: { ...grow(table, FLOOR_MARGIN, FLOOR_MARGIN), y: tableTop - FLOOR_DROP },
  };
}

/**
 * Things on the table around the board (D-43), from the KayKit pack already downloaded (CC0, D-41):
 * on a side of the board's slab, a share `along` it, `out` units off its edge; turned `yaw`; `lie`
 * — laid flat (books, a shield, a sword); `scale` — table size (a hero is a 4-cm miniature, so a mug
 * is a big one). In front of the board only flat things: nothing stands between the viewer and it.
 */
export type PropSpot = {
  id: string;
  side: 'back' | 'front' | 'left' | 'right';
  along: number;
  out: number;
  yaw: number;
  lie: boolean;
  scale: number;
};

export const PROPS: PropSpot[] = [
  { id: 'mug_full', side: 'back', along: 0.88, out: 4.5, yaw: 0.5, lie: false, scale: 7 },
  { id: 'spellbook_open', side: 'back', along: 0.1, out: 5, yaw: -0.25, lie: true, scale: 7 },
  { id: 'arrow_bundle', side: 'back', along: 0.48, out: 3.5, yaw: 1.35, lie: true, scale: 7 },
  { id: 'quiver', side: 'back', along: 0.55, out: 6, yaw: 1.1, lie: true, scale: 7 },
  { id: 'shield_round_color', side: 'front', along: 0.05, out: 5, yaw: 0.3, lie: true, scale: 6 },
  { id: 'sword_2handed', side: 'front', along: 0.7, out: 4, yaw: 1.75, lie: true, scale: 6 },
  { id: 'smokebomb', side: 'left', along: 0.3, out: 4, yaw: 0, lie: false, scale: 6 },
];

/** Where a prop stands on the table top (x, z); its height comes from its own shape. */
export function propSpot(plan: TablePlan, spot: PropSpot): { x: number; z: number } {
  const s = plan.slab;
  const lerp = (a: number, b: number) => a + (b - a) * spot.along;
  switch (spot.side) {
    case 'back':
      return { x: lerp(s.minX, s.maxX), z: s.minZ - spot.out };
    case 'front':
      return { x: lerp(s.minX, s.maxX), z: s.maxZ + spot.out };
    case 'left':
      return { x: s.minX - spot.out, z: lerp(s.minZ, s.maxZ) };
    case 'right':
      return { x: s.maxX + spot.out, z: lerp(s.minZ, s.maxZ) };
  }
}

/**
 * `outer` minus the `holes` (disjoint rectangles inside it) as rectangles: horizontal bands between
 * the holes' z edges, each without the holes' x spans. Nothing is drawn twice: in software
 * rendering a pixel shaded under the board is a pixel paid for twice (D-43, QA-4).
 */
export function rectMinus(outer: Rect, holes: readonly Rect[]): Rect[] {
  const clip = holes
    .map((h) => ({
      minX: Math.max(h.minX, outer.minX),
      maxX: Math.min(h.maxX, outer.maxX),
      minZ: Math.max(h.minZ, outer.minZ),
      maxZ: Math.min(h.maxZ, outer.maxZ),
    }))
    .filter((h) => h.minX < h.maxX && h.minZ < h.maxZ);
  const zs = [...new Set([outer.minZ, outer.maxZ, ...clip.flatMap((h) => [h.minZ, h.maxZ])])].sort(
    (a, b) => a - b,
  );
  const out: Rect[] = [];
  for (let i = 0; i + 1 < zs.length; i++) {
    const [z0, z1] = [zs[i] as number, zs[i + 1] as number];
    const mid = (z0 + z1) / 2;
    const spans = clip
      .filter((h) => h.minZ < mid && mid < h.maxZ)
      .map((h) => [h.minX, h.maxX] as const)
      .sort((a, b) => a[0] - b[0]);
    let x = outer.minX;
    for (const [a, b] of spans) {
      if (a > x) out.push({ minX: x, maxX: a, minZ: z0, maxZ: z1 });
      x = Math.max(x, b);
    }
    if (x < outer.maxX) out.push({ minX: x, maxX: outer.maxX, minZ: z0, maxZ: z1 });
  }
  return out;
}

/** The panels' rows as rectangles: what the slab's top need not draw. */
export function panelRows(panels: readonly { x0: number; z0: number }[], w: number, d: number) {
  const rows = new Map<number, Rect>();
  for (const p of panels) {
    const r = rows.get(p.z0);
    rows.set(p.z0, {
      minX: Math.min(r?.minX ?? Infinity, p.x0),
      maxX: Math.max(r?.maxX ?? -Infinity, p.x0 + w),
      minZ: p.z0 - d / 2,
      maxZ: p.z0 + d / 2,
    });
  }
  return [...rows.values()];
}

export const width = (r: Rect) => r.maxX - r.minX;
export const depth = (r: Rect) => r.maxZ - r.minZ;
export const centre = (r: Rect): [number, number] => [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2];
