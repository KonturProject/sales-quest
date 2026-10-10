import { describe, expect, it } from 'vitest';
import {
  GATE_LINTEL,
  GATE_PILLAR,
  gateHeight,
  gatePlacements,
  lintelThickness,
} from '../../../src/scene/gates.ts';
import { buildLayout } from '../../../src/scene/layout.ts';
import { themeOf } from '../../../src/scene/themes.ts';

const layout = buildLayout(
  { cellsPerLocation: 8, trackLength: 32, overflowCells: 6 },
  ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf),
);
const pillar = { height: 4, width: 1.2 };
const lintel = { height: 3.6, width: 0.9 };

describe('gates of the pack (FR-TRACK-1, 3b BACKLOG)', () => {
  const placed = gatePlacements(layout, pillar, lintel);
  const gates = layout.spots.filter((s) => s.kind === 'checkpoint' || s.kind === 'finish');

  it('stands two pillars across the path at every checkpoint and the finish, a lintel on top', () => {
    expect(placed).toHaveLength(gates.length * 3);
    gates.forEach((spot, g) => {
      const [left, right, top] = placed.slice(g * 3, g * 3 + 3);
      expect([left?.id, right?.id, top?.id]).toEqual([GATE_PILLAR, GATE_PILLAR, GATE_LINTEL]);
      // Symmetric about the cell, across the way of travel (perpendicular to the heading).
      expect(((left?.x ?? 0) + (right?.x ?? 0)) / 2).toBeCloseTo(spot.x);
      expect(((left?.z ?? 0) + (right?.z ?? 0)) / 2).toBeCloseTo(spot.z);
      const across = { x: (left?.x ?? 0) - spot.x, z: (left?.z ?? 0) - spot.z };
      const along = { x: Math.cos(spot.heading), z: -Math.sin(spot.heading) };
      expect(across.x * along.x + across.z * along.z).toBeCloseTo(0);
      expect(Math.hypot(across.x, across.z)).toBeCloseTo(layout.cellSize * 0.75);
      // Pillars as tall as the gate; the lintel lies on them, as long as the gate is wide.
      expect((left?.scale ?? 0) * pillar.height).toBeCloseTo(gateHeight(layout.cellSize));
      expect(top?.lie).toBe(true);
      expect(top?.ground).toBeCloseTo(gateHeight(layout.cellSize) * 0.97);
      const length = (top?.scale ?? 0) * (top?.stretch ?? 1) * lintel.height;
      expect(length).toBeCloseTo(layout.cellSize * 1.5 + pillar.width * (left?.scale ?? 0));
      expect((top?.scale ?? 0) * lintel.width).toBeCloseTo(lintelThickness(layout.cellSize));
      expect((top?.scale ?? 0) * lintel.width).toBeLessThan(pillar.width * (left?.scale ?? 0));
    });
  });

  it('gilds the finish only', () => {
    const tints = gates.map((spot, g) => [spot.kind, placed[g * 3]?.tint ? 'gold' : 'stone']);
    expect(tints.filter(([kind]) => kind === 'finish')).toEqual([['finish', 'gold']]);
    expect(tints.filter(([kind]) => kind === 'checkpoint').every(([, t]) => t === 'stone')).toBe(
      true,
    );
  });
});
