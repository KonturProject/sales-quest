import type { AchievementDef, AchievementRule } from '../../src/data/schemas/achievements.ts';
import type { Adjustment, ImportLog, MetricRecord } from '../../src/data/schemas/records.ts';
import type { Manager, SeasonConfig, Team } from '../../src/data/schemas/season.ts';

/** Local timestamp of a date (D-11): `at('2026-10-06')` → `2026-10-06T12:00:00+03:00`. */
export const at = (date: string, time = '12:00') => `${date}T${time}:00+03:00`;

export function team(id: string, order: number, extra: Partial<Team> = {}): Team {
  return {
    id,
    leaderName: `Руководитель ${order}`,
    characterId: 'knight',
    color: '#E4572E',
    order,
    ...extra,
  };
}

export function manager(id: string, teamId: string, extra: Partial<Manager> = {}): Manager {
  return {
    id,
    fullName: `Оператор ${id}`,
    aliases: [],
    memberships: [{ teamId, from: '2026-10-05' }],
    ...extra,
  };
}

/** A two-week game: Mon 2026-10-05 … Sun 2026-10-18, 10 working days, teams t1 and t2. */
export function makeConfig(overrides: Partial<SeasonConfig> = {}): SeasonConfig {
  return {
    schemaVersion: 1,
    id: 'test-season',
    title: 'Тестовая игра',
    status: 'active',
    period: { start: '2026-10-05', end: '2026-10-18' },
    holidays: [],
    track: { cellsPerWorkingDay: 2, overflowPct: 50 },
    progressMode: 'plan_percent',
    defaultDailyTargetPoints: 7.5,
    metricsCounting: 'exclusive',
    metrics: [
      { id: 'inv6', title: 'Качественные счета', weight: 1, order: 1 },
      { id: 'inv20', title: 'Разговоры от 20 минут', weight: 3, order: 2 },
      { id: 'pay', title: 'Оплаты', weight: 10, order: 3 },
    ],
    locations: [
      { index: 1, title: 'Древние руины', themePackId: 'ruins' },
      { index: 2, title: 'Ледяные скалы', themePackId: 'ice' },
      { index: 3, title: 'Вулкан', themePackId: 'volcano' },
      { index: 4, title: 'Небеса', themePackId: 'heaven' },
    ],
    teams: [team('t1', 1), team('t2', 2)],
    managers: [],
    achievements: [],
    importProfiles: [],
    achievementBonusAffectsSteps: false,
    ui: { pollIntervalSec: 60, blurFreezeSec: 30, camera: { pitchDeg: 45, yawDeg: 45 } },
    ...overrides,
  };
}

export function daily(
  managerId: string,
  date: string,
  values: Record<string, number>,
  importId = 'imp-1',
): MetricRecord {
  return { managerId, date, kind: 'daily', values, importId };
}

export function snapshot(
  managerId: string,
  date: string,
  values: Record<string, number>,
  importId = 'imp-1',
): MetricRecord {
  return { managerId, date, kind: 'snapshot', values, importId };
}

const meta = (id: string, when: string) => ({ id, at: when, reason: 'тест', by: 'admin' });

export const teamSteps = (id: string, teamId: string, value: number, when: string): Adjustment => ({
  ...meta(id, when),
  type: 'team_steps',
  teamId,
  value,
});

export const teamReset = (id: string, teamId: string, value: number, when: string): Adjustment => ({
  ...meta(id, when),
  type: 'team_reset',
  teamId,
  value,
});

export const seasonReset = (
  id: string,
  value: Record<string, number>,
  when: string,
): Adjustment => ({
  ...meta(id, when),
  type: 'season_reset',
  value,
});

/** `date` — the day the points are for (D-25); without it, the day the correction was made. */
export const managerPoints = (
  id: string,
  managerId: string,
  value: number,
  when: string,
  date?: string,
): Adjustment => ({
  ...meta(id, when),
  type: 'manager_points',
  managerId,
  value,
  ...(date ? { date } : {}),
});

export function importLog(id: string, when: string): ImportLog {
  return {
    id,
    fileName: 'export.xlsx',
    fileSha256: 'a'.repeat(64),
    profileId: 'funnel',
    rows: 1,
    matched: 1,
    unmatched: 0,
    dateRange: ['2026-10-05', '2026-10-05'],
    by: 'admin',
    at: when,
    warnings: [],
  };
}

/** A manager achievement with the given rule; `extra` overrides scope, repeatable, bonus… */
export function achievement(
  id: string,
  rule: AchievementRule,
  extra: Partial<AchievementDef> = {},
): AchievementDef {
  return {
    id,
    title: `Ачивка ${id}`,
    description: '',
    icon: id,
    scope: 'manager',
    rarity: 'common',
    rule,
    repeatable: false,
    bonusPoints: 0,
    enabled: true,
    ...extra,
  };
}

type Subject = { managerId: string } | { teamId: string };

export const grant = (
  id: string,
  achievementId: string,
  subject: Subject,
  when: string,
): Adjustment => ({ ...meta(id, when), type: 'grant_achievement', achievementId, ...subject });

export const revoke = (
  id: string,
  achievementId: string,
  subject: Subject,
  when: string,
): Adjustment => ({ ...meta(id, when), type: 'revoke_achievement', achievementId, ...subject });
