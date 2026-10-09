import type { AmbientKind } from './themes.ts';

/**
 * The life of a location while moves play (3b, D-41): a cloud of points over its panel, moved in
 * the vertex shader by one time uniform. Pure: seeds and looks; `Ambient.tsx` draws it.
 */

export const AMBIENT_POINTS = 90;
/** Points live between these heights over the panel. */
export const AMBIENT_HEIGHT = [0.2, 3] as const;

export const AMBIENT_LOOK: Record<AmbientKind, { color: string; size: number; kind: number }> = {
  motes: { color: '#8ff5d8', size: 0.16, kind: 0 }, // the ruins' rune light
  snow: { color: '#ffffff', size: 0.14, kind: 1 },
  embers: { color: '#ffa040', size: 0.13, kind: 2 },
  sparkles: { color: '#ffe7a0', size: 0.18, kind: 3 },
};

/** A small deterministic generator: the same panel always gets the same cloud. */
export function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Base positions (x, y, z) over a panel and three random numbers per point that vary its phase,
 * speed and size.
 */
export function ambientCloud(
  panel: { x0: number; z0: number; width: number; depth: number },
  seed: number,
  count = AMBIENT_POINTS,
): { positions: Float32Array; seeds: Float32Array } {
  const next = random(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const [low, high] = AMBIENT_HEIGHT;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = panel.x0 + next() * panel.width;
    positions[i * 3 + 1] = low + next() * (high - low);
    positions[i * 3 + 2] = panel.z0 + (next() - 0.5) * panel.depth;
    for (let k = 0; k < 3; k++) seeds[i * 3 + k] = next();
  }
  return { positions, seeds };
}
