import type { BurstKind } from './choreography.ts';

/**
 * Fireworks as points (D-57, PERF-9): one pool, one draw call, no physics engine — each spark a function
 * of its burst's age, so a paused tour resumes its bursts where they were. Colours are RGBA: a spark keeps
 * its colour and fades by its alpha — additive sparks vanished on the light locations (clouds, ice).
 */

/** At most this many sparks at once (§12.1 budget of the effect). */
export const POOL = 200;
const GOLD: [number, number, number] = [1, 0.84, 0.42];
const GRAVITY = 2.2; // units per s², pulls the sparks down
const DRAG = 0.55; // a spark keeps (1 − DRAG·age/life) of its flight

export const BURSTS: Record<
  BurstKind,
  { sparks: number; waves: number[]; life: number; speed: number; gold: boolean }
> = {
  overtake: { sparks: 24, waves: [0], life: 1300, speed: 3.0, gold: false },
  gate: { sparks: 40, waves: [0], life: 1600, speed: 4.0, gold: false },
  leader: { sparks: 30, waves: [0, 350], life: 2000, speed: 4.6, gold: true },
  finish: { sparks: 40, waves: [0, 450, 900], life: 2600, speed: 5.2, gold: true },
};

/**
 * Writes the live sparks of a burst `age` ms old from `offset` on, at most `room` of them; `share` — the
 * part of the sparks drawn (1, or 0.5 on the lower steps of the quality ladder). Returns how many it
 * wrote. A spark flies along a fixed direction (a golden-angle spiral over the upper half-sphere), slows,
 * falls and fades (its alpha); half the sparks of a leader or a finish are gold. `colors` holds RGBA.
 */
export function writeSparks(
  kind: BurstKind,
  age: number,
  origin: readonly [number, number, number],
  color: readonly [number, number, number],
  positions: Float32Array,
  colors: Float32Array,
  offset: number,
  room: number,
  share: number,
): number {
  const b = BURSTS[kind];
  const count = Math.round(b.sparks * share);
  let n = 0;
  for (const wave of b.waves) {
    const a = age - wave;
    if (a < 0 || a >= b.life) continue;
    const s = a / 1000;
    const fade = Math.min(1, 2 * (1 - a / b.life)); // bright for half its life, then fading
    const flight = b.speed * s * (1 - (DRAG * a) / b.life);
    for (let i = 0; i < count && n < room; i++, n++) {
      const up = 0.25 + (0.75 * (i + 0.5)) / count;
      const around = i * 2.399963 + wave;
      const r = Math.sqrt(1 - up * up);
      const k = (offset + n) * 3;
      positions[k] = origin[0] + r * Math.cos(around) * flight;
      positions[k + 1] = origin[1] + up * flight - GRAVITY * s * s * 0.5;
      positions[k + 2] = origin[2] + r * Math.sin(around) * flight;
      const tint = b.gold && i % 2 === 0 ? GOLD : color;
      const c = (offset + n) * 4;
      colors[c] = tint[0];
      colors[c + 1] = tint[1];
      colors[c + 2] = tint[2];
      colors[c + 3] = fade;
    }
  }
  return n;
}
