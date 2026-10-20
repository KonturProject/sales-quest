import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { pointsDateOf } from '../engine/adjustments.ts';
import { addDays } from '../engine/dates.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { teamOn } from '../engine/roster.ts';
import { buildDailySeries, type DailySeries } from '../engine/scoring.ts';
import { manualCount } from '../finale/results.ts';

/**
 * What an export changes per operator (2b-3): the season before and after the file over the file's days —
 * «было → по выгрузке» of every metric, and the net count of the author's «показатели за день» corrections
 * (D-53: read from their code-written reason by `manualCount`, cancelled ones out). Pure.
 */

/** One metric of one operator over the file's days (or one day). */
export type MetricChange = {
  metricId: string;
  title: string;
  /** The records before the file. */
  before: number;
  /** The records after the file. */
  file: number;
  /** The net count of active «показатели» corrections, after the batch (its fixes in, its cancels out). */
  manual: number;
};

export type OperatorChange = {
  managerId: string;
  name: string;
  /** The team on the file's last day. */
  teamId: string;
  /** The config's metrics in order, all of them (the screen dims the unchanged). */
  metrics: MetricChange[];
  /** Only the days where something differs. */
  days: { date: string; metrics: MetricChange[] }[];
};

/** A day the file raises a metric that active manual corrections had already added. */
export type DoubleCount = {
  managerId: string;
  date: string;
  metricId: string;
  /** File − before, that day. */
  raised: number;
  /** The net manual count that day. */
  manual: number;
  /** The active positive corrections of that operator, day and metric — to offer cancelling. */
  adjustmentIds: string[];
};

const key = (managerId: string, date: string, metricId: string) =>
  `${managerId}|${date}|${metricId}`;

function daysOf([from, to]: [string, string]): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** `managerId|date|metricId` — the key of the manual counts. */
export const countKey = key;

/**
 * The net manual counts by operator, day and metric (`countKey`), and the active positive corrections behind
 * them — the import preview's hint and the journal's past double counts (2b-3).
 */
export function manualCounts(adjustments: Adjustment[], config: SeasonConfig) {
  const net = new Map<string, number>();
  const plus = new Map<string, string[]>();
  for (const a of adjustments) {
    const found = manualCount(a, config);
    if (!found || a.type !== 'manager_points') continue;
    const k = key(a.managerId, pointsDateOf(a), found.metricId);
    net.set(k, (net.get(k) ?? 0) + found.count);
    if (found.count > 0) plus.set(k, [...(plus.get(k) ?? []), a.id]);
  }
  return { net, plus };
}

const valueOf = (series: DailySeries, managerId: string, date: string, metricId: string) =>
  series.get(managerId)?.get(date)?.[metricId] ?? 0;

export function importChanges(
  before: EngineInput,
  after: EngineInput,
  period: [string, string],
): OperatorChange[] {
  const { config } = after;
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const was = buildDailySeries(before.records, before.config.period).series;
  const now = buildDailySeries(after.records, after.config.period).series;
  const manualWas = manualCounts(before.adjustments, before.config).net;
  const manualNow = manualCounts(after.adjustments, config).net;
  const days = daysOf(period);
  const teams = new Map(config.teams.map((t) => [t.id, t.order]));

  const rows: OperatorChange[] = [];
  for (const m of config.managers) {
    const changedDays: OperatorChange['days'] = [];
    const sums = metrics.map((x) => ({
      metricId: x.id,
      title: x.title,
      before: 0,
      file: 0,
      manual: 0,
    }));
    for (const date of days) {
      let differs = false;
      const dayMetrics = metrics.map((x, i) => {
        const k = key(m.id, date, x.id);
        const change = {
          metricId: x.id,
          title: x.title,
          before: valueOf(was, m.id, date, x.id),
          file: valueOf(now, m.id, date, x.id),
          manual: manualNow.get(k) ?? 0,
        };
        if (change.before !== change.file || (manualWas.get(k) ?? 0) !== change.manual)
          differs = true;
        const sum = sums[i];
        if (sum) {
          sum.before += change.before;
          sum.file += change.file;
          sum.manual += change.manual;
        }
        return change;
      });
      if (differs) changedDays.push({ date, metrics: dayMetrics });
    }
    if (changedDays.length > 0)
      rows.push({
        managerId: m.id,
        name: m.fullName,
        teamId: teamOn(m, period[1]),
        metrics: sums,
        days: changedDays,
      });
  }
  const order = (teamId: string) => teams.get(teamId) ?? Number.MAX_SAFE_INTEGER;
  return rows.sort(
    (a, b) => order(a.teamId) - order(b.teamId) || a.name.localeCompare(b.name, 'ru'),
  );
}

/**
 * The file raises a day's metric that the author had already added by hand — the net manual count of that day
 * before the file is above zero. The batch's own fixes are not counted: they come from `before`.
 */
export function doubleCounts(
  before: EngineInput,
  after: EngineInput,
  period: [string, string],
): DoubleCount[] {
  const was = buildDailySeries(before.records, before.config.period).series;
  const now = buildDailySeries(after.records, after.config.period).series;
  const { net, plus } = manualCounts(before.adjustments, before.config);
  const metrics = [...after.config.metrics].sort((a, b) => a.order - b.order);
  const found: DoubleCount[] = [];
  for (const m of after.config.managers)
    for (const date of daysOf(period))
      for (const x of metrics) {
        const k = key(m.id, date, x.id);
        const raised = valueOf(now, m.id, date, x.id) - valueOf(was, m.id, date, x.id);
        const manual = net.get(k) ?? 0;
        if (raised > 0 && manual > 0)
          found.push({
            managerId: m.id,
            date,
            metricId: x.id,
            raised,
            manual,
            adjustmentIds: plus.get(k) ?? [],
          });
      }
  return found;
}
