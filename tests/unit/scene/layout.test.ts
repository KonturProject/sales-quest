import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../../src/engine/track.ts';
import {
  PANEL_DEPTH,
  PANEL_WIDTH,
  buildLayout,
  cellStack,
  panelPlacement,
  figureSpots,
  pointAlong,
  samplePath,
  slotOffsets,
} from '../../../src/scene/layout.ts';
import { PANEL_ASPECT, THEMES, themeOf } from '../../../src/scene/themes.ts';
import { makeConfig } from '../../support/builders.ts';

const themes = ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf);
const trackOf = (cellsPerWorkingDay: number) =>
  buildTrack({ ...makeConfig(), track: { cellsPerWorkingDay, overflowPct: 50 } }, 10);

describe('buildLayout (D-37, D-41)', () => {
  const track = trackOf(2); // 20 cells, 5 per location, 10 overflow
  const layout = buildLayout(track, themes);

  it('has a spot for every position from the start to the end of the overflow zone', () => {
    expect(layout.spots.map((s) => s.position)).toEqual(
      Array.from({ length: track.maxPosition + 1 }, (_, i) => i),
    );
    expect(layout.spots[0]?.kind).toBe('start');
    expect(layout.spots.filter((s) => s.kind === 'checkpoint').map((s) => s.position)).toEqual([
      5, 10, 15,
    ]);
    expect(layout.spots[20]?.kind).toBe('finish');
    expect(layout.spots.slice(21).every((s) => s.kind === 'overflow')).toBe(true);
  });

  it('puts each location on its own panel, left to right', () => {
    for (const panel of layout.panels) {
      const cells = layout.spots.filter(
        (s) =>
          s.locationIndex === panel.locationIndex && s.kind !== 'start' && s.kind !== 'overflow',
      );
      expect(cells).toHaveLength(5);
      for (const c of cells) {
        expect(c.x).toBeGreaterThan(panel.x0);
        expect(c.x).toBeLessThan(panel.x0 + PANEL_WIDTH);
        expect(Math.abs(c.z)).toBeLessThanOrEqual(PANEL_DEPTH / 2);
      }
    }
    const xs = layout.spots.map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b)); // the S-path never turns back
    expect(layout.spots[0]?.x).toBeLessThan(layout.panels[0]?.x0 ?? 0);
    expect(layout.spots[21]?.x).toBeGreaterThan((layout.panels[3]?.x0 ?? 0) + PANEL_WIDTH);
  });

  it('joins panels shaped like the art without gaps, path end to path start', () => {
    expect(PANEL_WIDTH / PANEL_DEPTH).toBeCloseTo(PANEL_ASPECT);
    layout.panels.forEach((panel, i) => {
      expect(panel.x0).toBeCloseTo(i * PANEL_WIDTH);
      const next = layout.panels[i + 1];
      const end = panel.path[panel.path.length - 1];
      if (next && end) expect(next.path[0]).toEqual({ x: end.x, z: end.z });
    });
  });

  it('keeps a snake in reserve: two rows, the second mirrored and travelling back (D-42)', () => {
    const snake = buildLayout(track, themes, 'snake');
    expect(snake.panels.map((p) => [p.x0, p.z0, p.mirrored])).toEqual(
      [0, 1, 2, 3].map((i) => {
        const p = panelPlacement(i, 4, 'snake');
        return [p.x0, p.z0, p.mirrored];
      }),
    );
    expect(snake.panels.map((p) => p.mirrored)).toEqual([false, false, true, true]);
    // Each location's cells stay on its panel; the second row runs right to left.
    for (const panel of snake.panels) {
      const cells = snake.spots.filter(
        (s) =>
          s.locationIndex === panel.locationIndex && s.kind !== 'start' && s.kind !== 'overflow',
      );
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(panel.x0);
        expect(c.x).toBeLessThanOrEqual(panel.x0 + PANEL_WIDTH);
        expect(Math.abs(c.z - panel.z0)).toBeLessThanOrEqual(PANEL_DEPTH / 2);
      }
      const xs = cells.map((c) => c.x);
      const sorted = [...xs].sort((a, b) => (panel.mirrored ? b - a : a - b));
      expect(xs).toEqual(sorted);
    }
    // Within a row the paths join; the overflow goes on to the left, past the last panel.
    const [p3, p4] = [snake.panels[2], snake.panels[3]];
    expect(p4?.path[0]).toEqual(p3?.path[p3.path.length - 1]);
    expect(snake.overflow.x1).toBeLessThan(0);
    const { minX, maxX, minZ, maxZ } = snake.bounds;
    expect((maxX - minX) / (maxZ - minZ)).toBeLessThan(3); // near a screen; the row is ~8:1
  });

  it('shrinks the cells when there are more of them (OQ-18)', () => {
    const fine = buildLayout(trackOf(8), themes);
    expect(fine.spots).toHaveLength(trackOf(8).maxPosition + 1);
    expect(fine.cellSize).toBeLessThan(layout.cellSize);
    expect(layout.bounds.minX).toBeLessThan(layout.spots[0]?.x ?? 0);
    expect(layout.bounds.maxX).toBeGreaterThan(layout.overflow.x1 - 1);
  });

  it('gives an unknown theme a neutral panel', () => {
    expect(themeOf('space').color).toBe('#808a94');
    expect(THEMES.volcano?.path[0]).toEqual({ u: 0, v: 0.5 });
  });
});

