import type { Tint } from './decor.ts';
import type { Layout } from './layout.ts';
import type { Placement } from './scenery.ts';

/**
 * The gates at the checkpoints and the finish (FR-TRACK-1, 3b BACKLOG): two decorated pillars of
 * the Dungeon pack across the path and a column laid on them — a trilithon in the board's style;
 * the finish gilded. Pure: placements for `bakeScenery`, fitted to the models' sizes in the file.
 */

export const GATE_PILLAR = 'pillar_decorated';
export const GATE_LINTEL = 'column';
const GOLD: Tint = { color: '#f2b632', amount: 0.55 };

export type ModelSize = { height: number; width: number };

/** As tall as the placeholder gates of 3a were. */
export function gateHeight(cellSize: number): number {
  return Math.max(cellSize * 1.1, 1.2);
}

export function lintelThickness(cellSize: number): number {
  return Math.max(cellSize * 0.17, 0.2);
}

export function gatePlacements(
  layout: Pick<Layout, 'spots' | 'cellSize'>,
  pillar: ModelSize,
  lintel: ModelSize,
): Placement[] {
  const half = layout.cellSize * 0.75;
  const height = gateHeight(layout.cellSize);
  const ps = height / pillar.height;
  const span = 2 * half + pillar.width * ps;
  // A slim beam, as thick as the plain gates' lintel (the decorated pillar's shields make it wide),
  // stretched along its length to bridge the pillars.
  const ls = lintelThickness(layout.cellSize) / lintel.width;
  const stretch = span / (lintel.height * ls);
  return layout.spots
    .filter((s) => s.kind === 'checkpoint' || s.kind === 'finish')
    .flatMap((spot) => {
      // Across the path: perpendicular to the heading (0 = +x).
      const side = { x: Math.sin(spot.heading), z: Math.cos(spot.heading) };
      const tint = spot.kind === 'finish' ? GOLD : undefined;
      const post = (s: number): Placement => ({
        id: GATE_PILLAR,
        x: spot.x + side.x * half * s,
        z: spot.z + side.z * half * s,
        ground: 0,
        yaw: spot.heading,
        scale: ps,
        tint,
      });
      return [
        post(1),
        post(-1),
        {
          id: GATE_LINTEL,
          x: spot.x,
          z: spot.z,
          // Sunk a little into the pillars' tops, so no light shows between.
          ground: height * 0.97,
          yaw: spot.heading,
          lie: true,
          scale: ls,
          stretch,
          tint,
        },
      ];
    });
}
