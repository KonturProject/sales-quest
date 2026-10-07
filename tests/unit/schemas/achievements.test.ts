import { describe, expect, it } from 'vitest';
import { starterAchievements } from '../../../src/data/defaults/achievements.ts';
import {
  AchievementDefSchema,
  type AchievementDefInput,
} from '../../../src/data/schemas/achievements.ts';
import { SeasonConfigSchema, parseSeasonConfig } from '../../../src/data/schemas/season.ts';
import { makeConfig } from '../../support/builders.ts';

function problems(input: unknown): string[] {
  const result = SeasonConfigSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

function defProblems(input: unknown): string[] {
  const result = AchievementDefSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

const base: AchievementDefInput = {
  id: 'x',
  title: 'Икс',
  icon: 'x',
  scope: 'manager',
  rarity: 'common',
  rule: { type: 'threshold', metric: 'pay', period: 'season', value: 1 },
};

describe('starter achievements (§6.2, D-27)', () => {
  it('parse inside a two-week game unchanged', () => {
    const config = makeConfig({ achievements: starterAchievements });
    expect(parseSeasonConfig(config).achievements).toEqual(starterAchievements);
  });

  it('are the 21 of the spec: pioneer counts once for its three locations', () => {
    const ids = starterAchievements.map((a) => a.id.replace(/_l\d$/, ''));
    expect(new Set(ids).size).toBe(21);
  });
});

describe('AchievementDefSchema', () => {
  it('fills defaults', () => {
    const parsed = AchievementDefSchema.parse(base);
    expect([
      parsed.description,
      parsed.repeatable,
      parsed.bonusPoints,
      parsed.enabled,
      parsed.rule,
    ]).toEqual([
      '',
      false,
      0,
      true,
      { type: 'threshold', metric: 'pay', period: 'season', op: '>=', value: 1 },
    ]);
  });

  it('matches rule types to scopes', () => {
    expect(defProblems({ ...base, scope: 'team' })).toEqual([
      'scope: правило threshold — для операторов, нужен scope: manager',
    ]);
    expect(defProblems({ ...base, rule: { type: 'team_pace', aheadDays: 5 } })).toEqual([
      'scope: правило team_pace — для команд, нужен scope: team',
    ]);
    expect(defProblems({ ...base, scope: 'team', rule: { type: 'manual' } })).toEqual([]);
  });

  it('gives bonus points to managers only', () => {
    const teamDef = { ...base, scope: 'team', rule: { type: 'manual' }, bonusPoints: 5 };
    expect(defProblems(teamDef)).toEqual([
      'bonusPoints: бонусные баллы бывают только у ачивок операторов',
    ]);
  });

  it('needs the deadline of a target, the location of a position, a week for everyWeek', () => {
    expect(defProblems({ ...base, rule: { type: 'target', before: 'week_end' } })).toEqual([
      'rule.week: укажите номер недели игры',
    ]);
    expect(defProblems({ ...base, rule: { type: 'target', before: 'date' } })).toEqual([
      'rule.date: укажите дату',
    ]);
    const position = { type: 'team_position', reach: 'location', firstOnly: true };
    expect(defProblems({ ...base, scope: 'team', rule: position })).toEqual([
      'rule.locationIndex: укажите номер локации (2–4)',
    ]);
    const rank = { type: 'rank', by: 'points', period: 'season', top: 3, everyWeek: true };
    expect(defProblems({ ...base, rule: rank })).toEqual([
      'rule.everyWeek: «каждую неделю» — только для периода week',
    ]);
  });

  it('rejects a zero threshold and an unknown rule type', () => {
    const zero = { ...base, rule: { ...base.rule, value: 0 } };
    expect(defProblems(zero).some((p) => p.startsWith('rule.value'))).toBe(true);
    expect(defProblems({ ...base, rule: { type: 'luck' } }).length).toBeGreaterThan(0);
  });
});

describe('achievements in the season config', () => {
  const withAchievements = (...achievements: unknown[]) => ({
    ...makeConfig(),
    achievements,
  });

  it('rejects repeated ids', () => {
    expect(problems(withAchievements(base, base))).toContain('achievements: повторяется x');
  });

  it('checks metric ids; points are allowed where the rule reads points', () => {
    const unknown = { ...base, rule: { ...base.rule, metric: 'calls' } };
    expect(problems(withAchievements(unknown))).toEqual(['achievements.0.rule: нет метрики calls']);
    const points = { ...base, rule: { ...base.rule, metric: 'points' } };
    expect(problems(withAchievements(points))).toEqual([]);
    const streak = {
      ...base,
      rule: { type: 'streak', metric: 'points', minPerDay: 1, days: 3 },
    };
    expect(problems(withAchievements(streak))).toEqual(['achievements.0.rule: нет метрики points']);
    const ratio = {
      ...base,
      rule: {
        type: 'ratio',
        numerator: 'pay',
        denominator: ['inv6', 'calls'],
        minRatio: 0.2,
        minDenominator: 10,
        period: 'season',
      },
    };
    expect(problems(withAchievements(ratio))).toEqual(['achievements.0.rule: нет метрики calls']);
  });

  it('reserves the metric id points', () => {
    const config = makeConfig();
    const metrics = [...config.metrics, { id: 'points', title: 'Баллы', weight: 1, order: 4 }];
    expect(problems({ ...config, metrics })).toEqual([
      'metrics.3.id: id points занят: так в ачивках зовутся баллы',
    ]);
  });

  it('checks that the target week exists in the game', () => {
    const target = { ...base, rule: { type: 'target', before: 'week_end', week: 3 } };
    expect(problems(withAchievements(target))).toEqual([
      'achievements.0.rule.week: в игре 2 нед., недели 3 нет',
    ]);
  });
});
