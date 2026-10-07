import type { AchievementDef } from '../../data/schemas/achievements.ts';
import type { MetricRecord } from '../../data/schemas/records.ts';
import type { SeasonConfig } from '../../data/schemas/season.ts';
import type { PointEntry } from '../adjustments.ts';
import { weekOf, type Calendar } from '../calendar.ts';
import { buildTeamPlans, type TeamPlans } from '../plans.ts';
import type { Prepared } from '../prepare.ts';
import { buildTimeline, type TimelineDay } from '../timeline.ts';
import { ruleContext } from './context.ts';
import {
  actionDateOf,
  manualActions,
  subjectOf,
  type Grant,
  type ManualActions,
} from './manual.ts';
import { dailyMetricOf, runRule } from './rules/index.ts';
import { POINTS, type Candidate, type RuleContext, type Unlock } from './types.ts';

export type AchievementResult = {
  unlocks: Unlock[];
  /** Leaderboard points of manager unlocks (FR-SCORE-5), on the unlock day inside the game. */
  bonuses: PointEntry[];
  /** Team standings by day, with the bonuses when they move teams. */
  timeline: TimelineDay[];
  warnings: string[];
};

/**
 * Achievements earned by `today` (ACH-1…ACH-4, D-27…D-29): manager rules → bonuses → team
 * positions (timeline) → team rules; manual grants and revokes merged in.
 */
export function evaluateAchievements(
  p: Prepared,
  today: string,
  plans: TeamPlans = buildTeamPlans(p.config, p.calendar, p.track),
): AchievementResult {
  const { config, calendar } = p;
  const warnings: string[] = [];
  const manual = manualActions(p.adjustments, today);
  warnings.push(...manualWarnings(config, manual));
  const snapshotOnly = snapshotOnlyMetrics(p.records, config);
  const settle = (scope: AchievementDef['scope'], ctx: RuleContext) =>
    config.achievements
      .filter((def) => def.scope === scope && def.enabled)
      .flatMap((def) => {
        const blocked = blockedMetric(def, snapshotOnly);
        if (blocked !== undefined)
          warnings.push(
            `ачивка «${def.title}» (${def.id}) выключена: по «${blocked}» есть только итоги-снимки, а ей нужны данные по дням (ACH-4)`,
          );
        const found =
          blocked === undefined && def.rule.type !== 'manual' ? runRule(def.rule, ctx) : [];
        return settleUnlocks(def, found, ctx, manual, warnings);
      });

  const ctx = ruleContext(p, today);
  const managerUnlocks = settle('manager', ctx);
  const bonuses = bonusesOf(managerUnlocks, config, calendar);
  const timeline = buildTimeline(p, today, {
    plans,
    bonuses: config.achievementBonusAffectsSteps ? bonuses : [],
  });
  const teamUnlocks = settle('team', { ...ctx, timeline });

  const order = new Map(config.achievements.map((a, i) => [a.id, i]));
  const unlocks = [...managerUnlocks, ...teamUnlocks].sort(
    (a, b) =>
      a.unlockedAt.localeCompare(b.unlockedAt) ||
      (order.get(a.achievementId) ?? 0) - (order.get(b.achievementId) ?? 0) ||
      subjectOf(a).localeCompare(subjectOf(b)),
  );
  return { unlocks, bonuses, timeline, warnings };
}

/**
 * Candidates and manual grants → unlocks (ACH-2, ACH-3, D-29). One unlock per subject and
 * instance — once, per week or per day, by `repeatable` — the earliest; a grant stands over an
 * automatic unlock of the same day. A revoke takes back its instance (the week or day of its
 * `date`): automatic unlocks of it for good, grants made before the revoke.
 */
