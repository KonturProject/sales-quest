import { describe, expect, it } from 'vitest';
import type { MetricRecord } from '../../../src/data/schemas/records.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { prepare, type EngineInput } from '../../../src/engine/prepare.ts';
import { computeTeamProgress } from '../../../src/engine/progress.ts';
import { buildTimeline } from '../../../src/engine/timeline.ts';
import {
  at,
  daily,
  importLog,
  makeConfig,
  manager,
  managerPoints,
  team,
  teamReset,
  teamSteps,
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

  it('measures each team against its own pace: a team on its norms is on pace (OQ-21)', () => {
    const config = makeConfig({
      defaultDailyTargetPoints: 8,
      managers: [
        manager('c', 't2'),
        manager('n', 't2', { memberships: [{ teamId: 't2', from: '2026-10-12' }] }),
      ],
    });
    // Plan 80 + 40 = 120; c earned exactly week 1's norm, 5 × 8 = 40 → 40 / 120 × 20 = 6.7.
    const records = [daily('c', '2026-10-09', { pay: 4 })];
    const t2 = computeGameState(
      { config, records, adjustments: [], imports: [] },
      at('2026-10-12'),
    ).teams.find((t) => t.teamId === 't2');
    expect([t2?.position, t2?.pacePosition, t2?.deltaVsPace]).toEqual([6, 6, 0]);
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
    const later = [...imports, importLog('i3', '2026-10-13T09:00:00+03:00')];
    expect(computeGameState(input([], { imports: later }), at('2026-10-12')).dataAsOf).toBe(
      '2026-10-12T08:00:00+01:00',
    );
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

  it('sees the data as it stood on the day: later imports and adjustments are not seen yet (D-35)', () => {
    const records = [
      daily('a', '2026-10-06', { pay: 1 }, 'imp-06'),
      daily('a', '2026-10-07', { pay: 2 }, 'imp-07'),
    ];
    const imports = [
      { ...importLog('imp-06', '2026-10-07T09:00:00+03:00') },
      { ...importLog('imp-07', '2026-10-08T09:00:00+03:00') },
    ];
    const adjustments = [managerPoints('p1', 'a', 5, at('2026-10-08'), '2026-10-06')];
    const points = (now: string) =>
      computeGameState(input(records, { imports, adjustments }), now).managers.find(
        (m) => m.managerId === 'a',
      )?.points;
    // On the 7th only the import of the 7th morning is in: the 6th's payment.
    expect(points(at('2026-10-07', '18:00'))).toBe(10);
    // On the 8th: the 7th's data and the correction made that day.
    expect(points(at('2026-10-08', '18:00'))).toBe(35);
    // Records without a known import are always seen.
    expect(
      computeGameState(input([daily('a', '2026-10-06', { pay: 1 }, 'manual')]), at('2026-10-06'))
        .teams[0]?.points,
    ).toBe(10);
  });

  it('warns when a team with members has a plan of 0 points', () => {
    const config = makeConfig({
      managers: [manager('z', 't1', { dailyNorms: { inv6: 0, inv20: 0, pay: 0 } })],
    });
    const state = computeGameState(
      { config, records: [daily('z', '2026-10-06', { pay: 1 })], adjustments: [], imports: [] },
      at('2026-10-12'),
    );
    expect(state.warnings).toEqual(['у команды t1 план 0 баллов — фигурка не сдвинется']);
  });

  it('warns about point corrections outside the game or for unknown managers (D-25)', () => {
    const adjustments = [
      managerPoints('late', 'a', 30, at('2026-10-19')),
      managerPoints('who', 'ghost', 5, at('2026-10-06')),
    ];
    const warnings = computeGameState(input([], { adjustments }), at('2026-10-20')).warnings;
    expect(warnings.some((w) => w.includes('late') && w.includes('вне периода'))).toBe(true);
    expect(warnings.some((w) => w.includes('who') && w.includes('ghost'))).toBe(true);
  });
});

describe('buildTimeline', () => {
  it('gives standings at the end of every completed working day', () => {
    const records = [daily('a', '2026-10-05', { pay: 3 }), daily('b', '2026-10-07', { pay: 3 })];
    const timeline = buildTimeline(prepare(input(records)), '2026-10-08');
    expect(timeline.map((d) => [d.date, d.teams[0]?.pacePosition, d.teams[0]?.position])).toEqual([
      ['2026-10-05', 2, 4],
      ['2026-10-06', 4, 4],
      ['2026-10-07', 6, 8],
    ]);
  });

  it('matches computeTeamProgress day by day: transfers, corrections, steps, resets', () => {
    const config = makeConfig({
      managers: [
        manager('a', 't1', {
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-12' },
          ],
        }),
        manager('b', 't2', { dailyNorms: { inv6: 3, inv20: 1, pay: 0.2 } }),
        manager('n', 't1', { memberships: [{ teamId: 't1', from: '2026-10-13' }] }),
      ],
    });
    const records = [
      daily('a', '2026-10-06', { pay: 2, inv6: 3 }),
      daily('a', '2026-10-13', { pay: 1 }),
      daily('b', '2026-10-07', { inv20: 4 }),
      daily('b', '2026-10-10', { pay: 1 }), // Saturday
      daily('n', '2026-10-14', { inv6: 7 }),
    ];
    const adjustments = [
      managerPoints('p1', 'a', 12.5, at('2026-10-14'), '2026-10-08'),
      teamSteps('s1', 't1', 2, at('2026-10-07', '18:00')),
      teamReset('r1', 't2', 3, at('2026-10-12', '09:00')),
      teamSteps('s2', 't2', 1, at('2026-10-15')),
    ];
    const p = prepare({ config, records, adjustments, imports: [] });
    const timeline = buildTimeline(p, '2026-10-17');
    expect(timeline.map((d) => [d.date.slice(8), d.working])).toEqual([
      ['05', true],
      ['06', true],
      ['07', true],
      ['08', true],
      ['09', true],
      ['10', false], // b's Saturday payment moves t2 on Saturday
      ['11', false],
      ['12', true],
      ['13', true],
      ['14', true],
      ['15', true],
      ['16', true],
    ]);
    for (const day of timeline)
      expect(day.teams).toEqual(
        computeTeamProgress({ ...p, asOf: day.date }).map((t, i) => ({
          ...t,
          pacePosition: day.teams[i]?.pacePosition,
        })),
      );
    // Days off keep Friday's pace line.
    const friday = timeline[4]?.teams[0]?.pacePosition;
    expect(timeline.slice(4, 7).map((d) => d.teams[0]?.pacePosition)).toEqual([
      friday,
      friday,
      friday,
    ]);
  });

  it('after the game, its last day takes later corrections and matches the state (D-29)', () => {
    const records = [daily('a', '2026-10-16', { pay: 7 }), daily('a', '2026-10-17', { pay: 1 })];
    const adjustments = [teamSteps('s1', 't1', 2, at('2026-10-19'))];
    const state = computeGameState(input(records, { adjustments }), at('2026-10-20'));
    const last = state.timeline[state.timeline.length - 1];
    expect([last?.date, last?.working, state.timeline.length]).toEqual(['2026-10-18', false, 14]);
    const pick = (t: {
      teamId: string;
      points: number;
      computedPosition: number;
      position: number;
    }) => [t.teamId, t.points, t.computedPosition, t.position];
    expect(last?.teams.map(pick)).toEqual(state.teams.map(pick));
    // Friday 70 + Saturday 10 = 80 of 150 → cell 10, + 2 steps given after the game → 12.
    expect(state.teams[0]?.position).toBe(12);
  });
});
