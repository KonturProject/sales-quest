import { z } from 'zod';
import { buildCalendar, type Calendar } from '../../engine/calendar.ts';
import { AchievementDefSchema, POINTS, ruleMetrics } from './achievements.ts';
import { HexColorSchema, IdSchema, IsoDateSchema } from './common.ts';

export const MetricSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  weight: z.number().min(0),
  order: z.number().int(),
});

export const LocationSchema = z.object({
  index: z.number().int().min(1).max(4),
  title: z.string().min(1),
  themePackId: z.string().min(1),
});

export const TeamSchema = z.object({
  id: IdSchema,
  leaderName: z.string().min(1),
  characterId: z.string().min(1),
  color: HexColorSchema,
  /** Group code in the exports, e.g. `СР1` (D-21). */
  sourceCode: z.string().min(1).optional(),
  targetPoints: z.number().positive().optional(),
  order: z.number().int(),
});

/** A period in a team, dates inclusive; no `to` — still in the team (ADM-ROSTER). */
export const MembershipSchema = z.object({
  teamId: IdSchema,
  from: IsoDateSchema,
  to: IsoDateSchema.optional(),
});

export const ManagerSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  /** Norm per working day for each metric (R-2). */
  dailyNorms: z.record(z.string(), z.number().min(0)).optional(),
  memberships: z.array(MembershipSchema).min(1),
  firedAt: IsoDateSchema.optional(),
  firedReason: z.string().optional(),
});

const SeasonShape = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  title: z.string().min(1),
  status: z.enum(['draft', 'active', 'closed']),
  /** Any length; two weeks by default (D-24). */
  period: z.object({ start: IsoDateSchema, end: IsoDateSchema }),
  /** Explicit working days; without it — Mon–Fri of the period minus holidays. */
  workingDays: z.array(IsoDateSchema).min(1, 'список рабочих дней пуст').optional(),
  holidays: z.array(IsoDateSchema).default([]),
  track: z.object({
    cellsPerWorkingDay: z.number().int().min(1).max(20),
    overflowPct: z.number().min(0).max(200),
  }),
  progressMode: z.enum(['plan_percent', 'per_capita', 'absolute']),
  /** Target of a manager without daily norms, points per working day (D-24, OQ-3). */
  defaultDailyTargetPoints: z.number().positive(),
  pointsPerStep: z.number().positive().optional(),
  metricsCounting: z.enum(['exclusive', 'inclusive']),
  metrics: z.array(MetricSchema).min(1),
  locations: z.array(LocationSchema).length(4),
  teams: z.array(TeamSchema).min(1),
  managers: z.array(ManagerSchema),
  achievements: z.array(AchievementDefSchema).default([]),
  /** Import profiles arrive with stage 2. */
  importProfiles: z.array(z.unknown()).default([]),
  achievementBonusAffectsSteps: z.boolean().default(false),
  ui: z.object({
    pollIntervalSec: z.number().int().min(30).max(300),
    blurFreezeSec: z.number().int().min(0),
    camera: z.object({ pitchDeg: z.number(), yawDeg: z.number() }),
  }),
});

/** The season (= one game) config: one schema for season.json and the XLSX template (DATA-13). */
export const SeasonConfigSchema = SeasonShape.superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const unique = (path: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issue([path], `повторяется ${id}`);
      seen.add(id);
    }
  };

  let calendar: Calendar | undefined;
  if (c.period.start > c.period.end) issue(['period', 'end'], 'конец периода раньше начала');
  else {
    // The engine's own rule decides what a working day is; a game needs at least one.
    try {
      calendar = buildCalendar(c);
    } catch {
      issue(['period'], 'в игре нет рабочих дней');
    }
  }
  (c.workingDays ?? []).forEach((d, i) => {
    if (d < c.period.start || d > c.period.end)
      issue(['workingDays', i], `рабочий день ${d} вне периода игры`);
  });
  unique(
    'metrics',
    c.metrics.map((m) => m.id),
  );
  unique(
    'teams',
    c.teams.map((t) => t.id),
  );
  unique(
    'managers',
    c.managers.map((m) => m.id),
  );
  unique(
    'locations',
    c.locations.map((l) => `локация ${l.index}`),
  );
  unique(
    'achievements',
    c.achievements.map((a) => a.id),
  );
  if (c.progressMode === 'absolute' && c.pointsPerStep === undefined)
    issue(['pointsPerStep'], 'режим absolute требует pointsPerStep');

  const metricIds = new Set(c.metrics.map((m) => m.id));
  c.metrics.forEach((m, i) => {
    if (m.id === POINTS)
      issue(['metrics', i, 'id'], `id ${POINTS} занят: так в ачивках зовутся баллы`);
  });
  c.achievements.forEach((a, i) => {
    const { metrics, pointsAllowed } = ruleMetrics(a.rule);
    for (const metric of metrics)
      if (!metricIds.has(metric) && !(pointsAllowed && metric === POINTS))
        issue(['achievements', i, 'rule'], `нет метрики ${metric}`);
    if (a.rule.type === 'target' && a.rule.week !== undefined && calendar)
      if (a.rule.week > calendar.weeks.length)
        issue(
          ['achievements', i, 'rule', 'week'],
          `в игре ${calendar.weeks.length} нед., недели ${a.rule.week} нет`,
        );
  });
  const teamIds = new Set(c.teams.map((t) => t.id));
  c.managers.forEach((m, i) => {
    if (m.dailyNorms && Object.keys(m.dailyNorms).length === 0)
      issue(['managers', i, 'dailyNorms'], 'нормативы пустые — заполните их или уберите поле');
    for (const metric of Object.keys(m.dailyNorms ?? {}))
      if (!metricIds.has(metric))
        issue(['managers', i, 'dailyNorms', metric], `нет метрики ${metric}`);
    m.memberships.forEach((p, j) => {
      const path = ['managers', i, 'memberships', j];
      if (!teamIds.has(p.teamId)) issue([...path, 'teamId'], `нет команды ${p.teamId}`);
      if (p.to !== undefined && p.to < p.from)
        issue([...path, 'to'], 'период в команде кончается раньше, чем начинается');
      const next = m.memberships[j + 1];
      if (next && (p.to === undefined || p.to >= next.from))
        issue(
          ['managers', i, 'memberships', j + 1, 'from'],
          'периоды в командах идут по порядку и не пересекаются',
        );
    });
  });
});

export type SeasonConfig = z.output<typeof SeasonConfigSchema>;
export type Metric = SeasonConfig['metrics'][number];
export type Team = SeasonConfig['teams'][number];
export type Manager = SeasonConfig['managers'][number];
export type Membership = Manager['memberships'][number];

/** Validates a season config; throws a ZodError that lists every problem with its path. */
export function parseSeasonConfig(input: unknown): SeasonConfig {
  return SeasonConfigSchema.parse(input);
}
