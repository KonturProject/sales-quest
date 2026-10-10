import type { SeasonConfig } from '../schemas/season.ts';
import { starterAchievements } from './achievements.ts';

/**
 * What every game starts with (plan 2a): the demo's metrics and weights (R-2), the track of D-24,
 * the four locations, the starter achievements (D-27). The «Новая игра» wizard adds the dates, the
 * teams, the operators, their norms and the import profiles; the demo — its own fictional people.
 */
export function seasonDefaults(): Omit<
  SeasonConfig,
  'id' | 'title' | 'status' | 'period' | 'teams' | 'managers'
> {
  return {
    schemaVersion: 1,
    holidays: [],
    track: { cellsPerWorkingDay: 3, overflowPct: 50 }, // OQ-18, D-24
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
    achievements: starterAchievements,
    importProfiles: [],
    importIgnore: [],
    achievementBonusAffectsSteps: false,
    // The strip faces the viewer: yaw 0 (D-23).
    ui: { pollIntervalSec: 60, blurFreezeSec: 30, camera: { pitchDeg: 50, yawDeg: 0 } },
  };
}
