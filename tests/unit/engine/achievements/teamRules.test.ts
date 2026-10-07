import { describe, expect, it } from 'vitest';
import type { AchievementRule } from '../../../../src/data/schemas/achievements.ts';
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
  teamSteps,
} from '../../../support/builders.ts';

// One operator per team: plan 7.5 × 10 = 75 points → position = floor(points / 75 × 20).
// Locations: 1–5, 6–10, 11–15, 16–20; overflow 21–30.
const solo = [manager('a', 't1'), manager('c', 't2')];

function unlocks(
  rule: AchievementRule,
  records: MetricRecord[],
  opts: { managers?: Manager[]; adjustments?: Adjustment[]; today?: string } = {},
) {
  const config = makeConfig({
    managers: opts.managers ?? solo,
    achievements: [achievement('x', rule, { scope: 'team' })],
  });
  const p = prepare({ config, records, adjustments: opts.adjustments ?? [], imports: [] });
  return evaluateAchievements(p, opts.today ?? '2026-10-19').unlocks.map((u) => [
    u.teamId,
    u.unlockedAt,
  ]);
}

describe('team_position', () => {
  const pioneer: AchievementRule = {
    type: 'team_position',
    reach: 'location',
    locationIndex: 2,
    firstOnly: true,
  };

  it('the first team into a location; the same day — the one further along (D-28)', () => {
    const records = [
      daily('a', '2026-10-06', { pay: 3 }), // 30 → cell 8
      daily('c', '2026-10-06', { inv20: 8 }), // 24 → cell 6
    ];
    expect(unlocks(pioneer, records)).toEqual([['t1', '2026-10-06']]);
    expect(unlocks(pioneer, [...records, daily('c', '2026-10-05', { pay: 3 })])).toEqual([
      ['t2', '2026-10-05'],
    ]);
  });

  it('teams on the same cell on the first day both get it', () => {
    const records = [daily('a', '2026-10-06', { pay: 3 }), daily('c', '2026-10-06', { pay: 3 })];
    expect(unlocks(pioneer, records)).toEqual([
      ['t1', '2026-10-06'],
      ['t2', '2026-10-06'],
    ]);
  });

  it('without firstOnly every team gets it on its own day; admin steps count from their day', () => {
    const finish: AchievementRule = { type: 'team_position', reach: 'finish', firstOnly: false };
    const records = [daily('a', '2026-10-07', { pay: 8 }), daily('c', '2026-10-13', { pay: 4 })];
    const adjustments = [teamSteps('s1', 't2', 12, at('2026-10-14'))];
    expect(unlocks(finish, records, { adjustments })).toEqual([
      ['t1', '2026-10-07'],
      ['t2', '2026-10-14'],
    ]);
  });

  it('a step past the finish, and the end of the overflow zone', () => {
    const records = [
      daily('a', '2026-10-07', { pay: 8 }), // 80 → 21
      daily('c', '2026-10-08', { pay: 12 }), // 120 → 32 → stops at 30
    ];
    const overflow: AchievementRule = {
      type: 'team_position',
      reach: 'overflow',
      firstOnly: false,
    };
    expect(unlocks(overflow, records)).toEqual([
      ['t1', '2026-10-07'],
      ['t2', '2026-10-08'],
    ]);
    const end: AchievementRule = { ...overflow, reach: 'overflow_end' };
    expect(unlocks(end, records)).toEqual([['t2', '2026-10-08']]);
  });

  it('reads completed working days only', () => {
    const finish: AchievementRule = { type: 'team_position', reach: 'finish', firstOnly: false };
    const records = [daily('a', '2026-10-07', { pay: 8 })];
    expect(unlocks(finish, records, { today: '2026-10-07' })).toEqual([]);
    expect(unlocks(finish, records, { today: '2026-10-08' })).toEqual([['t1', '2026-10-07']]);
  });
});

describe('team_pace', () => {
  const rule: AchievementRule = { type: 'team_pace', aheadDays: 3 };

  it('ahead of the own pace line N working days in a row', () => {
    // t1: 30 points on Monday → cell 8; pace after Mon/Tue/Wed/Thu: 2, 4, 6, 8.
    const records = [daily('a', '2026-10-05', { pay: 3 })];
    expect(unlocks(rule, records)).toEqual([['t1', '2026-10-07']]);
    expect(unlocks({ ...rule, aheadDays: 4 }, records)).toEqual([]);
  });

  it('a day on the pace line breaks the run', () => {
    const records = [
      daily('a', '2026-10-05', { pay: 1 }), // 10 → 2 = pace after Monday: not ahead
      daily('a', '2026-10-06', { pay: 3 }), // 40 → 10 vs 4, 6, 8 on Tue, Wed, Thu
    ];
    expect(unlocks(rule, records)).toEqual([['t1', '2026-10-08']]);
  });
});

describe('team_all_members (D-29)', () => {
  const rule: AchievementRule = {
    type: 'team_all_members',
    metric: 'pay',
    minEach: 1,
    period: 'season',
  };
  const pair = (extra: Manager[] = []) => [manager('a', 't1'), manager('b', 't1'), ...extra];

  it('on the day the last member gets there; a later newcomer does not take it back', () => {
    const records = [daily('a', '2026-10-06', { pay: 1 }), daily('b', '2026-10-08', { pay: 2 })];
    const late = manager('n', 't1', { memberships: [{ teamId: 't1', from: '2026-10-12' }] });
    expect(unlocks(rule, records, { managers: pair([late]) })).toEqual([['t1', '2026-10-08']]);
  });

  it('waits for a member who is already in the team', () => {
    const early = manager('n', 't1', { memberships: [{ teamId: 't1', from: '2026-10-07' }] });
    const records = [daily('a', '2026-10-06', { pay: 1 }), daily('b', '2026-10-08', { pay: 2 })];
    expect(unlocks(rule, records, { managers: pair([early]) })).toEqual([]);
    expect(
      unlocks(rule, [...records, daily('n', '2026-10-13', { pay: 1 })], {
        managers: pair([early]),
      }),
    ).toEqual([['t1', '2026-10-13']]);
  });

  it('a fired member does not hold the team back; payments in another team do not count', () => {
    const managers = [
      manager('a', 't1'),
      manager('b', 't1', { firedAt: '2026-10-07' }),
      manager('m', 't2', {
        memberships: [
          { teamId: 't2', from: '2026-10-05', to: '2026-10-09' },
          { teamId: 't1', from: '2026-10-12' },
        ],
      }),
    ];
    const records = [
      daily('a', '2026-10-06', { pay: 1 }),
      daily('m', '2026-10-08', { pay: 1 }), // for t2
      daily('m', '2026-10-14', { pay: 1 }), // for t1
    ];
    expect(unlocks(rule, records, { managers })).toEqual([
      ['t1', '2026-10-07'],
      ['t2', '2026-10-08'],
    ]);
  });

  it('per week: each week from its own start', () => {
    const weekly: AchievementRule = { ...rule, period: 'week' };
    const records = [
      daily('a', '2026-10-06', { pay: 1 }),
      daily('b', '2026-10-09', { pay: 1 }),
      daily('a', '2026-10-12', { pay: 1 }),
    ];
    expect(unlocks(weekly, records, { managers: pair() })).toEqual([['t1', '2026-10-09']]);
  });
});
