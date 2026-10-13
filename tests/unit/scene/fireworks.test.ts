import { describe, expect, it } from 'vitest';
import { BURST_MS } from '../../../src/scene/choreography.ts';
import { BURSTS, POOL, writeSparks } from '../../../src/scene/fireworks.ts';

const buffers = () => ({
  positions: new Float32Array(POOL * 3),
  /** RGBA: the alpha fades — the sparks must read on the light locations too (no additive blending). */
  colors: new Float32Array(POOL * 4),
});
const RED: [number, number, number] = [1, 0.2, 0.1];

describe('fireworks (D-57)', () => {
  it('each kind fits the pool and lives exactly as long as the plan keeps it', () => {
    for (const [kind, b] of Object.entries(BURSTS)) {
      expect(b.sparks * b.waves.length).toBeLessThanOrEqual(POOL);
      expect(Math.max(...b.waves) + b.life).toBe(BURST_MS[kind as keyof typeof BURSTS]);
    }
  });

  it('a burst is a function of its age: at 0 at the origin, then outwards, then gone', () => {
    const { positions, colors } = buffers();
    const n0 = writeSparks('gate', 0, [1, 2, 3], RED, positions, colors, 0, POOL, 1);
    expect(n0).toBe(BURSTS.gate.sparks);
    expect([positions[0], positions[1], positions[2]]).toEqual([1, 2, 3]);
    const n1 = writeSparks('gate', 400, [1, 2, 3], RED, positions, colors, 0, POOL, 1);
    expect(n1).toBe(BURSTS.gate.sparks);
    const d = Math.hypot((positions[0] ?? 0) - 1, (positions[1] ?? 0) - 2, (positions[2] ?? 0) - 3);
    expect(d).toBeGreaterThan(0.3);
    expect(writeSparks('gate', BURST_MS.gate, [1, 2, 3], RED, positions, colors, 0, POOL, 1)).toBe(
      0,
    );
  });

  it('the pool never overflows: a burst writes at most the room left; half quality — half', () => {
    const { positions, colors } = buffers();
    expect(writeSparks('finish', 1000, [0, 0, 0], RED, positions, colors, 190, 10, 1)).toBe(10);
    const half = writeSparks('gate', 100, [0, 0, 0], RED, positions, colors, 0, POOL, 0.5);
    expect(half).toBe(BURSTS.gate.sparks / 2);
  });

  it('the finish fires its waves one after another; gold in a leader and a finish', () => {
    const { positions, colors } = buffers();
    const first = writeSparks('finish', 100, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    const later = writeSparks('finish', 1000, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    expect(later).toBeGreaterThan(first);
    writeSparks('leader', 50, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    // Some sparks are gold: green as high as red.
    const gold = Array.from({ length: BURSTS.leader.sparks }, (_, i) => colors[i * 4 + 1] ?? 0);
    expect(gold.some((g, i) => g > 0.6 * (colors[i * 4] ?? 0))).toBe(true);
  });

  it('a spark keeps its colour and fades by its alpha', () => {
    const { positions, colors } = buffers();
    writeSparks('gate', 100, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    expect([colors[0], colors[1], colors[2]]).toEqual([...RED].map((c) => Math.fround(c)));
    const early = colors[3] ?? 0;
    writeSparks('gate', 1200, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    expect(colors[3] ?? 0).toBeLessThan(early);
    expect(colors[0]).toBe(Math.fround(RED[0]));
  });
});
