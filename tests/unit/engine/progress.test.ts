import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { activeAdjustments } from '../../../src/engine/adjustments.ts';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeTeamProgress } from '../../../src/engine/progress.ts';
import { buildDailySeries } from '../../../src/engine/scoring.ts';
import { buildTrack } from '../../../src/engine/track.ts';
import {
  at,
  daily,
  makeConfig,
  manager,
  managerPoints,
  seasonReset,
  teamReset,
  teamSteps,
} from '../../support/builders.ts';

// t1: a + b without norms → target 2 × 7.5 × 10 = 150; t2: c → 75. Track: 20 cells, max 30.
const base = makeConfig({
  managers: [manager('a', 't1'), manager('b', 't1'), manager('c', 't2')],
});

function progress(
  records: MetricRecord[],
  adjustments: Adjustment[] = [],
  config: SeasonConfig = base,
  asOf = '2026-10-18',
) {
  const calendar = buildCalendar(config);
  const track = buildTrack(config, calendar.workingDays.length);
  const { series } = buildDailySeries(records, config.period);
  const result = computeTeamProgress({ config, calendar, track, series, adjustments, asOf });
  return Object.fromEntries(result.map((t) => [t.teamId, t]));
}

// 50 + 25 = 75 points for t1
const half = [
  daily('a', '2026-10-06', { pay: 5 }),
  daily('b', '2026-10-07', { inv20: 5, inv6: 10 }),
];

describe('computeTeamProgress — plan_percent', () => {
  it('half the plan puts the team at half the track', () => {
    const t1 = progress(half).t1;
    expect([t1?.points, t1?.targetPoints, t1?.progress, t1?.position]).toEqual([75, 150, 0.5, 10]);
  });

  it('caps a team beyond the plan at the end of the overflow zone (D-24)', () => {
    expect(progress([daily('a', '2026-10-06', { pay: 30 })]).t1?.position).toBe(30);
  });

  it("gives each day's points to the team the manager was in that day (R-1)", () => {
    const moved = manager('x', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 't2', from: '2026-10-12' },
      ],
    });
    const config = { ...base, managers: [...base.managers, moved] };
    const result = progress(
      [daily('x', '2026-10-06', { pay: 1 }), daily('x', '2026-10-13', { pay: 2 })],
      [],
      config,
    );
    expect([result.t1?.points, result.t2?.points]).toEqual([10, 20]);
  });

  it('counts only data up to asOf and ignores managers not in the roster', () => {
    const records = [
      ...half,
      daily('a', '2026-10-14', { pay: 3 }),
      daily('ghost', '2026-10-06', { pay: 9 }),
    ];
    expect(progress(records, [], base, '2026-10-07').t1?.points).toBe(75);
  });

  it('never moves a team below the start, even with negative points', () => {
    expect(progress([], [managerPoints('p', 'a', -50, at('2026-10-06'))]).t1?.position).toBe(0);
  });
});

describe('computeTeamProgress — other modes', () => {
  it('per_capita: points against the default target per average member', () => {
    const normed = {
      ...base,
      managers: [
        manager('a', 't1', { dailyNorms: { inv6: 2, inv20: 1, pay: 0.5 } }),
        manager('b', 't1'),
      ],
    };
    expect(progress(half, [], normed).t1?.position).toBe(8); // plan_percent: 75 / 175
    expect(progress(half, [], { ...normed, progressMode: 'per_capita' }).t1?.position).toBe(10); // 75 / 150
  });

  it('absolute: one cell per pointsPerStep', () => {
    const config = { ...base, progressMode: 'absolute' as const, pointsPerStep: 10 };
    expect(progress(half, [], config).t1?.position).toBe(7);
  });

  it('absolute without pointsPerStep is a config error', () => {
    expect(() => progress(half, [], { ...base, progressMode: 'absolute' })).toThrow(
      'pointsPerStep',
    );
  });
});

describe('adjustments (ADM-STEPS, ADM-RESET, D-17)', () => {
  it('manager_points add to the team; revoked and future ones do not', () => {
    const revoked = {
      ...managerPoints('r', 'a', 100, at('2026-10-06')),
      revoked: { by: 'admin', at: at('2026-10-06', '13:00'), reason: 'ошибка' },
    };
    const result = progress(half, [
      managerPoints('p', 'a', 15, at('2026-10-06')),
      revoked,
      managerPoints('f', 'a', 100, at('2026-10-20')),
    ]);
    expect(result.t1?.points).toBe(90);
  });

  it('team_steps move the figure', () => {
    expect(progress(half, [teamSteps('s', 't1', 3, at('2026-10-06'))]).t1?.position).toBe(13);
    expect(progress(half, [teamSteps('s', 't1', -20, at('2026-10-06'))]).t1?.position).toBe(0);
  });

  it('team_reset removes the position it stored; steps before it are dropped', () => {
    const adjustments = [
      teamSteps('s1', 't1', 2, at('2026-10-06', '10:00')),
      teamReset('r', 't1', 10, at('2026-10-07')),
      teamSteps('s2', 't1', 1, at('2026-10-08')),
    ];
    expect(progress(half, adjustments).t1?.position).toBe(1); // 10 − 10 + 1
    const more = [...half, daily('b', '2026-10-09', { pay: 3 })]; // 105 → 14
    expect(progress(more, adjustments).t1?.position).toBe(5); // 14 − 10 + 1
  });

  it('season_reset resets every team with its own stored position', () => {
    const result = progress(
      [...half, daily('c', '2026-10-06', { pay: 3 })], // t1 → 10, t2: 30 / 75 → 8
      [seasonReset('r', { t1: 10, t2: 8 }, at('2026-10-08'))],
    );
    expect([result.t1?.position, result.t2?.position]).toEqual([0, 0]);
  });
});

describe('activeAdjustments', () => {
  it('orders by real time across offsets and drops revoked and later ones', () => {
    const early = teamSteps('early', 't1', 1, '2026-10-06T10:00:00+03:00'); // 07:00 UTC
    const late = teamSteps('late', 't1', 1, '2026-10-06T08:00:00Z');
    const next = teamSteps('next', 't1', 1, at('2026-10-07'));
    expect(activeAdjustments([late, next, early], '2026-10-06').map((a) => a.id)).toEqual([
      'early',
      'late',
    ]);
  });
});
