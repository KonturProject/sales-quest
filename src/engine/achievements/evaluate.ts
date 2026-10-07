import type { AchievementDef } from '../../data/schemas/achievements.ts';
import type { MetricRecord } from '../../data/schemas/records.ts';
import type { SeasonConfig } from '../../data/schemas/season.ts';
import type { PointEntry } from '../adjustments.ts';
import { weekOf, type Calendar } from '../calendar.ts';
import { dateOf } from '../dates.ts';
import { buildTeamPlans, type TeamPlans } from '../plans.ts';
import type { Prepared } from '../prepare.ts';
import { buildTimeline, type TimelineDay } from '../timeline.ts';
import { ruleContext } from './context.ts';
import { manualActions, revokedBy, subjectOf, type ManualActions } from './manual.ts';
import { dailyMetricOf, runRule } from './rules/index.ts';
import { POINTS, type Candidate, type RuleContext, type Unlock } from './types.ts';

export type AchievementResult = {
  unlocks: Unlock[];
  /** Leaderboard points of manager unlocks (FR-SCORE-5), on the unlock day inside the game. */
  bonuses: PointEntry[];
  /** Team standings by working day, with the bonuses when they move teams. */
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
  const snapshotOnly = snapshotOnlyMetrics(p.records);
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
        return settleUnlocks(def, found, ctx, manual);
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
 * Candidates and manual grants → unlocks: eligible managers only, revokes applied, one unlock per
 * subject (and week / day for repeatable achievements), the earliest; a manual grant stands over
 * an automatic unlock of the same day (ACH-2, D-29).
 */
function settleUnlocks(
  def: AchievementDef,
  found: Candidate[],
  ctx: RuleContext,
  manual: ManualActions,
): Unlock[] {
  const { calendar, today, config } = ctx;
  const make = (c: Candidate, source: Unlock['source']): Unlock => {
    const week = weekOf(calendar, c.date)?.index;
    return {
      achievementId: def.id,
      ...(c.managerId !== undefined ? { managerId: c.managerId } : { teamId: c.teamId }),
      unlockedAt: c.date,
      ...(week !== undefined ? { week } : {}),
      source,
    };
  };
  const auto = found
    .filter((c) => c.date >= calendar.start && c.date <= today)
    .filter((c) => c.managerId === undefined || ctx.eligible(c.managerId, c.date))
    .map((c) => ({ unlock: make(c, 'auto'), grantedAt: undefined }));
  const granted = manual.grants
    .filter((g) => g.achievementId === def.id && validSubject(def, g, config))
    .map((g) => ({
      unlock: make({ managerId: g.managerId, teamId: g.teamId, date: dateOf(g.at) }, 'manual'),
      grantedAt: g.at,
    }));
  const revokes = manual.revokes.filter((r) => r.achievementId === def.id);
  const kept = [...granted, ...auto]
    .filter(
      ({ unlock, grantedAt }) =>
        !revokedBy(revokes, {
          subject: subjectOf(unlock),
          unlockedAt: unlock.unlockedAt,
          grantedAt,
        }),
    )
    .map((x) => x.unlock)
    .sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt)); // stable: grants first on a tie

  const byKey = new Map<string, Unlock>();
  for (const u of kept) {
    const instance =
      def.repeatable === 'weekly'
        ? `w${u.week ?? 0}`
        : def.repeatable === 'daily'
          ? u.unlockedAt
          : '';
    const key = `${subjectOf(u)}|${instance}`;
    if (!byKey.has(key)) byKey.set(key, u);
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

/** Metrics that someone has only as running-total snapshots, without daily records (ACH-4). */
function snapshotOnlyMetrics(records: MetricRecord[]): Set<string> {
  const daily = new Set<string>();
  for (const r of records)
    if (r.kind === 'daily')
      for (const metric of Object.keys(r.values)) daily.add(`${r.managerId}|${metric}`);
  const only = new Set<string>();
  for (const r of records)
    if (r.kind === 'snapshot')
      for (const metric of Object.keys(r.values))
        if (!daily.has(`${r.managerId}|${metric}`)) only.add(metric);
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
