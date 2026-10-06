import { describe, expect, it } from 'vitest';
import {
  addValues,
  buildDailySeries,
  pointsOf,
  totalsBetween,
  weightsOf,
  type MetricValues,
} from '../../../src/engine/scoring.ts';
import { daily, makeConfig, snapshot } from '../../support/builders.ts';

const period = { start: '2026-10-05', end: '2026-10-18' };

describe('buildDailySeries (DATA-5, DATA-6, FR-STEP-5)', () => {
  it('merges daily records; the later value of a metric wins', () => {
    const records = [
      daily('m1', '2026-10-06', { inv6: 2, inv20: 1 }),
      daily('m1', '2026-10-06', { pay: 1 }, 'imp-2'),
      daily('m1', '2026-10-06', { inv6: 3 }, 'imp-3'),
    ];
    const { series } = buildDailySeries(records, period);
    expect(series.get('m1')?.get('2026-10-06')).toEqual({ inv6: 3, inv20: 1, pay: 1 });
  });

  it('re-importing the same records changes nothing', () => {
    const records = [daily('m1', '2026-10-06', { pay: 1 }), daily('m2', '2026-10-07', { inv6: 4 })];
    expect(buildDailySeries([...records, ...records], period)).toEqual(
      buildDailySeries(records, period),
    );
  });

  it('ignores daily records outside the period (DATA-7)', () => {
    const { series } = buildDailySeries([daily('m1', '2026-10-02', { pay: 1 })], period);
    expect(series.size).toBe(0);
  });

  it('turns running-total snapshots into daily differences, counting from the last one before the start', () => {
    const records = [
      snapshot('m1', '2026-10-02', { pay: 4 }),
      snapshot('m1', '2026-10-06', { pay: 6 }),
      snapshot('m1', '2026-10-09', { pay: 9 }),
      snapshot('m1', '2026-10-20', { pay: 12 }),
    ];
    const days = buildDailySeries(records, period).series.get('m1');
    expect(Object.fromEntries(days ?? [])).toEqual({
      '2026-10-06': { pay: 2 },
      '2026-10-09': { pay: 3 },
    });
  });

  it('prefers daily records over snapshots of the same metric and says so', () => {
    const records = [
      daily('m1', '2026-10-06', { pay: 1 }),
      snapshot('m1', '2026-10-07', { pay: 5, inv6: 4 }),
    ];
    const { series, warnings } = buildDailySeries(records, period);
    expect(Object.fromEntries(series.get('m1') ?? [])).toEqual({
      '2026-10-06': { pay: 1 },
      '2026-10-07': { inv6: 4 },
    });
    expect(warnings.filter((w) => w.includes('и по дням, и снимками'))).toHaveLength(1);
    expect(warnings[0]).toContain('m1');
  });

  it('warns when there is no snapshot before the start: the first one lands in full on its day', () => {
    const { series, warnings } = buildDailySeries(
      [snapshot('m1', '2026-10-06', { pay: 6 })],
      period,
    );
    expect(series.get('m1')?.get('2026-10-06')).toEqual({ pay: 6 });
    expect(warnings).toEqual([
      'm1: «pay» — нет снимка до начала игры, итог на 2026-10-06 целиком отнесён к этому дню',
    ]);
  });

  it('warns when a running total goes down', () => {
    const records = [
      snapshot('m1', '2026-10-02', { pay: 4 }),
      snapshot('m1', '2026-10-06', { pay: 6 }),
      snapshot('m1', '2026-10-08', { pay: 5 }),
    ];
    const { series, warnings } = buildDailySeries(records, period);
    expect(series.get('m1')?.get('2026-10-08')).toEqual({ pay: -1 });
    expect(warnings).toEqual(['m1: «pay» — итог на 2026-10-08 меньше предыдущего (5 < 6)']);
  });
});

describe('points', () => {
  it('scores with the season weights and ignores metrics the season does not have', () => {
    const weights = weightsOf(makeConfig());
    expect(weights).toEqual({ inv6: 1, inv20: 3, pay: 10 });
    expect(pointsOf({ inv6: 150, inv20: 80, pay: 60, calls: 99 }, weights)).toBe(990);
  });

  it('adds values and sums a manager over a date range', () => {
    expect(addValues({ pay: 1 }, { pay: 2, inv6: 1 })).toEqual({ pay: 3, inv6: 1 });
    const days = new Map<string, MetricValues>([
      ['2026-10-06', { pay: 1 }],
      ['2026-10-07', { pay: 2, inv6: 3 }],
      ['2026-10-12', { pay: 5 }],
    ]);
    expect(totalsBetween(days, '2026-10-06', '2026-10-07')).toEqual({ pay: 3, inv6: 3 });
    expect(totalsBetween(undefined, '2026-10-06', '2026-10-07')).toEqual({});
  });
});
