import { starterAchievements } from '../../src/data/defaults/achievements.ts';
import type { Adjustment, ImportLog, MetricRecord } from '../../src/data/schemas/records.ts';
import type { Manager, SeasonConfig, Team } from '../../src/data/schemas/season.ts';
import { buildCalendar } from '../../src/engine/calendar.ts';
import { addDays } from '../../src/engine/dates.ts';
import type { EngineInput } from '../../src/engine/prepare.ts';

/**
 * The demo game (DATA-16, D-32): two weeks, six teams of fictional people. Volumes are round
 * numbers of the right order only — never the department's own figures (author, 08.10.2026).
 */

/** Mean per working day of an average operator. */
const MEAN = { inv6: 2.5, inv20: 1, pay: 0.2 };
const DAY_OFF = 0.05;

const TEAMS = [
  { leader: 'Алина Смирнова', color: '#E4572E', size: 12, factor: 1.2 },
  { leader: 'Борис Кузнецов', color: '#29335C', size: 9, factor: 0.85 },
  { leader: 'Вера Соколова', color: '#F3A712', size: 8, factor: 1 },
  { leader: 'Глеб Морозов', color: '#669BBC', size: 7, factor: 0.75 },
  { leader: 'Дарья Волкова', color: '#4C956C', size: 6, factor: 1.3 },
  { leader: 'Егор Лебедев', color: '#8E5572', size: 5, factor: 0.95 },
];

const SURNAMES = [
  'Андреев',
  'Белов',
  'Васильев',
  'Григорьев',
  'Давыдов',
  'Ершов',
  'Жуков',
  'Зайцев',
  'Ильин',
  'Ковалёв',
  'Ларин',
  'Макаров',
  'Никитин',
  'Орлов',
  'Павлов',
  'Романов',
  'Степанов',
  'Тихонов',
  'Устинов',
  'Фёдоров',
  'Харитонов',
  'Цветков',
  'Чернов',
  'Шилов',
  'Яковлев',
];
const MALE = [
  'Алексей',
  'Денис',
  'Иван',
  'Кирилл',
  'Максим',
  'Никита',
  'Олег',
  'Роман',
  'Сергей',
  'Тимур',
];
const FEMALE = [
  'Анна',
  'Варвара',
  'Дарья',
  'Елена',
  'Ирина',
  'Ксения',
  'Мария',
  'Ольга',
  'Полина',
  'Юлия',
];

