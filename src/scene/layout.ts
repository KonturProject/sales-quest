import type { Track } from '../engine/track.ts';
import { PANEL_ASPECT, type AmbientKind, type PanelPoint, type ThemePanel } from './themes.ts';

/**
 * World geometry of the board (D-37, D-41, D-42): four painted panels on the ground plane (x right,
 * z towards the viewer, y up) — their misty edges meet, no gaps —, a START pad before them, an
 * "over the horizon" platform after them, and a spot for every track position 0…maxPosition.
 * Pure: the scene only draws it.
 */

/** A panel keeps its art's shape: depth 12 as the squares of 3a, width by the aspect. */
export const PANEL_DEPTH = 12;
export const PANEL_WIDTH = PANEL_DEPTH * PANEL_ASPECT;
const OVERFLOW_GAP = 0.6;
/** Between the rows of the snake. */
const ROW_GAP = 1.2;

/**
 * How the panels lie (D-42): `row` — one strip left to right (D-23, GFX-2); `snake` — two rows,
 * the second mirrored and travelling right to left, kept in reserve (OQ-23). One switch.
 */
export type Arrangement = 'row' | 'snake';
export const BOARD_ARRANGEMENT: Arrangement = 'row';

/** Where panel `i` of `count` lies: its left edge, its centre line, whether its art is mirrored. */
export function panelPlacement(
  i: number,
  count: number,
  arrangement: Arrangement,
): { x0: number; z0: number; mirrored: boolean } {
  if (arrangement === 'row') return { x0: i * PANEL_WIDTH, z0: 0, mirrored: false };
  const perRow = Math.ceil(count / 2);
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const mirrored = row % 2 === 1;
  return {
    x0: (mirrored ? perRow - 1 - col : col) * PANEL_WIDTH,
    z0: row * (PANEL_DEPTH + ROW_GAP),
    mirrored,
  };
}

export type SpotKind = 'start' | 'cell' | 'checkpoint' | 'finish' | 'overflow';
export type Spot = {
  position: number;
  x: number;
  z: number;
  /** Direction of travel at the spot, radians around y (0 = +x). */
  heading: number;
  kind: SpotKind;
  /** 1–4; the start counts as 1, the overflow platform as 4. */
  locationIndex: number;
};

export type Panel = {
  locationIndex: number;
  themePackId: string;
  color: string;
  ambient: AmbientKind;
  /** Left edge and centre line in the world. */
  x0: number;
  z0: number;
  /** The art runs right to left (the snake's second row). */
  mirrored: boolean;
  /** The path in world coordinates, densely sampled. */
  path: { x: number; z: number }[];
};

export type Layout = {
  panels: Panel[];
  /** `spots[p]` — where position `p` stands. */
  spots: Spot[];
  /** Side of a cell slab. */
  cellSize: number;
  /** The overflow platform: from x0 to x1 (x0 < x1) at depth z. */
  overflow: { x0: number; x1: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

type Vec = { x: number; z: number };

/** Catmull-Rom through the control points, `per` samples per segment (ends included). */
export function samplePath(points: PanelPoint[], per = 16): PanelPoint[] {
  const out: PanelPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as PanelPoint;
    const p1 = points[i] as PanelPoint;
    const p2 = points[i + 1] as PanelPoint;
    const p3 = points[Math.min(points.length - 1, i + 2)] as PanelPoint;
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({ u: at(p0.u, p1.u, p2.u, p3.u), v: at(p0.v, p1.v, p2.v, p3.v) });
    }
  }
  out.push(points[points.length - 1] as PanelPoint);
  return out;
}

