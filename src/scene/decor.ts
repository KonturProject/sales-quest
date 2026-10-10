import { PANEL_DEPTH, PANEL_WIDTH, type Layout } from './layout.ts';

/**
 * Volume on the painted panels (D-44, the author's request of 10.10.2026): KayKit models stand on
 * the art's own features — pillars on the painted column tops of the ruins, snowy peaks and boulders
 * on the ice, dark cones on the volcano's black islands, trees on the heavens' islands and clouds over
 * their sea of clouds. Never on the path: each spot keeps its distance (tested). Pure: spots in panel
 * coordinates (`u` left → right, `v` top → bottom, as the path) and model scale; the scene bakes them.
 */

/** A recolour towards a colour, keeping the model's shading: snow, basalt, blossom (0…1). */
export type Tint = { color: string; amount: number };

export type DecorItem = {
  /** A model of `decor.glb` (its node name). */
  model: string;
  u: number;
  v: number;
  scale: number;
  yaw: number;
  tint?: Tint;
  /** Above the panel (clouds). */
  lift?: number;
};

const SNOW: Tint = { color: '#eef6ff', amount: 0.85 };
const FROST: Tint = { color: '#d7ecef', amount: 0.55 };
const BASALT: Tint = { color: '#2b211e', amount: 0.8 };
const CLOUD: Tint = { color: '#ffffff', amount: 0.35 };

const pillar = (u: number, v: number, yaw = 0): DecorItem => ({
  model: 'pillar',
  u,
  v,
  scale: 0.5,
  yaw,
});

/** By `themePackId`: the spots were picked on the author's art (refs/board, D-41). */
export const DECOR: Record<string, DecorItem[]> = {
  ruins: [
    pillar(0.285, 0.055),
    pillar(0.405, 0.06, 0.4),
    pillar(0.565, 0.06),
    pillar(0.82, 0.09, 0.8),
    pillar(0.175, 0.86),
    pillar(0.305, 0.87, 0.3),
    pillar(0.71, 0.85),
    pillar(0.82, 0.67, 1.1),
    { model: 'pillar_decorated', u: 0.595, v: 0.2, scale: 0.5, yaw: 0.2 },
    { model: 'column', u: 0.71, v: 0.08, scale: 0.9, yaw: 0.6 },
    { model: 'column', u: 0.44, v: 0.88, scale: 0.9, yaw: 0 },
    { model: 'column', u: 0.175, v: 0.27, scale: 0.9, yaw: 1.2 },
    { model: 'rubble_half', u: 0.49, v: 0.14, scale: 0.3, yaw: 0.5 },
    { model: 'rubble_half', u: 0.25, v: 0.78, scale: 0.3, yaw: 2.4 },
  ],
  ice: [
    { model: 'mountain_B', u: 0.16, v: 0.07, scale: 1.5, yaw: 0.3, tint: SNOW },
    { model: 'mountain_A', u: 0.83, v: 0.08, scale: 1.4, yaw: 1.4, tint: SNOW },
    { model: 'rock_single_E', u: 0.64, v: 0.31, scale: 4, yaw: 0.7, tint: SNOW },
    { model: 'rock_single_C', u: 0.33, v: 0.71, scale: 4, yaw: 2, tint: SNOW },
    { model: 'rock_single_C', u: 0.57, v: 0.94, scale: 3, yaw: 0.2, tint: SNOW },
    { model: 'tree_single_A', u: 0.24, v: 0.1, scale: 1.6, yaw: 0, tint: FROST },
    { model: 'tree_single_A', u: 0.2, v: 0.88, scale: 1.6, yaw: 1, tint: FROST },
    { model: 'tree_single_A', u: 0.86, v: 0.86, scale: 1.8, yaw: 2, tint: FROST },
  ],
  volcano: [
    { model: 'mountain_C', u: 0.67, v: 0.22, scale: 1.7, yaw: 0.4, tint: BASALT },
    { model: 'mountain_A', u: 0.24, v: 0.78, scale: 1.4, yaw: 2.1, tint: BASALT },
    { model: 'rock_single_E', u: 0.23, v: 0.14, scale: 4, yaw: 1.1, tint: BASALT },
    { model: 'rock_single_E', u: 0.75, v: 0.83, scale: 4, yaw: 0.3, tint: BASALT },
    { model: 'rock_single_C', u: 0.52, v: 0.06, scale: 4, yaw: 2.5, tint: BASALT },
    { model: 'rock_single_C', u: 0.45, v: 0.7, scale: 3.5, yaw: 0.9, tint: BASALT },
    { model: 'torch_lit', u: 0.16, v: 0.38, scale: 1.2, yaw: 0 },
    { model: 'torch_lit', u: 0.16, v: 0.62, scale: 1.2, yaw: 0 },
  ],
  heaven: [
    { model: 'tree_single_B', u: 0.26, v: 0.13, scale: 2.2, yaw: 0.2 },
    { model: 'tree_single_B', u: 0.45, v: 0.17, scale: 2, yaw: 1.4 },
    { model: 'tree_single_B', u: 0.59, v: 0.07, scale: 2.2, yaw: 2.2 },
    { model: 'tree_single_B', u: 0.75, v: 0.1, scale: 2.2, yaw: 0.8 },
    { model: 'tree_single_B', u: 0.36, v: 0.62, scale: 2, yaw: 2.9 },
    { model: 'tree_single_B', u: 0.58, v: 0.81, scale: 2, yaw: 0.5 },
    { model: 'cloud_big', u: 0.06, v: 0.22, scale: 1, yaw: 0.3, tint: CLOUD, lift: 0.6 },
    { model: 'cloud_small', u: 0.93, v: 0.15, scale: 1.1, yaw: 1.2, tint: CLOUD, lift: 0.8 },
    { model: 'cloud_big', u: 0.1, v: 0.9, scale: 0.9, yaw: 2, tint: CLOUD, lift: 0.4 },
    { model: 'cloud_small', u: 0.94, v: 0.82, scale: 1.1, yaw: 0.6, tint: CLOUD, lift: 0.5 },
  ],
};

/** Every model the decor needs: the pipeline puts exactly these into `decor.glb`. */
export const DECOR_MODELS = [
  ...new Set(Object.values(DECOR).flatMap((d) => d.map((i) => i.model))),
];

export type DecorSpot = DecorItem & { x: number; z: number };

/** The world spots of every location's decor on the board as it lies (a mirrored panel too). */
export function decorSpots(layout: Pick<Layout, 'panels'>): DecorSpot[] {
  return layout.panels.flatMap((panel) =>
    (DECOR[panel.themePackId] ?? []).map((item) => ({
      ...item,
      x: panel.x0 + (panel.mirrored ? 1 - item.u : item.u) * PANEL_WIDTH,
      z: panel.z0 + (item.v - 0.5) * PANEL_DEPTH,
    })),
  );
}
