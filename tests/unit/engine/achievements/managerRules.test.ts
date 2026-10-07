import { describe, expect, it } from 'vitest';
import type { AchievementDef, AchievementRule } from '../../../../src/data/schemas/achievements.ts';
import type { Adjustment, MetricRecord } from '../../../../src/data/schemas/records.ts';
import type { Manager } from '../../../../src/data/schemas/season.ts';
import { evaluateAchievements } from '../../../../src/engine/achievements/evaluate.ts';
import { prepare } from '../../../../src/engine/prepare.ts';
import {
  achievement,
  at,
  daily,
  makeConfig,
  manager,
  managerPoints,
} from '../../../support/builders.ts';

// Two-week game Mon 05.10 … Sun 18.10; week 1 = 05–11, week 2 = 12–18.
const roster = [manager('a', 't1'), manager('b', 't1'), manager('c', 't2')];

function unlocks(
  rule: AchievementRule,
  records: MetricRecord[],
  today = '2026-10-19',
  opts: { managers?: Manager[]; adjustments?: Adjustment[]; extra?: Partial<AchievementDef> } = {},
) {
  const config = makeConfig({
    managers: opts.managers ?? roster,
    achievements: [achievement('x', rule, opts.extra)],
  });
  const p = prepare({ config, records, adjustments: opts.adjustments ?? [], imports: [] });
  return evaluateAchievements(p, today).unlocks.map((u) => [u.managerId, u.unlockedAt, u.week]);
}

describe('threshold', () => {
  const day3: AchievementRule = {
    type: 'threshold',
    metric: 'pay',
    period: 'day',
    op: '>=',
    value: 3,
  };

  it('in a day: the first day with the value (hat trick)', () => {
    const records = [
      daily('a', '2026-10-06', { pay: 2 }),
      daily('a', '2026-10-08', { pay: 3 }),
      daily('a', '2026-10-13', { pay: 4 }),
    ];
    expect(unlocks(day3, records)).toEqual([['a', '2026-10-08', 1]]);
    expect(unlocks(day3, records, '2026-10-19', { extra: { repeatable: 'daily' } })).toEqual([
      ['a', '2026-10-08', 1],
      ['a', '2026-10-13', 2],
    ]);
  });

  it('over a week: on the day the running total reaches it, again next week if repeatable', () => {
    const rule: AchievementRule = {
      type: 'threshold',
      metric: 'inv20',
      period: 'week',
      op: '>=',
      value: 10,
    };
    const records = [
      daily('a', '2026-10-05', { inv20: 4 }),
      daily('a', '2026-10-07', { inv20: 6 }),
      daily('a', '2026-10-12', { inv20: 9 }),
      daily('a', '2026-10-16', { inv20: 1 }),
      daily('b', '2026-10-09', { inv20: 5 }),
      daily('b', '2026-10-12', { inv20: 5 }), // two weeks of 5 are not one week of 10
    ];
    expect(unlocks(rule, records)).toEqual([['a', '2026-10-07', 1]]);
    expect(unlocks(rule, records, '2026-10-19', { extra: { repeatable: 'weekly' } })).toEqual([
      ['a', '2026-10-07', 1],
      ['a', '2026-10-16', 2],
    ]);
  });

  it('over the game in points: a correction counts for its day (D-25), data after today does not', () => {
    const rule: AchievementRule = {
      type: 'threshold',
      metric: 'points',
      period: 'season',
      op: '>=',
      value: 100,
    };
    const records = [daily('a', '2026-10-06', { pay: 6 }), daily('b', '2026-10-13', { pay: 10 })];
    const adjustments = [managerPoints('p1', 'a', 40, at('2026-10-14'), '2026-10-08')];
    expect(unlocks(rule, records, '2026-10-19', { adjustments })).toEqual([
      ['a', '2026-10-08', 1],
      ['b', '2026-10-13', 2],
    ]);
    expect(unlocks(rule, records, '2026-10-12', { adjustments })).toEqual([['a', '2026-10-08', 1]]);
    expect(unlocks(rule, records, '2026-10-12')).toEqual([]);
  });
});

