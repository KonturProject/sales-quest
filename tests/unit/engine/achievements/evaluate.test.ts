import { describe, expect, it } from 'vitest';
import { starterAchievements } from '../../../../src/data/defaults/achievements.ts';
import type { AchievementDef, AchievementRule } from '../../../../src/data/schemas/achievements.ts';
import type { Adjustment, MetricRecord } from '../../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../../src/data/schemas/season.ts';
import { evaluateAchievements } from '../../../../src/engine/achievements/evaluate.ts';
import { computeGameState, computeGameStateFrom } from '../../../../src/engine/gameState.ts';
import { prepare } from '../../../../src/engine/prepare.ts';
import {
  achievement,
  at,
  daily,
  grant,
  makeConfig,
  manager,
  revoke,
  snapshot,
} from '../../../support/builders.ts';

const payOnce: AchievementRule = {
  type: 'threshold',
  metric: 'pay',
  period: 'season',
  op: '>=',
  value: 1,
};
const payDay: AchievementRule = {
  type: 'threshold',
  metric: 'pay',
  period: 'day',
  op: '>=',
  value: 1,
};
const manual: AchievementRule = { type: 'manual' };

function evaluate(
  achievements: AchievementDef[],
  records: MetricRecord[],
  adjustments: Adjustment[] = [],
  today = '2026-10-19',
  extra: Partial<SeasonConfig> = {},
) {
  const config = makeConfig({
    managers: [
      manager('a', 't1'),
      manager('b', 't1', { firedAt: '2026-10-09' }),
      manager('c', 't2'),
    ],
    achievements,
    ...extra,
  });
  return evaluateAchievements(prepare({ config, records, adjustments, imports: [] }), today);
}

const brief = (r: ReturnType<typeof evaluate>) =>
  r.unlocks.map((u) => [u.achievementId, u.managerId ?? u.teamId, u.unlockedAt, u.source]);

describe('evaluateAchievements', () => {
  it('a fired manager earns nothing from the firing day on, and keeps what came before (R-5)', () => {
    const records = [daily('b', '2026-10-08', { pay: 1 }), daily('b', '2026-10-09', { pay: 1 })];
    expect(brief(evaluate([achievement('d', payDay, { repeatable: 'daily' })], records))).toEqual([
      ['d', 'b', '2026-10-08', 'auto'],
    ]);
  });

  it('orders unlocks by day, then by the order of achievements in the config', () => {
    const records = [daily('c', '2026-10-06', { pay: 1 }), daily('a', '2026-10-07', { pay: 1 })];
    const defs = [achievement('second', payOnce), achievement('first', payDay)];
    expect(brief(evaluate(defs, records))).toEqual([
      ['second', 'c', '2026-10-06', 'auto'],
      ['first', 'c', '2026-10-06', 'auto'],
      ['second', 'a', '2026-10-07', 'auto'],
      ['first', 'a', '2026-10-07', 'auto'],
    ]);
  });

  it('a disabled achievement gives nothing, even by hand', () => {
    const def = achievement('x', payOnce, { enabled: false });
    const r = evaluate(
      [def],
      [daily('a', '2026-10-06', { pay: 1 })],
      [grant('g1', 'x', { managerId: 'c' }, at('2026-10-07'))],
    );
    expect(r.unlocks).toEqual([]);
    expect(r.warnings).toEqual(['выдача g1: ачивка x выключена — не учтено']);
  });
});