/** mulberry32: small, fast, repeatable. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(mean: number, random: () => number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = random();
  while (p > limit) {
    k += 1;
    p *= random();
  }
  return k;
}

const at = (date: string, time: string) => `${date}T${time}:00+03:00`;

const DEMO_HEROES = ['knight', 'mage', 'barbarian', 'rogue', 'rogue-hooded', 'knight-2h'];

export function demoSeason(opts: { start: string; seed?: number }): EngineInput {
  const random = prng(opts.seed ?? 2026);
  const start = opts.start;
  const end = addDays(start, 13);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)] as T;

  const teams: Team[] = TEAMS.map((t, i) => ({
    id: `t${i + 1}`,
    leaderName: t.leader,
    // Heroes of the catalog (D-41): five heroes, one twice with another weapon.
    characterId: DEMO_HEROES[i % DEMO_HEROES.length] as string,
    color: t.color,
    order: i + 1,
  }));

  const names = new Set<string>();
  const nextName = () => {
    for (;;) {
      const female = random() < 0.6;
      const surname = pick(SURNAMES);
      const name = `${female ? `${surname}а` : surname} ${pick(female ? FEMALE : MALE)}`;
      if (!names.has(name)) {
        names.add(name);
        return name;
      }
    }
  };

  type Operator = { manager: Manager; ability: number; teamFactor: (date: string) => number };
  const operators: Operator[] = [];
  const firstDay = start;
  const secondMonday = addDays(start, 7);
  TEAMS.forEach((t, ti) => {
    for (let k = 0; k < t.size; k++) {
      const id = `m${String(operators.length + 1).padStart(2, '0')}`;
      operators.push({
        manager: {
          id,
          fullName: nextName(),
          aliases: [],
          memberships: [{ teamId: `t${ti + 1}`, from: firstDay }],
        },
        ability: 0.6 + random() * 0.9,
        teamFactor: () => t.factor,
      });
    }
  });

  const calendar = buildCalendar({ period: { start, end }, holidays: [] });
  const days = calendar.workingDays;
  const factorOf = (teamId: string) => TEAMS[Number(teamId.slice(1)) - 1]?.factor ?? 1;

  // Roster life: a transfer and a newcomer on the second Monday, a firing on the seventh day.
  const moved = operators[11] as Operator; // the last of team 1 moves to team 4
  moved.manager.memberships = [
    { teamId: 't1', from: firstDay, to: addDays(secondMonday, -1) },
    { teamId: 't4', from: secondMonday },
  ];
  moved.teamFactor = (date) => (date < secondMonday ? factorOf('t1') : factorOf('t4'));
  const fired = operators[13] as Operator; // in team 2
  const firedAt = days[6] as string;
  fired.manager.firedAt = firedAt;
  fired.manager.firedReason = 'демо: ушёл в другой отдел';
  const newcomer: Operator = {
    manager: {
      id: `m${String(operators.length + 1).padStart(2, '0')}`,
      fullName: nextName(),
      aliases: [],
      memberships: [{ teamId: 't6', from: secondMonday }],
    },
    ability: 0.8,
    teamFactor: () => factorOf('t6'),
  };
  operators.push(newcomer);

  const records: MetricRecord[] = [];
  const imports: ImportLog[] = [];
  for (const date of days) {
    const importId = `imp-${date}`;
    let rows = 0;
    for (const op of operators) {
      const m = op.manager;
      const from = m.memberships[0]?.from ?? start;
      if (date < from || (m.firedAt !== undefined && date >= m.firedAt)) continue;
      if (random() < DAY_OFF) continue;
      const scale = op.ability * op.teamFactor(date) * (0.8 + random() * 0.4);
      records.push({
        managerId: m.id,
        date,
        kind: 'daily',
        values: {
          inv6: poisson(MEAN.inv6 * scale, random),
          inv20: poisson(MEAN.inv20 * scale, random),
          pay: poisson(MEAN.pay * scale, random),
        },
        importId,
      });
      rows += 1;
    }
    const hash = Array.from({ length: 64 }, () => Math.floor(random() * 16).toString(16)).join('');
    imports.push({
      id: importId,
      fileName: 'демо-выгрузка.xlsx',
      fileSha256: hash,
      profileId: 'funnel',
      rows,
      matched: rows,
      unmatched: 0,
      dateRange: [date, date],
      by: 'demo',
      at: at(addDays(date, 1), '09:00'),
      warnings: [],
    });
  }

  const meta = (id: string, when: string, reason: string) => ({ id, at: when, reason, by: 'demo' });
  const d = (i: number) => days[i] as string;
  const adjustments: Adjustment[] = [
    {
      ...meta('adj-steps', at(d(4), '18:00'), 'демо: бонус команде за наставничество'),
      type: 'team_steps',
      teamId: 't4',
      value: 1,
    },
    {
      ...meta('adj-points', at(d(3), '11:00'), 'демо: оплата пришла с опозданием'),
      type: 'manager_points',
      managerId: 'm03',
      value: 10,
      date: d(2),
    },
    {
      ...meta('adj-call-1', at(d(5), '10:00'), 'демо: звонок недели'),
      type: 'grant_achievement',
      achievementId: 'best_call',
      managerId: 'm05',
      date: d(4),
    },
    {
      ...meta('adj-call-2', at(d(9), '17:00'), 'демо: звонок недели'),
      type: 'grant_achievement',
      achievementId: 'best_call',
      managerId: 'm20',
    },
  ];

  const config: SeasonConfig = {
    schemaVersion: 1,
    id: 'demo',
    title: 'Демо-игра',
    status: 'active',
    period: { start, end },
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
    teams,
    managers: operators.map((o) => o.manager),
    achievements: starterAchievements,
    importProfiles: [],
    achievementBonusAffectsSteps: false,
    // The strip faces the viewer: yaw 0 (D-23).
    ui: { pollIntervalSec: 60, blurFreezeSec: 30, camera: { pitchDeg: 50, yawDeg: 0 } },
  };
  return { config, records, adjustments, imports };
}

/** Monday of the week of `date` (`YYYY-MM-DD`). */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}