describe('paths', () => {
  it('sample through the control points', () => {
    const line = samplePath([
      { u: 0, v: 0.5 },
      { u: 0.5, v: 0.2 },
      { u: 1, v: 0.5 },
    ]);
    expect(line[0]).toEqual({ u: 0, v: 0.5 });
    expect(line[16]).toEqual({ u: 0.5, v: 0.2 });
    expect(line[line.length - 1]).toEqual({ u: 1, v: 0.5 });
  });

  it('measure points along their length, with the heading', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: -10 },
    ];
    expect(pointAlong(line, 0.25)).toEqual({ x: 5, z: 0, heading: 0 });
    const up = pointAlong(line, 0.75);
    expect([up.x, up.z, up.heading]).toEqual([10, -5, Math.PI / 2]);
  });
});

describe('slots (FR-MOVE-2)', () => {
  it('stack the plates of figures on one cell, the end of the track counting as its last cell', () => {
    const layout = buildLayout(trackOf(2), themes);
    const last = layout.spots.length - 1;
    const stack = cellStack(layout, [
      { teamId: 't1', position: 3 },
      { teamId: 't2', position: 3 },
      { teamId: 't3', position: 7 },
      { teamId: 't4', position: last },
      { teamId: 't5', position: last + 5 },
    ]);
    expect([...stack.entries()]).toEqual([
      ['t1', 0],
      ['t2', 1],
      ['t3', 0],
      ['t4', 0],
      ['t5', 1],
    ]);
  });

  it('give distinct places inside the cell to up to six figures', () => {
    expect(slotOffsets(1)).toEqual([{ x: 0, z: 0 }]);
    for (let n = 2; n <= 6; n++) {
      const slots = slotOffsets(n);
      expect(new Set(slots.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`)).size).toBe(n);
      for (const s of slots) expect(Math.hypot(s.x, s.z)).toBeLessThan(0.5);
    }
  });

  it('place teams that share a cell apart, others in the centre', () => {
    const layout = buildLayout(trackOf(2), themes);
    const spots = figureSpots(layout, [
      { teamId: 't1', position: 3 },
      { teamId: 't2', position: 3 },
      { teamId: 't3', position: 7 },
      { teamId: 't4', position: 99 },
    ]);
    const cell3 = layout.spots[3];
    expect(spots.get('t1')).not.toEqual(spots.get('t2'));
    expect(spots.get('t3')).toEqual({ x: layout.spots[7]?.x, z: layout.spots[7]?.z });
    expect(spots.get('t4')).toEqual({ x: layout.spots[30]?.x, z: layout.spots[30]?.z });
    expect(
      Math.hypot(
        (spots.get('t1')?.x ?? 0) - (cell3?.x ?? 0),
        (spots.get('t1')?.z ?? 0) - (cell3?.z ?? 0),
      ),
    ).toBeLessThan(layout.cellSize / 2);
  });
});