/** The point at a share `t` (0…1) of a polyline's length, with the direction there. */
export function pointAlong(line: Vec[], t: number): Vec & { heading: number } {
  const lengths = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Vec;
    const b = line[i] as Vec;
    lengths.push((lengths[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = lengths[lengths.length - 1] as number;
  const target = Math.min(Math.max(t, 0), 1) * total;
  let i = 1;
  while (i < line.length - 1 && (lengths[i] as number) < target) i++;
  const a = line[i - 1] as Vec;
  const b = line[i] as Vec;
  const segment = (lengths[i] as number) - (lengths[i - 1] as number);
  const f = segment > 0 ? (target - (lengths[i - 1] as number)) / segment : 0;
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    heading: Math.atan2(a.z - b.z, b.x - a.x),
  };
}

export function lengthOf(line: Vec[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Vec;
    const b = line[i] as Vec;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

export function buildLayout(
  track: Pick<Track, 'cellsPerLocation' | 'trackLength' | 'overflowCells'>,
  themes: ThemePanel[],
  arrangement: Arrangement = BOARD_ARRANGEMENT,
): Layout {
  const cpl = track.cellsPerLocation;
  const panels: Panel[] = themes.map((theme, i) => {
    const { x0, z0, mirrored } = panelPlacement(i, themes.length, arrangement);
    const path = samplePath(theme.path).map((p) => ({
      x: x0 + (mirrored ? 1 - p.u : p.u) * PANEL_WIDTH,
      z: z0 + (p.v - 0.5) * PANEL_DEPTH,
    }));
    return {
      locationIndex: i + 1,
      themePackId: theme.themePackId,
      color: theme.color,
      ambient: theme.ambient,
      x0,
      z0,
      mirrored,
      path,
    };
  });
  /** Which way along x the path runs at its start or end: +1 right, −1 left. */
  const way = (line: Vec[], atEnd: boolean) => {
    const [a, b] = atEnd ? [line[line.length - 2], line[line.length - 1]] : [line[0], line[1]];
    return a && b && b.x < a.x ? -1 : 1;
  };

  const spacing = panels.reduce((s, p) => s + lengthOf(p.path), 0) / panels.length / cpl;
  // About the painted path's width: the slabs mark the path, they do not cover the art (3b).
  const cellSize = Math.min(Math.max(spacing * 0.5, 0.9), 1.4);

  const spots: Spot[] = [];
  const first = panels[0]?.path[0] ?? { x: 0, z: 0 };
  const startWay = panels[0] ? way(panels[0].path, false) : 1;
  spots.push({
    position: 0,
    x: first.x - spacing * startWay,
    z: first.z,
    heading: startWay > 0 ? 0 : Math.PI,
    kind: 'start',
    locationIndex: 1,
  });
  panels.forEach((panel) => {
    for (let i = 1; i <= cpl; i++) {
      const position = (panel.locationIndex - 1) * cpl + i;
      const at = pointAlong(panel.path, (i - 0.5) / cpl);
      const kind: SpotKind =
        position === track.trackLength ? 'finish' : i === cpl ? 'checkpoint' : 'cell';
      spots.push({
        position,
        x: at.x,
        z: at.z,
        heading: at.heading,
        kind,
        locationIndex: panel.locationIndex,
      });
    }
  });

  // Beyond the finish: a compact platform, cells in two rows zigzagging on in the travel direction.
  const last = panels[panels.length - 1];
  const exit = last?.path[last.path.length - 1] ?? { x: 0, z: 0 };
  const dir = last ? way(last.path, true) : 1;
  const step = cellSize * 1.15;
  const along = (k: number) => exit.x + dir * (OVERFLOW_GAP + step + (k - 1) * (step / 2) * 1.2);
  for (let k = 1; k <= track.overflowCells; k++) {
    const row = (k - 1) % 2;
    spots.push({
      position: track.trackLength + k,
      x: along(k),
      z: exit.z + (row === 0 ? -1 : 1) * step * 0.5,
      heading: dir > 0 ? 0 : Math.PI,
      kind: 'overflow',
      locationIndex: 4,
    });
  }
  const ends = [along(1) - dir * step, along(Math.max(track.overflowCells, 1)) + dir * step];
  const overflow = { x0: Math.min(...ends), x1: Math.max(...ends), z: exit.z };

  const xs = spots.map((s) => s.x);
  const bounds = {
    minX: Math.min(...xs, ...panels.map((p) => p.x0), overflow.x0) - spacing,
    maxX: Math.max(...xs, ...panels.map((p) => p.x0 + PANEL_WIDTH), overflow.x1) + spacing,
    minZ: Math.min(...panels.map((p) => p.z0)) - PANEL_DEPTH / 2,
    maxZ: Math.max(...panels.map((p) => p.z0)) + PANEL_DEPTH / 2,
  };
  return { panels, spots, cellSize, overflow, bounds };
}

/** Offsets of up to six figures on one cell, in cell sizes; read left to right (FR-MOVE-2). */
export function slotOffsets(count: number): Vec[] {
  if (count <= 1) return [{ x: 0, z: 0 }];
  const n = Math.min(count, 6);
  const radius = 0.3;
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.PI + (2 * Math.PI * i) / n;
    return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
  });
}

/**
 * The place of each figure among those on its cell (0, 1, …), in the order given — the stack of
 * name plates (FR-MOVE-2). Positions past the end stand on the last cell, as in `figureSpots`.
 */
export function cellStack(
  layout: Layout,
  positions: { teamId: string; position: number }[],
): Map<string, number> {
  const last = layout.spots.length - 1;
  const onCell = new Map<number, number>();
  const out = new Map<string, number>();
  for (const { teamId, position } of positions) {
    const cell = Math.min(Math.max(Math.round(position), 0), last);
    const n = onCell.get(cell) ?? 0;
    out.set(teamId, n);
    onCell.set(cell, n + 1);
  }
  return out;
}

/**
 * Where each figure stands: teams on the same position share the cell in slots, in team order.
 * Positions outside the track are clamped to it.
 */
export function figureSpots(
  layout: Layout,
  positions: { teamId: string; position: number }[],
): Map<string, Vec> {
  const max = layout.spots.length - 1;
  const byCell = new Map<number, string[]>();
  for (const { teamId, position } of positions) {
    const p = Math.min(Math.max(Math.round(position), 0), max);
    byCell.set(p, [...(byCell.get(p) ?? []), teamId]);
  }
  const out = new Map<string, Vec>();
  for (const [p, teams] of byCell) {
    const spot = layout.spots[p] as Spot;
    const offsets = slotOffsets(teams.length);
    teams.forEach((teamId, i) => {
      const o = offsets[i % offsets.length] as Vec;
      out.set(teamId, { x: spot.x + o.x * layout.cellSize, z: spot.z + o.z * layout.cellSize });
    });
  }
  return out;
}