describe('streak', () => {
  const rule: AchievementRule = { type: 'streak', metric: 'pay', minPerDay: 1, days: 3 };

  it('counts working days in a row; the weekend neither breaks nor extends it', () => {
    const records = [
      daily('a', '2026-10-08', { pay: 1 }),
      daily('a', '2026-10-09', { pay: 2 }),
      daily('a', '2026-10-12', { pay: 1 }),
      daily('b', '2026-10-09', { pay: 1 }),
      daily('b', '2026-10-10', { pay: 1 }), // Saturday
      daily('b', '2026-10-12', { pay: 1 }),
      daily('c', '2026-10-05', { pay: 1 }),
      daily('c', '2026-10-06', { pay: 1 }),
      daily('c', '2026-10-08', { pay: 1 }), // a gap on Wednesday
    ];
    expect(unlocks(rule, records)).toEqual([['a', '2026-10-12', 2]]);
  });

  it('a second full run counts again for a repeatable achievement', () => {
    const days = ['05', '06', '07', '08', '09', '12'].map((d) =>
      daily('a', `2026-10-${d}`, { pay: 1 }),
    );
    expect(unlocks(rule, days, '2026-10-19', { extra: { repeatable: 'daily' } })).toEqual([
      ['a', '2026-10-07', 1],
      ['a', '2026-10-12', 2],
    ]);
  });
});

describe('ratio', () => {
  const rule: AchievementRule = {
    type: 'ratio',
    numerator: 'pay',
    denominator: ['inv6'],
    minRatio: 0.2,
    minDenominator: 10,
    period: 'season',
  };

  it('fires once the denominator is reached and the ratio holds (converter)', () => {
    const records = [
      daily('a', '2026-10-05', { inv6: 5 }),
      daily('a', '2026-10-06', { inv6: 5, pay: 1 }), // 1 / 10
      daily('a', '2026-10-07', { pay: 1 }), // 2 / 10
      daily('b', '2026-10-05', { inv6: 4, pay: 4 }), // a high ratio, too few invoices
    ];
    expect(unlocks(rule, records)).toEqual([['a', '2026-10-07', 1]]);
  });

  it('counts each week on its own for a weekly ratio', () => {
    const records = [daily('a', '2026-10-09', { inv6: 10 }), daily('a', '2026-10-12', { pay: 2 })];
    expect(unlocks({ ...rule, period: 'week' }, records)).toEqual([]);
    expect(unlocks(rule, records)).toEqual([['a', '2026-10-12', 2]]);
  });
});

describe('growth', () => {
  const rule: AchievementRule = {
    type: 'growth',
    metric: 'points',
    weekOverWeekPct: 50,
    minBase: 20,
  };

  it('fires in week 2 on the day it reaches +50 % of week 1, from a base of 20 (comeback)', () => {
    const records = [
      daily('a', '2026-10-06', { inv6: 20 }),
      daily('a', '2026-10-12', { inv6: 10 }),
      daily('a', '2026-10-13', { inv20: 7 }), // 10 + 21 = 31 ≥ 30
      daily('b', '2026-10-06', { inv6: 19 }), // base too small
      daily('b', '2026-10-12', { pay: 10 }),
    ];
    expect(unlocks(rule, records)).toEqual([['a', '2026-10-13', 2]]);
  });
});

describe('target', () => {
  const rule: AchievementRule = { type: 'target', before: 'week_end', week: 1 };
  const managers = [
    manager('a', 't1'),
    manager('b', 't1'),
    manager('c', 't2', { dailyNorms: { pay: 1 } }), // 10 points a day → 100
    manager('n', 't2', { memberships: [{ teamId: 't2', from: '2026-10-12' }] }), // 5 days → 37.5
  ];

  it('the plan for the whole game reached by the end of week 1 (early bird)', () => {
    const records = [
      daily('a', '2026-10-08', { pay: 8 }), // 80 ≥ 75
      daily('b', '2026-10-12', { pay: 8 }), // too late
      daily('c', '2026-10-09', { pay: 9 }), // 90 < 100
      daily('n', '2026-10-12', { pay: 4 }),
    ];
    expect(unlocks(rule, records, '2026-10-19', { managers })).toEqual([['a', '2026-10-08', 1]]);
  });

  it('by a date; a newcomer has the plan of their own days', () => {
    const records = [daily('n', '2026-10-12', { pay: 4 }), daily('c', '2026-10-13', { pay: 10 })];
    const byDate: AchievementRule = { type: 'target', before: 'date', date: '2026-10-14' };
    expect(unlocks(byDate, records, '2026-10-19', { managers })).toEqual([
      ['n', '2026-10-12', 2],
      ['c', '2026-10-13', 2],
    ]);
  });
});

