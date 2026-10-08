import type { Track } from '../engine/track.ts';
import type { PanelPoint, ThemePanel } from './themes.ts';

/**
 * World geometry of the board (D-37): four square panels left to right on the ground plane
 * (x right, z towards the viewer, y up), a START pad before them, an "over the horizon" platform
 * after them, and a spot for every track position 0…maxPosition. Pure: the scene only draws it.
 */

export const PANEL_SIZE = 12;
export const PANEL_GAP = 0.6;

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
  x0: number;
  /** The path in world coordinates, densely sampled. */
  path: { x: number; z: number }[];
};

export type Layout = {
  panels: Panel[];
  /** `spots[p]` — where position `p` stands. */
  spots: Spot[];
  /** Side of a cell slab. */
  cellSize: number;
  /** The overflow platform: from x0 to x1 at depth z. */
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

export function buildLayout(track: Track, themes: ThemePanel[]): Layout {
  const cpl = track.cellsPerLocation;
  const panels: Panel[] = themes.map((theme, i) => {
    const x0 = i * (PANEL_SIZE + PANEL_GAP);
    const path = samplePath(theme.path).map((p) => ({
      x: x0 + p.u * PANEL_SIZE,
      z: (p.v - 0.5) * PANEL_SIZE,
    }));
    return { locationIndex: i + 1, themePackId: theme.themePackId, color: theme.color, x0, path };
  });

  const spacing = panels.reduce((s, p) => s + lengthOf(p.path), 0) / panels.length / cpl;
  const cellSize = Math.min(Math.max(spacing * 0.72, 0.9), 1.8);

  const spots: Spot[] = [];
  const first = panels[0]?.path[0] ?? { x: 0, z: 0 };
  spots.push({
    position: 0,
    x: first.x - spacing,
    z: first.z,
    heading: 0,
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

  // Beyond the finish: a compact platform, cells in two rows zigzagging left to right.
  const last = panels[panels.length - 1];
  const exit = last?.path[last.path.length - 1] ?? { x: 0, z: 0 };
  const step = cellSize * 1.15;
  const overflowX0 = exit.x + PANEL_GAP + step;
  for (let k = 1; k <= track.overflowCells; k++) {
    const row = (k - 1) % 2;
    spots.push({
      position: track.trackLength + k,
      x: overflowX0 + (k - 1) * (step / 2) * 1.2,
      z: exit.z + (row === 0 ? -1 : 1) * step * 0.5,
      heading: 0,
      kind: 'overflow',
      locationIndex: 4,
    });
  }
  const overflow = {
    x0: overflowX0 - step,
    x1: overflowX0 + Math.max(track.overflowCells - 1, 0) * (step / 2) * 1.2 + step,
    z: exit.z,
  };

  const xs = spots.map((s) => s.x);
  const bounds = {
    minX: Math.min(...xs, 0) - spacing,
    maxX: Math.max(...xs, overflow.x1, (last?.x0 ?? 0) + PANEL_SIZE) + spacing,
    minZ: -PANEL_SIZE / 2,
    maxZ: PANEL_SIZE / 2,
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
