import { describe, expect, it } from 'vitest';
import { SeasonConfigSchema, parseSeasonConfig } from '../../../src/data/schemas/season.ts';
import { makeConfig, manager } from '../../support/builders.ts';

function problems(input: unknown): string[] {
  const result = SeasonConfigSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('SeasonConfigSchema', () => {
  it('accepts a valid two-week game', () => {
    const config = makeConfig({ managers: [manager('m1', 't1')] });
    expect(parseSeasonConfig(config)).toEqual(config);
  });

  it('fills defaults for optional lists and flags', () => {
    const input: Record<string, unknown> = { ...makeConfig() };
    for (const key of [
      'holidays',
      'achievements',
      'importProfiles',
      'achievementBonusAffectsSteps',
    ])
      delete input[key];
    input.managers = [
      { id: 'm1', fullName: 'Иванов Иван', memberships: [{ teamId: 't1', from: '2026-10-05' }] },
    ];
    const parsed = parseSeasonConfig(input);
    expect(parsed.holidays).toEqual([]);
    expect(parsed.achievements).toEqual([]);
    expect(parsed.importProfiles).toEqual([]);
    expect(parsed.achievementBonusAffectsSteps).toBe(false);
    expect(parsed.managers[0]?.aliases).toEqual([]);
  });

  it('rejects a period that ends before it starts', () => {
    const config = makeConfig({ period: { start: '2026-10-18', end: '2026-10-05' } });
    expect(problems(config)).toContain('period.end: конец периода раньше начала');
  });

  it('rejects impossible dates', () => {
    const config = makeConfig({ period: { start: '2026-02-30', end: '2026-03-10' } });
    expect(problems(config).some((p) => p.startsWith('period.start'))).toBe(true);
  });

  it('rejects working days outside the period', () => {
    const config = makeConfig({ workingDays: ['2026-10-05', '2026-11-02'] });
    expect(problems(config)).toContain('workingDays.1: рабочий день 2026-11-02 вне периода игры');
  });

  it('rejects memberships in an unknown team, reversed or overlapping', () => {
    const m = manager('m1', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 'nope', from: '2026-10-09', to: '2026-10-08' },
      ],
    });
    const found = problems(makeConfig({ managers: [m] }));
    expect(found).toContain('managers.0.memberships.1.teamId: нет команды nope');
    expect(found).toContain(
      'managers.0.memberships.1.to: период в команде кончается раньше, чем начинается',
    );
    expect(found).toContain(
      'managers.0.memberships.1.from: периоды в командах идут по порядку и не пересекаются',
    );
  });

  it('rejects daily norms for a metric the season does not have', () => {
    const config = makeConfig({ managers: [manager('m1', 't1', { dailyNorms: { calls: 5 } })] });
    expect(problems(config)).toContain('managers.0.dailyNorms.calls: нет метрики calls');
  });

  it('rejects duplicate ids', () => {
    const config = makeConfig();
    expect(problems({ ...config, teams: [...config.teams, config.teams[0]] })).toContain(
      'teams: повторяется t1',
    );
  });

  it('requires pointsPerStep in absolute mode', () => {
    expect(problems(makeConfig({ progressMode: 'absolute' }))).toContain(
      'pointsPerStep: режим absolute требует pointsPerStep',
    );
  });

  it('requires exactly four locations and a valid team color', () => {
    const config = makeConfig();
    expect(problems({ ...config, locations: config.locations.slice(0, 3) }).length).toBeGreaterThan(
      0,
    );
    const badColor = { ...config, teams: [{ ...config.teams[0], color: 'red' }] };
    expect(problems(badColor)).toContain('teams.0.color: цвет в формате #RRGGBB');
  });
});