describe('first (D-28)', () => {
  const rule: AchievementRule = {
    type: 'first',
    metric: 'pay',
    within: 'department',
    period: 'season',
  };

  it('the first day; of that day, the most payments; equal — all of them', () => {
    const tie = [
      daily('a', '2026-10-07', { pay: 1 }),
      daily('b', '2026-10-07', { pay: 2 }),
      daily('c', '2026-10-07', { pay: 2 }),
      daily('a', '2026-10-08', { pay: 5 }),
    ];
    expect(unlocks(rule, tie)).toEqual([
      ['b', '2026-10-07', 1],
      ['c', '2026-10-07', 1],
    ]);
    expect(unlocks(rule, [...tie, daily('a', '2026-10-06', { pay: 1 })])).toEqual([
      ['a', '2026-10-06', 1],
    ]);
  });

  it('skips managers fired by then, and works per team and per week', () => {
    const managers = [
      manager('a', 't1', { firedAt: '2026-10-07' }),
      manager('b', 't1'),
      manager('c', 't2'),
    ];
    const records = [
      daily('a', '2026-10-07', { pay: 3 }),
      daily('b', '2026-10-08', { pay: 1 }),
      daily('c', '2026-10-09', { pay: 1 }),
      daily('c', '2026-10-12', { pay: 1 }),
    ];
    expect(unlocks(rule, records, '2026-10-19', { managers })).toEqual([['b', '2026-10-08', 1]]);
    const team: AchievementRule = { ...rule, within: 'team' };
    expect(unlocks(team, records, '2026-10-19', { managers })).toEqual([
      ['b', '2026-10-08', 1],
      ['c', '2026-10-09', 1],
    ]);
    const weekly: AchievementRule = { ...rule, period: 'week' };
    expect(
      unlocks(weekly, records, '2026-10-19', { managers, extra: { repeatable: 'weekly' } }),
    ).toEqual([
      ['b', '2026-10-08', 1],
      ['c', '2026-10-12', 2],
    ]);
  });
});

describe('rank (D-15, D-29)', () => {
  const leader: AchievementRule = {
    type: 'rank',
    by: 'points',
    period: 'week',
    top: 1,
    everyWeek: false,
  };
  const records = [
    daily('a', '2026-10-06', { pay: 3 }),
    daily('b', '2026-10-07', { pay: 2 }),
    daily('a', '2026-10-13', { pay: 1 }),
    daily('b', '2026-10-14', { pay: 3 }),
  ];

  it('the leader of each finished week, dated its last day', () => {
    expect(unlocks(leader, records, '2026-10-11')).toEqual([]); // week 1 still running
    expect(unlocks(leader, records, '2026-10-12', { extra: { repeatable: 'weekly' } })).toEqual([
      ['a', '2026-10-11', 1],
    ]);
    expect(unlocks(leader, records, '2026-10-19', { extra: { repeatable: 'weekly' } })).toEqual([
      ['a', '2026-10-11', 1],
      ['b', '2026-10-18', 2],
    ]);
  });

  it('nobody leads a week without points; the roster is the one at the end of the week (R-5)', () => {
    expect(unlocks(leader, [], '2026-10-19')).toEqual([]);
    const managers = [
      manager('a', 't1', { firedAt: '2026-10-10' }),
      manager('b', 't1'),
      manager('c', 't2'),
    ];
    expect(unlocks(leader, records, '2026-10-12', { managers })).toEqual([['b', '2026-10-11', 1]]);
  });

  it('every week of the game, after the last one ends; or the whole game', () => {
    const everyWeek: AchievementRule = { ...leader, top: 2, everyWeek: true };
    expect(unlocks(everyWeek, records, '2026-10-18')).toEqual([]);
    expect(unlocks(everyWeek, records, '2026-10-19')).toEqual([
      ['a', '2026-10-18', 2],
      ['b', '2026-10-18', 2],
    ]);
    expect(unlocks({ ...everyWeek, top: 1 }, records, '2026-10-19')).toEqual([]);
    const season: AchievementRule = { ...leader, period: 'season' };
    expect(unlocks(season, records, '2026-10-19')).toEqual([['b', '2026-10-18', 2]]);
  });
});