describe('manual grants and revokes (ACH-2, ACH-3, D-29)', () => {
  it('grants a manual achievement on the day of the grant, once per week if weekly', () => {
    const def = achievement('best_call', manual, { repeatable: 'weekly' });
    const adjustments = [
      grant('g1', 'best_call', { managerId: 'a' }, at('2026-10-06')),
      grant('g2', 'best_call', { managerId: 'a' }, at('2026-10-08')),
      grant('g3', 'best_call', { managerId: 'a' }, at('2026-10-13')),
    ];
    expect(evaluate([def], [], adjustments).unlocks).toEqual([
      {
        achievementId: 'best_call',
        managerId: 'a',
        unlockedAt: '2026-10-06',
        week: 1,
        source: 'manual',
      },
      {
        achievementId: 'best_call',
        managerId: 'a',
        unlockedAt: '2026-10-13',
        week: 2,
        source: 'manual',
      },
    ]);
  });

  it('a grant ahead of time stands; the rule firing later adds no duplicate', () => {
    const adjustments = [grant('g1', 'x', { managerId: 'a' }, at('2026-10-06'))];
    const records = [daily('a', '2026-10-08', { pay: 1 })];
    expect(brief(evaluate([achievement('x', payOnce)], records, adjustments))).toEqual([
      ['x', 'a', '2026-10-06', 'manual'],
    ]);
    const later = [grant('g1', 'x', { managerId: 'a' }, at('2026-10-09'))];
    expect(brief(evaluate([achievement('x', payOnce)], records, later))).toEqual([
      ['x', 'a', '2026-10-08', 'auto'],
    ]);
  });

  it('a revoke takes back what was earned up to its day; a later grant stands again', () => {
    const records = [daily('a', '2026-10-06', { pay: 1 })];
    const def = achievement('x', payOnce);
    const revoked = [revoke('r1', 'x', { managerId: 'a' }, at('2026-10-07'))];
    expect(evaluate([def], records, revoked).unlocks).toEqual([]);
    const regranted = [...revoked, grant('g1', 'x', { managerId: 'a' }, at('2026-10-07', '15:00'))];
    expect(brief(evaluate([def], records, regranted))).toEqual([
      ['x', 'a', '2026-10-07', 'manual'],
    ]);
  });

  it('a revoke touches only its own manager', () => {
    const records = [daily('a', '2026-10-06', { pay: 1 }), daily('c', '2026-10-06', { pay: 1 })];
    const adjustments = [revoke('r1', 'x', { managerId: 'c' }, at('2026-10-07'))];
    expect(brief(evaluate([achievement('x', payOnce)], records, adjustments))).toEqual([
      ['x', 'a', '2026-10-06', 'auto'],
    ]);
  });

  it('a weekly achievement can be earned again after a revoke', () => {
    const def = achievement('x', payDay, { repeatable: 'weekly' });
    const records = [daily('a', '2026-10-06', { pay: 1 }), daily('a', '2026-10-13', { pay: 1 })];
    const adjustments = [revoke('r1', 'x', { managerId: 'a' }, at('2026-10-08'))];
    expect(brief(evaluate([def], records, adjustments))).toEqual([
      ['x', 'a', '2026-10-13', 'auto'],
    ]);
  });

  it('ignores undone actions and actions made after today; warns about bad ones', () => {
    const undone: Adjustment = {
      ...grant('g0', 'x', { managerId: 'a' }, at('2026-10-06')),
      revoked: { by: 'admin', at: at('2026-10-07'), reason: 'ошибка' },
    };
    const adjustments = [
      undone,
      grant('g1', 'x', { managerId: 'c' }, at('2026-10-20')),
      grant('g2', 'nope', { managerId: 'a' }, at('2026-10-06')),
      grant('g3', 'x', { teamId: 't1' }, at('2026-10-06')),
      revoke('r1', 'x', { managerId: 'ghost' }, at('2026-10-06')),
    ];
    const r = evaluate([achievement('x', manual)], [], adjustments);
    expect(r.unlocks).toEqual([]);
    expect(r.warnings).toEqual([
      'выдача g2: ачивки nope нет в игре — не учтено',
      'выдача g3: ачивка x — для операторов, нужен оператор из состава — не учтено',
      'отзыв r1: ачивка x — для операторов, нужен оператор из состава — не учтено',
    ]);
  });

  it('grants team achievements to teams', () => {
    const def = achievement('cup', manual, { scope: 'team' });
    const r = evaluate([def], [], [grant('g1', 'cup', { teamId: 't2' }, at('2026-10-06'))]);
    expect(brief(r)).toEqual([['cup', 't2', '2026-10-06', 'manual']]);
  });
});

describe('daily detail (ACH-4)', () => {
  it('switches off day-by-day rules for a metric that only has running-total snapshots', () => {
    const records = [
      snapshot('a', '2026-10-04', { pay: 0 }),
      snapshot('a', '2026-10-09', { pay: 4 }),
    ];
    const defs = [
      achievement('hat', { type: 'threshold', metric: 'pay', period: 'day', op: '>=', value: 3 }),
      achievement('pts', {
        type: 'threshold',
        metric: 'points',
        period: 'day',
        op: '>=',
        value: 30,
      }),
      achievement('once', payOnce),
    ];
    const r = evaluate(defs, records);
    expect(brief(r)).toEqual([['once', 'a', '2026-10-09', 'auto']]);
    expect(r.warnings).toEqual([
      'ачивка «Ачивка hat» (hat) выключена: по «pay» есть только итоги-снимки, а ей нужны данные по дням (ACH-4)',
      'ачивка «Ачивка pts» (pts) выключена: по «pay» есть только итоги-снимки, а ей нужны данные по дням (ACH-4)',
    ]);
  });

  it('keeps day-by-day rules when the metric also comes by day', () => {
    const records = [
      snapshot('a', '2026-10-09', { inv6: 4 }),
      daily('a', '2026-10-06', { pay: 3 }),
    ];
    const hat = achievement('hat', {
      type: 'threshold',
      metric: 'pay',
      period: 'day',
      op: '>=',
      value: 3,
    });
    expect(evaluate([hat], records).warnings).toEqual([]);
  });
});