function settleUnlocks(
  def: AchievementDef,
  found: Candidate[],
  ctx: RuleContext,
  manual: ManualActions,
  warnings: string[],
): Unlock[] {
  const { calendar, today, config } = ctx;
  const instanceOf = (date: string) =>
    def.repeatable === 'weekly'
      ? `w${weekOf(calendar, date)?.index ?? 0}`
      : def.repeatable === 'daily'
        ? date
        : '';
  type Entry = { unlock: Unlock; key: string; grant?: Grant };
  const entry = (subject: string, date: string, grant?: Grant): Entry => {
    const week = weekOf(calendar, date)?.index;
    return {
      unlock: {
        achievementId: def.id,
        ...(def.scope === 'manager' ? { managerId: subject } : { teamId: subject }),
        unlockedAt: date,
        ...(week !== undefined ? { week } : {}),
        source: grant ? 'manual' : 'auto',
      },
      key: `${subject}|${instanceOf(date)}`,
      ...(grant ? { grant } : {}),
    };
  };
  const subjectIn = (a: { managerId?: string; teamId?: string }) =>
    (def.scope === 'manager' ? a.managerId : a.teamId) ?? '';

  const entries: Entry[] = [];
  for (const g of manual.grants) {
    if (g.achievementId !== def.id || !validSubject(def, g, config)) continue;
    const subject = subjectIn(g);
    const date = actionDateOf(g);
    if (def.scope === 'manager' && !ctx.eligible(subject, date))
      warnings.push(`выдача ${g.id}: оператор ${subject} уволен на ${date} — не учтено`);
    else entries.push(entry(subject, date, g));
  }
  for (const c of found)
    if (c.date >= calendar.start && c.date <= today)
      if (c.managerId === undefined || ctx.eligible(c.managerId, c.date))
        entries.push(entry(subjectOf(c), c.date));

  const revokes = manual.revokes
    .filter((r) => r.achievementId === def.id && validSubject(def, r, config))
    .map((r) => ({ key: `${subjectIn(r)}|${instanceOf(actionDateOf(r))}`, at: Date.parse(r.at) }));
  const kept = entries
    .filter(
      (e) =>
        !revokes.some(
          (r) => r.key === e.key && (e.grant === undefined || Date.parse(e.grant.at) <= r.at),
        ),
    )
    .sort((a, b) => a.unlock.unlockedAt.localeCompare(b.unlock.unlockedAt)); // stable: grants first

  const byKey = new Map<string, Unlock>();
  for (const e of kept) {
    const held = byKey.get(e.key);
    if (!held) byKey.set(e.key, e.unlock);
    else if (e.grant)
      warnings.push(
        `выдача ${e.grant.id}: у ${subjectOf(e.unlock)} уже есть ачивка ${def.id}${e.unlock.week !== undefined && def.repeatable === 'weekly' ? ` за неделю ${e.unlock.week}` : ''} (с ${held.unlockedAt}) — не учтено`,
      );
  }
  return [...byKey.values()];
}

function validSubject(
  def: AchievementDef,
  a: { managerId?: string; teamId?: string },
  config: SeasonConfig,
): boolean {
  return def.scope === 'manager'
    ? a.managerId !== undefined && config.managers.some((m) => m.id === a.managerId)
    : a.teamId !== undefined && config.teams.some((t) => t.id === a.teamId);
}

function manualWarnings(config: SeasonConfig, manual: ManualActions): string[] {
  const defs = new Map(config.achievements.map((a) => [a.id, a]));
  const warnings: string[] = [];
  for (const a of [...manual.grants, ...manual.revokes]) {
    const what = a.type === 'grant_achievement' ? 'выдача' : 'отзыв';
    const def = defs.get(a.achievementId);
    if (!def) warnings.push(`${what} ${a.id}: ачивки ${a.achievementId} нет в игре — не учтено`);
    else if (!def.enabled && a.type === 'grant_achievement')
      warnings.push(`${what} ${a.id}: ачивка ${a.achievementId} выключена — не учтено`);
    else if (!validSubject(def, a, config))
      warnings.push(
        `${what} ${a.id}: ачивка ${a.achievementId} — для ${def.scope === 'manager' ? 'операторов, нужен оператор' : 'команд, нужна команда'} из состава — не учтено`,
      );
  }
  return warnings;
}

/**
 * Metrics of the game that a manager of the roster has only as running-total snapshots, without
 * daily records (ACH-4).
 */
function snapshotOnlyMetrics(records: MetricRecord[], config: SeasonConfig): Set<string> {
  const metrics = new Set(config.metrics.map((m) => m.id));
  const managers = new Set(config.managers.map((m) => m.id));
  const daily = new Set<string>();
  for (const r of records)
    if (r.kind === 'daily')
      for (const metric of Object.keys(r.values)) daily.add(`${r.managerId}|${metric}`);
  const only = new Set<string>();
  for (const r of records)
    if (r.kind === 'snapshot' && managers.has(r.managerId))
      for (const metric of Object.keys(r.values))
        if (metrics.has(metric) && !daily.has(`${r.managerId}|${metric}`)) only.add(metric);
  return only;
}

/** The metric that keeps a day-by-day rule from running, if any (ACH-4). */
function blockedMetric(def: AchievementDef, snapshotOnly: Set<string>): string | undefined {
  if (def.rule.type === 'manual') return undefined;
  const metric = dailyMetricOf(def.rule);
  if (metric === undefined) return undefined;
  if (metric === POINTS) return [...snapshotOnly][0];
  return snapshotOnly.has(metric) ? metric : undefined;
}

function bonusesOf(unlocks: Unlock[], config: SeasonConfig, calendar: Calendar): PointEntry[] {
  const bonus = new Map(config.achievements.map((a) => [a.id, a.bonusPoints]));
  const entries: PointEntry[] = [];
  for (const u of unlocks) {
    const value = bonus.get(u.achievementId) ?? 0;
    if (u.managerId === undefined || value <= 0) continue;
    // A grant after the game counts on its last day (D-29).
    const date =
      u.unlockedAt > calendar.end
        ? calendar.end
        : u.unlockedAt < calendar.start
          ? calendar.start
          : u.unlockedAt;
    entries.push({ managerId: u.managerId, date, value });
  }
  return entries;
}
