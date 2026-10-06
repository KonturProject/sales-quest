import { describe, expect, it } from 'vitest';
import type { MetricRecord } from '../../../src/data/schemas/records.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { prepare, type EngineInput } from '../../../src/engine/prepare.ts';
import { buildTimeline } from '../../../src/engine/timeline.ts';
import {
  at,
  daily,
  importLog,
  makeConfig,
  manager,
  managerPoints,
  team,
} from '../../support/builders.ts';

const input = (records: MetricRecord[], extra: Partial<EngineInput> = {}): EngineInput => ({
  config: makeConfig({
    managers: [
      manager('a', 't1'),
      manager('b', 't1'),
      manager('c', 't2', { firedAt: '2026-10-09' }),
    ],
  }),
  records,
  adjustments: [],
  imports: [],
  ...extra,
});

describe('computeGameState', () => {
  it('reproduces the spec example: 990 of 1200 points → cell 33 of 40 (FR-STEP-4, D-24)', () => {
    const config = makeConfig({
      period: { start: '2026-10-05', end: '2026-10-30' }, // 20 working days → 40 cells
      teams: [team('t1', 1)],
      managers: Array.from({ length: 8 }, (_, i) => manager(`m${i + 1}`, 't1')),
    });
    const records = [
      daily('m1', '2026-10-07', { pay: 60 }),
      daily('m2', '2026-10-07', { inv20: 80 }),
      daily('m3', '2026-10-07', { inv6: 150 }),
    ];
    const state = computeGameState(
      { config, records, adjustments: [], imports: [] },
      at('2026-10-30', '18:00'),
    );
    expect(state.track.trackLength).toBe(40);
    const t1 = state.teams[0];
    expect([t1?.targetPoints, t1?.points, t1?.progress, t1?.position, t1?.locationIndex]).toEqual([
      1200, 990, 0.825, 33, 4,
    ]);
  });

  it('is deterministic and ignores a repeated import (FR-STEP-5)', () => {
    const records = [daily('a', '2026-10-06', { pay: 2 }), daily('b', '2026-10-07', { inv6: 5 })];
    const now = at('2026-10-12');
    expect(computeGameState(input(records), now)).toEqual(computeGameState(input(records), now));
    expect(computeGameState(input([...records, ...records]), now)).toEqual(
      computeGameState(input(records), now),
    );
  });

  it('places teams against the pace line and in locations (FR-PACE-1, FR-PACE-3)', () => {
    const state = computeGameState(
      input([daily('a', '2026-10-06', { pay: 3 })]), // 30 / 150 → 4
      at('2026-10-12'),
    );
    const t1 = state.teams.find((t) => t.teamId === 't1');
    expect([
      t1?.position,
      t1?.pacePosition,
      t1?.deltaVsPace,
      t1?.locationIndex,
      t1?.headcount,
    ]).toEqual([4, 10, -6, 1, 2]);
  });

  it('gives managers weekly points and hides the fired from the ranking (R-5)', () => {
    const records = [
      daily('a', '2026-10-06', { pay: 1 }),
      daily('a', '2026-10-13', { pay: 2 }),
      daily('c', '2026-10-06', { pay: 9 }),
    ];
    const state = computeGameState(input(records), at('2026-10-16'));
    const a = state.managers.find((m) => m.managerId === 'a');
    expect([a?.points, a?.weekly, a?.rank]).toEqual([30, { 1: 10, 2: 20 }, 1]);
    expect(state.managers.find((m) => m.managerId === 'c')?.rank).toBeNull();
  });

  it('reports the latest import as dataAsOf and warns about unknown managers', () => {
    const imports = [
      importLog('i1', '2026-10-12T09:00:00+03:00'), // 06:00 UTC
      importLog('i2', '2026-10-12T08:00:00+01:00'), // 07:00 UTC — later, though "08" < "09"
    ];
    const state = computeGameState(
      input([daily('ghost', '2026-10-06', { pay: 1 })], { imports }),
      at('2026-10-12'),
    );
    expect(state.dataAsOf).toBe('2026-10-12T08:00:00+01:00');
    expect(state.warnings.some((w) => w.includes('ghost'))).toBe(true);
    expect(state.unlocks).toEqual([]);
    expect(computeGameState(input([]), at('2026-10-12')).dataAsOf).toBeNull();
  });

  it('agrees between teams and managers when data is dated after now', () => {
    const records = [daily('a', '2026-10-06', { pay: 1 }), daily('a', '2026-10-13', { pay: 2 })];
    const state = computeGameState(input(records), at('2026-10-08'));
    const a = state.managers.find((m) => m.managerId === 'a');
    expect([state.teams[0]?.points, a?.points, a?.weekly]).toEqual([10, 10, { 1: 10, 2: 0 }]);
  });

  it('warns about point corrections outside the game or for unknown managers (D-25)', () => {
    const adjustments = [
      managerPoints('late', 'a', 30, at('2026-10-19')),
      managerPoints('who', 'ghost', 5, at('2026-10-06')),
    ];
    const warnings = computeGameState(input([], { adjustments }), at('2026-10-12')).warnings;
    expect(warnings.some((w) => w.includes('late') && w.includes('вне периода'))).toBe(true);
    expect(warnings.some((w) => w.includes('who') && w.includes('ghost'))).toBe(true);
  });
});

describe('buildTimeline', () => {
  it('gives standings at the end of every completed working day', () => {
    const records = [daily('a', '2026-10-05', { pay: 3 }), daily('b', '2026-10-07', { pay: 3 })];
    const timeline = buildTimeline(prepare(input(records)), '2026-10-08');
    expect(timeline.map((d) => [d.date, d.pacePosition, d.teams[0]?.position])).toEqual([
      ['2026-10-05', 2, 4],
      ['2026-10-06', 4, 4],
      ['2026-10-07', 6, 8],
    ]);
  });
});