describe('bonus points (FR-SCORE-5, D-29)', () => {
  const century = achievement('century', {
    type: 'threshold',
    metric: 'points',
    period: 'season',
    op: '>=',
    value: 30,
  });
  const bonus = achievement('first', payOnce, { bonusPoints: 25 });
  const records = [daily('a', '2026-10-06', { pay: 1 })];
  const input = (affectsSteps: boolean, adjustments: Adjustment[] = []) => ({
    config: makeConfig({
      managers: [manager('a', 't1'), manager('c', 't2')],
      achievements: [bonus, century],
      achievementBonusAffectsSteps: affectsSteps,
    }),
    records,
    adjustments,
    imports: [],
  });

  it('go to the leaderboard on the day of the unlock, not into other rules', () => {
    const state = computeGameState(input(false), at('2026-10-19'));
    const a = state.managers.find((m) => m.managerId === 'a');
    expect([a?.points, a?.achievementPoints, a?.weekly]).toEqual([35, 25, { 1: 35, 2: 0 }]);
    expect(state.unlocks.map((u) => u.achievementId)).toEqual(['first']); // 10 + 25 ≠ century
    expect(state.teams[0]?.points).toBe(10);
  });

  it('move the team only with achievementBonusAffectsSteps', () => {
    const state = computeGameState(input(true), at('2026-10-19'));
    expect(state.teams[0]?.points).toBe(35);
    expect(state.timeline.find((d) => d.date === '2026-10-06')?.teams[0]?.points).toBe(35);
  });

  it('a grant after the game counts on its last day', () => {
    const late = [grant('g1', 'first', { managerId: 'c' }, at('2026-10-20'))];
    const state = computeGameState(input(false, late), at('2026-10-21'));
    expect(state.managers.find((m) => m.managerId === 'c')?.points).toBe(25);
  });
});

describe('game state', () => {
  it('carries the unlocks and the timeline; computeGameStateFrom gives the same state', () => {
    const config = makeConfig({
      managers: [manager('a', 't1'), manager('c', 't2')],
      achievements: [achievement('x', payOnce)],
    });
    const input = {
      config,
      records: [daily('a', '2026-10-06', { pay: 1 })],
      adjustments: [],
      imports: [],
    };
    const state = computeGameState(input, at('2026-10-08'));
    expect(state.unlocks).toEqual([
      { achievementId: 'x', managerId: 'a', unlockedAt: '2026-10-06', week: 1, source: 'auto' },
    ]);
    expect(state.timeline.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(computeGameStateFrom(prepare(input), '2026-10-08')).toEqual(state);
  });
});

describe('starter set (§6.2, D-27)', () => {
  it('every automatic achievement fires on a two-week game', () => {
    // t1: a, b; t2: c, d. Plan 2 × 75 = 150 points a team → position = floor(points / 150 × 20).
    const config = makeConfig({
      managers: [manager('a', 't1'), manager('b', 't1'), manager('c', 't2'), manager('d', 't2')],
      achievements: starterAchievements,
    });
    const workingDays = ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16'];
    const records = [
      daily('a', '2026-10-05', { pay: 3 }), // first blood, hat trick
      daily('a', '2026-10-06', { pay: 1 }),
      daily('a', '2026-10-07', { pay: 1 }), // marathon
      daily('a', '2026-10-08', { inv6: 15 }), // warm-up, converter (5 / 15)
      daily('a', '2026-10-09', { inv20: 10 }), // long talk; 95 by week 1's end → early bird
      daily('a', '2026-10-12', { pay: 1 }), // five payments, century
      daily('b', '2026-10-12', { pay: 1 }), // all in (t1)
      // c runs away: 50 points every working day → pioneer ×3, finisher, beyond, ahead of pace
      ...workingDays.map((d) => daily('c', `2026-10-${d}`, { pay: 5 })),
      daily('d', '2026-10-06', { inv6: 20 }),
      daily('d', '2026-10-13', { inv20: 10 }), // comeback: 30 ≥ 20 × 1.5
    ];
    const p = prepare({ config, records, adjustments: [], imports: [] });
    const { unlocks, warnings } = evaluateAchievements(p, '2026-10-19');
    const automatic = starterAchievements.filter((a) => a.rule.type !== 'manual').map((a) => a.id);
    expect(new Set(unlocks.map((u) => u.achievementId))).toEqual(new Set(automatic));
    expect(warnings).toEqual([]);
  });
});
