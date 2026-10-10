import { describe, expect, it } from 'vitest';
import { EMPTY_PLAN, planMoves } from '../../../src/scene/choreography.ts';
import { buildLayout } from '../../../src/scene/layout.ts';
import { themeOf } from '../../../src/scene/themes.ts';
import {
  SCHEME_TIMING,
  TICK_MS,
  nextMoves,
  readEvery,
  schemeLayout,
  shortName,
  tokenCell,
  viewBox,
  zoomOn,
} from '../../../src/scheme/geometry.ts';

const track = { cellsPerLocation: 8, trackLength: 32, overflowCells: 6 };
const themes = ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf);

describe('the 2D scheme (GFX-6)', () => {
  it('lays the same cells in the same order as the scene, in two rows that fit one screen', () => {
    const scheme = schemeLayout(track, themes);
    const scene = buildLayout(track, themes);
    const sig = (l: typeof scene) =>
      l.spots.map((s) => `${s.position}:${s.kind}:${s.locationIndex}`);
    expect(sig(scheme)).toEqual(sig(scene));
    const { minX, maxX, minZ, maxZ } = scheme.bounds;
    const aspect = (maxX - minX) / (maxZ - minZ);
    expect(aspect).toBeGreaterThan(1.3);
    expect(aspect).toBeLessThan(2.5);
    for (const s of scheme.spots) {
      expect(s.x).toBeGreaterThanOrEqual(minX);
      expect(s.x).toBeLessThanOrEqual(maxX);
    }
    expect(viewBox(scheme.bounds)).toBe(`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`);
  });

  it('folds the cells beyond the finish into three rows next to it, so the scheme stays compact', () => {
    const scheme = schemeLayout(track, themes);
    const extra = scheme.spots.filter((s) => s.kind === 'overflow');
    expect(extra).toHaveLength(6);
    expect(new Set(extra.map((s) => s.z.toFixed(3))).size).toBe(3);
    const finish = scheme.spots[track.trackLength];
    const panelsLeft = Math.min(...scheme.panels.map((p) => p.x0));
    // The finish of the snake is at the left of its second row: the block stays near it.
    expect(Math.min(...extra.map((s) => s.x))).toBeGreaterThan(panelsLeft - 4 * scheme.cellSize);
    expect(extra.every((s) => Math.abs(s.z - (finish?.z ?? 0)) <= scheme.cellSize * 1.2)).toBe(
      true,
    );
    for (const s of scheme.spots) {
      expect(s.x).toBeGreaterThan(scheme.bounds.minX);
      expect(s.x).toBeLessThan(scheme.bounds.maxX);
      expect(s.z).toBeGreaterThan(scheme.bounds.minZ);
      expect(s.z).toBeLessThan(scheme.bounds.maxZ);
    }
  });

  it('writes a leader short: the first name and an initial', () => {
    expect(shortName('Алина Смирнова')).toBe('Алина С.');
    expect(shortName('Глеб')).toBe('Глеб');
    expect(shortName('  Анна-Мария  Петрова-Водкина ')).toBe('Анна-Мария П.');
  });

  it('zooms on a point and keeps the board filling the view', () => {
    const b = { minX: 0, maxX: 40, minZ: 0, maxZ: 20 };
    expect(zoomOn(b, { x: 20, z: 10 }, 1)).toEqual({ tx: 0, ty: 0, scale: 1 });
    // The centre: the point stays in the middle.
    expect(zoomOn(b, { x: 20, z: 10 }, 2)).toEqual({ tx: -20, ty: -10, scale: 2 });
    // A corner: clamped so no empty space shows.
    expect(zoomOn(b, { x: 0, z: 0 }, 2)).toEqual({ tx: 0, ty: 0, scale: 2 });
    expect(zoomOn(b, { x: 40, z: 20 }, 2)).toEqual({ tx: -40, ty: -20, scale: 2 });
  });

  it('steps a token cell by cell along the plan, as the scene hops (FR-MOVE-1)', () => {
    const plan = planMoves(
      [
        { teamId: 'a', position: 3 },
        { teamId: 'b', position: 5 },
      ],
      [
        { teamId: 'a', position: 6 },
        { teamId: 'b', position: 5 },
      ],
      SCHEME_TIMING,
    );
    const hop = plan.moves[0]?.hopMs ?? 0;
    expect(SCHEME_TIMING.flyMs).toBe(0); // no camera to fly in 2D
    expect(tokenCell(plan, 'a', 0, 6)).toEqual({ cell: 3, hopMs: hop });
    // A hop under way: the token heads for the next cell, the CSS transition takes it there.
    expect(tokenCell(plan, 'a', hop * 0.5, 6).cell).toBe(4);
    expect(tokenCell(plan, 'a', hop * 1.5, 6).cell).toBe(5);
    expect(tokenCell(plan, 'a', plan.duration, 6).cell).toBe(6);
    expect(tokenCell(plan, 'b', hop, 5).cell).toBe(5);
  });
});

describe('moves of the 2D scheme over time (review 3c)', () => {
  const at = (a: number, b: number) => [
    { teamId: 'a', position: a },
    { teamId: 'b', position: b },
  ];
  const start = { positions: at(3, 5), trackKey: '32|40', plan: EMPTY_PLAN };

  it('plans a walk from new positions; equal positions keep the walk going', () => {
    const walking = nextMoves(start, at(6, 5), '32|40', []);
    expect(walking.restart).toBe(true);
    expect(walking.plan.moves.map((m) => [m.teamId, m.from, m.to])).toEqual([['a', 3, 6]]);
    // A recompute with the same values (a re-publish, the midnight recompute): the plan goes on.
    const again = nextMoves(walking, at(6, 5), '32|40', []);
    expect(again.restart).toBe(false);
    expect(again.plan).toBe(walking.plan);
  });

  it('plays nothing across tracks or seasons (FR-MOVE-4)', () => {
    const other = nextMoves(start, at(1, 2), '64|80', []);
    expect(other.restart).toBe(true);
    expect(other.plan).toBe(EMPTY_PLAN);
    expect(other.trackKey).toBe('64|80');
  });

  it('reads the plan at least once per hop, never more often than every 40 ms', () => {
    expect(readEvery(EMPTY_PLAN)).toBe(TICK_MS);
    const long = planMoves(at(0, 0), at(40, 0), SCHEME_TIMING);
    expect(readEvery(long)).toBe(long.moves[0]?.hopMs);
    const huge = planMoves(at(0, 0), at(400, 0), SCHEME_TIMING);
    expect(readEvery(huge)).toBe(40);
  });
});
