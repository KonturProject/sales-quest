import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { weightsOf } from '../../../src/engine/scoring.ts';
import {
  averageHeadcount,
  dailyTargetPoints,
  teamTargetPoints,
} from '../../../src/engine/targets.ts';
import { makeConfig, manager, team } from '../../support/builders.ts';

const norms = { inv6: 2, inv20: 1, pay: 0.5 }; // 2·1 + 1·3 + 0.5·10 = 10 points a day

function target(config: ReturnType<typeof makeConfig>, teamId = 't1') {
  return teamTargetPoints(teamId, config, buildCalendar(config), weightsOf(config));
}

describe('dailyTargetPoints (R-2, D-24)', () => {
  it('daily norms × weights, or the default without norms', () => {
    const weights = weightsOf(makeConfig());
    expect(dailyTargetPoints(manager('a', 't1', { dailyNorms: norms }), weights, 7.5)).toBe(10);
    expect(dailyTargetPoints(manager('b', 't1'), weights, 7.5)).toBe(7.5);
  });
});

describe('teamTargetPoints (FR-STEP-1, R-2)', () => {
  it('no norms: the default daily target over every working day', () => {
    expect(target(makeConfig({ managers: [manager('a', 't1'), manager('b', 't1')] }))).toBe(150);
  });

  it('daily norms × weights over the working days', () => {
    const config = makeConfig({
      managers: [manager('a', 't1', { dailyNorms: norms }), manager('b', 't1')],
    });
    expect(target(config)).toBe(100 + 75);
  });

  it('counts only the days spent in the team: joined late, fired, transferred', () => {
    const config = makeConfig({
      managers: [
        manager('late', 't1', { memberships: [{ teamId: 't1', from: '2026-10-12' }] }),
        manager('fired', 't1', { firedAt: '2026-10-07' }),
        manager('moved', 't1', {
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-12' },
          ],
        }),
      ],
    });
    expect(target(config, 't1')).toBe((5 + 3 + 5) * 7.5);
    expect(target(config, 't2')).toBe(5 * 7.5);
  });

  it('an explicit team target wins', () => {
    const config = makeConfig({
      teams: [team('t1', 1, { targetPoints: 500 })],
      managers: [manager('a', 't1')],
    });
    expect(target(config)).toBe(500);
  });

  it('follows the weights (R-4)', () => {
    const config = makeConfig({ managers: [manager('a', 't1', { dailyNorms: norms })] });
    const heavierPay = {
      ...config,
      metrics: config.metrics.map((m) => (m.id === 'pay' ? { ...m, weight: 20 } : m)),
    };
    expect(target(config)).toBe(100);
    expect(target(heavierPay)).toBe(150);
  });
});

describe('averageHeadcount (R-3)', () => {
  it('member working days divided by the game working days', () => {
    const config = makeConfig({
      managers: [
        manager('a', 't1'),
        manager('late', 't1', { memberships: [{ teamId: 't1', from: '2026-10-12' }] }),
      ],
    });
    expect(averageHeadcount('t1', config, buildCalendar(config))).toBe(1.5);
  });
});
