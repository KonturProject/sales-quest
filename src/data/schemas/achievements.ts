import { z } from 'zod';
import { POINTS } from '../../engine/achievements/types.ts';
import { IdSchema, IsoDateSchema } from './common.ts';

export { POINTS };

const Window = z.enum(['week', 'season']);

/** Rule of an achievement (§6.1 with D-15, D-30); a new type needs a handler in the engine. */
export const AchievementRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('threshold'),
    metric: IdSchema,
    period: z.enum(['day', 'week', 'season']),
    op: z.literal('>=').default('>='),
    value: z.number().positive(),
  }),
  /** `days` consecutive working days with at least `minPerDay`. */
  z.object({
    type: z.literal('streak'),
    metric: IdSchema,
    minPerDay: z.number().positive(),
    days: z.number().int().min(2),
  }),
  z.object({
    type: z.literal('ratio'),
    numerator: IdSchema,
    denominator: z.array(IdSchema).min(1),
    minRatio: z.number().positive(),
    minDenominator: z.number().positive(),
    period: Window,
  }),
  /** Place on the leaderboard at the end of a finished period; `everyWeek` — in every week (D-15). */
  z.object({
    type: z.literal('rank'),
    by: z.literal('points'),
    period: Window,
    top: z.number().int().min(1),
    everyWeek: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('first'),
    metric: IdSchema,
    within: z.enum(['department', 'team']),
    period: Window,
  }),
  z.object({
    type: z.literal('growth'),
    metric: IdSchema,
    weekOverWeekPct: z.number().positive(),
    minBase: z.number().positive(),
  }),
  /** The manager's plan for the whole game reached by the end of game week `week`, or by `date`. */
  z.object({
    type: z.literal('target'),
    before: z.enum(['week_end', 'date']),
    week: z.number().int().min(1).optional(),
    date: IsoDateSchema.optional(),
  }),
  /** `overflow` — a step past the finish; `overflow_end` — the end of the overflow zone. */
  z.object({
    type: z.literal('team_position'),
    reach: z.enum(['location', 'finish', 'overflow', 'overflow_end']),
    locationIndex: z.number().int().min(2).max(4).optional(),
    firstOnly: z.boolean(),
  }),
  /** Ahead of the team's own pace line `aheadDays` working days in a row. */
  z.object({ type: z.literal('team_pace'), aheadDays: z.number().int().min(1) }),
  z.object({
    type: z.literal('team_all_members'),
    metric: IdSchema,
    minEach: z.number().positive(),
    period: Window,
  }),
  z.object({ type: z.literal('manual') }),
]);
export type AchievementRule = z.output<typeof AchievementRuleSchema>;
export type AchievementRuleType = AchievementRule['type'];

const TEAM_RULES: readonly AchievementRuleType[] = [
  'team_position',
  'team_pace',
  'team_all_members',
];

/** An achievement of the season config (ACH-MODEL). */
export const AchievementDefSchema = z
  .object({
    id: IdSchema,
    title: z.string().min(1),
    description: z.string().default(''),
    /** Icon id from the asset manifest (stage 4). */
    icon: z.string().min(1),
    scope: z.enum(['manager', 'team']),
    rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
    rule: AchievementRuleSchema,
    repeatable: z.union([z.literal(false), z.enum(['weekly', 'daily'])]).default(false),
    /** Leaderboard points for the unlock (FR-SCORE-5); managers only. */
    bonusPoints: z.number().min(0).default(0),
    enabled: z.boolean().default(true),
  })
  .superRefine((a, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const { rule } = a;
    if (rule.type !== 'manual') {
      const teamRule = TEAM_RULES.includes(rule.type);
      if (teamRule && a.scope !== 'team')
        issue(['scope'], `правило ${rule.type} — для команд, нужен scope: team`);
      if (!teamRule && a.scope !== 'manager')
        issue(['scope'], `правило ${rule.type} — для операторов, нужен scope: manager`);
    }
    if (a.scope === 'team' && a.bonusPoints > 0)
      issue(['bonusPoints'], 'бонусные баллы бывают только у ачивок операторов');
    if (rule.type === 'target') {
      if (rule.before === 'week_end' && rule.week === undefined)
        issue(['rule', 'week'], 'укажите номер недели игры');
      if (rule.before === 'date' && rule.date === undefined)
        issue(['rule', 'date'], 'укажите дату');
    }
    if (rule.type === 'team_position' && rule.reach === 'location' && !rule.locationIndex)
      issue(['rule', 'locationIndex'], 'укажите номер локации (2–4)');
    if (rule.type === 'rank' && rule.everyWeek && rule.period !== 'week')
      issue(['rule', 'everyWeek'], '«каждую неделю» — только для периода week');
  });
export type AchievementDef = z.output<typeof AchievementDefSchema>;
export type AchievementDefInput = z.input<typeof AchievementDefSchema>;

/** Metric ids a rule reads, and whether it may read `points`. */
export function ruleMetrics(rule: AchievementRule): { metrics: string[]; pointsAllowed: boolean } {
  switch (rule.type) {
    case 'threshold':
    case 'growth':
      return { metrics: [rule.metric], pointsAllowed: true };
    case 'streak':
    case 'first':
    case 'team_all_members':
      return { metrics: [rule.metric], pointsAllowed: false };
    case 'ratio':
      return { metrics: [rule.numerator, ...rule.denominator], pointsAllowed: false };
    default:
      return { metrics: [], pointsAllowed: false };
  }
}
