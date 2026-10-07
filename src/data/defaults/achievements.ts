import type { AchievementDef } from '../schemas/achievements.ts';

type Starter = Omit<AchievementDef, 'icon' | 'repeatable' | 'bonusPoints' | 'enabled'> &
  Partial<Pick<AchievementDef, 'repeatable'>>;

// Icons are placeholders (the achievement id) until the icon manifest of stage 4.
const def = (a: Starter): AchievementDef => ({
  icon: a.id,
  repeatable: false,
  bonusPoints: 0,
  enabled: true,
  ...a,
});

const pioneer = (locationIndex: 2 | 3 | 4, place: string): AchievementDef =>
  def({
    id: `pioneer_l${locationIndex}`,
    title: 'Первопроходец',
    description: `Команда первой вошла в ${place}`,
    scope: 'team',
    rarity: 'epic',
    rule: { type: 'team_position', reach: 'location', locationIndex, firstOnly: true },
  });

/**
 * The starter set (§6.2) with thresholds for a two-week game (D-27), metrics as labelled by the
 * author (D-22): inv6 — quality invoices, inv20 — talks of 20+ minutes, pay — payments.
 */
export const starterAchievements: AchievementDef[] = [
  def({
    id: 'first_blood',
    title: 'Первая кровь',
    description: 'Первая оплата в отделе за игру',
    scope: 'manager',
    rarity: 'epic',
    rule: { type: 'first', metric: 'pay', within: 'department', period: 'season' },
  }),
  def({
    id: 'first_payment',
    title: 'Открыл счёт',
    description: 'Первая оплата за игру',
    scope: 'manager',
    rarity: 'common',
    rule: { type: 'threshold', metric: 'pay', period: 'season', op: '>=', value: 1 },
  }),
  def({
    id: 'five_payments',
    title: 'Пятёрка',
    description: 'Пять оплат за игру',
    scope: 'manager',
    rarity: 'rare',
    rule: { type: 'threshold', metric: 'pay', period: 'season', op: '>=', value: 5 },
  }),
  def({
    id: 'hat_trick',
    title: 'Хет-трик',
    description: 'Три оплаты за один день',
    scope: 'manager',
    rarity: 'epic',
    rule: { type: 'threshold', metric: 'pay', period: 'day', op: '>=', value: 3 },
  }),
  def({
    id: 'marathon',
    title: 'Марафонец',
    description: 'Оплаты три рабочих дня подряд',
    scope: 'manager',
    rarity: 'epic',
    rule: { type: 'streak', metric: 'pay', minPerDay: 1, days: 3 },
  }),
  def({
    id: 'long_talk',
    title: 'Долгий разговор',
    description: 'Десять разговоров от 20 минут за неделю',
    scope: 'manager',
    rarity: 'rare',
    repeatable: 'weekly',
    rule: { type: 'threshold', metric: 'inv20', period: 'week', op: '>=', value: 10 },
  }),
  def({
    id: 'warm_up',
    title: 'Разогрев',
    description: 'Пятнадцать качественных счетов за неделю',
    scope: 'manager',
    rarity: 'common',
    repeatable: 'weekly',
    rule: { type: 'threshold', metric: 'inv6', period: 'week', op: '>=', value: 15 },
  }),
  def({
    id: 'converter',
    title: 'Конвертер',
    description: 'Оплачен каждый пятый качественный счёт (от 10 счетов за игру)',
    scope: 'manager',
    rarity: 'epic',
    rule: {
      type: 'ratio',
      numerator: 'pay',
      denominator: ['inv6'],
      minRatio: 0.2,
      minDenominator: 10,
      period: 'season',
    },
  }),
  def({
    id: 'week_leader',
    title: 'Лидер недели',
    description: 'Первое место по баллам за неделю',
    scope: 'manager',
    rarity: 'epic',
    repeatable: 'weekly',
    rule: { type: 'rank', by: 'points', period: 'week', top: 1, everyWeek: false },
  }),
  def({
    id: 'stable_top',
    title: 'Стабильность',
    description: 'В пятёрке лучших каждую неделю игры',
    scope: 'manager',
    rarity: 'legendary',
    rule: { type: 'rank', by: 'points', period: 'week', top: 5, everyWeek: true },
  }),
  def({
    id: 'comeback',
    title: 'Камбэк',
    description: 'Баллов на 50 % больше, чем на прошлой неделе (от 20 баллов)',
    scope: 'manager',
    rarity: 'rare',
    rule: { type: 'growth', metric: 'points', weekOverWeekPct: 50, minBase: 20 },
  }),
  def({
    id: 'century',
    title: 'Сотня',
    description: 'Сто баллов за игру',
    scope: 'manager',
    rarity: 'rare',
    rule: { type: 'threshold', metric: 'points', period: 'season', op: '>=', value: 100 },
  }),
  def({
    id: 'early_bird',
    title: 'Досрочник',
    description: 'Личный план на всю игру выполнен к концу первой недели',
    scope: 'manager',
    rarity: 'legendary',
    rule: { type: 'target', before: 'week_end', week: 1 },
  }),
  pioneer(2, 'вторую локацию'),
  pioneer(3, 'третью локацию'),
  pioneer(4, 'четвёртую локацию'),
  def({
    id: 'finisher',
    title: 'Финишёр',
    description: 'Команда выполнила план — дошла до финиша',
    scope: 'team',
    rarity: 'epic',
    rule: { type: 'team_position', reach: 'finish', firstOnly: false },
  }),
  def({
    id: 'beyond',
    title: 'За горизонтом',
    description: 'Команда дошла до конца зоны сверхплана',
    scope: 'team',
    rarity: 'legendary',
    rule: { type: 'team_position', reach: 'overflow_end', firstOnly: false },
  }),
  def({
    id: 'all_in',
    title: 'Все в деле',
    description: 'У каждого в команде есть оплата за игру',
    scope: 'team',
    rarity: 'rare',
    rule: { type: 'team_all_members', metric: 'pay', minEach: 1, period: 'season' },
  }),
  def({
    id: 'ahead_of_pace',
    title: 'Опережая время',
    description: 'Команда впереди своего темпа пять рабочих дней подряд',
    scope: 'team',
    rarity: 'rare',
    rule: { type: 'team_pace', aheadDays: 5 },
  }),
  def({
    id: 'deal_saver',
    title: 'Спасатель сделки',
    description: 'Выдаётся вручную',
    scope: 'manager',
    rarity: 'epic',
    rule: { type: 'manual' },
  }),
  def({
    id: 'mentor',
    title: 'Наставник',
    description: 'Выдаётся вручную',
    scope: 'manager',
    rarity: 'epic',
    rule: { type: 'manual' },
  }),
  def({
    id: 'best_call',
    title: 'Звонок недели',
    description: 'Выдаётся вручную',
    scope: 'manager',
    rarity: 'rare',
    repeatable: 'weekly',
    rule: { type: 'manual' },
  }),
];
