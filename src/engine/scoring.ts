import type { MetricRecord } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';

/** metricId → value. */
export type MetricValues = Record<string, number>;
/** managerId → date → that day's values. */
export type DailySeries = Map<string, Map<string, MetricValues>>;

/**
 * One value per manager, day and metric. Daily records merge in order — the later value of a
 * metric wins, so re-importing a file changes nothing (DATA-5, FR-STEP-5). Snapshots (running
 * totals, DATA-6) become day-to-day differences counted from the last snapshot before the
 * period. A metric that has daily records ignores that manager's snapshots. Days outside the
 * period are dropped (DATA-7).
 */
export function buildDailySeries(
  records: MetricRecord[],
  period: { start: string; end: string },
): { series: DailySeries; warnings: string[] } {
  const series: DailySeries = new Map();
  const warnings: string[] = [];
  const valuesOf = (managerId: string, date: string): MetricValues => {
    let days = series.get(managerId);
    if (!days) series.set(managerId, (days = new Map()));
    let values = days.get(date);
    if (!values) days.set(date, (values = {}));
    return values;
  };

  const dailyMetrics = new Map<string, Set<string>>();
  // managerId → metric → date → running total (the later record of a date wins)
  const snapshots = new Map<string, Map<string, Map<string, number>>>();
  for (const r of records) {
    if (r.kind === 'daily') {
      if (r.date < period.start || r.date > period.end) continue;
      Object.assign(valuesOf(r.managerId, r.date), r.values);
      let metrics = dailyMetrics.get(r.managerId);
      if (!metrics) dailyMetrics.set(r.managerId, (metrics = new Set()));
      for (const metric of Object.keys(r.values)) metrics.add(metric);
    } else {
      let byMetric = snapshots.get(r.managerId);
      if (!byMetric) snapshots.set(r.managerId, (byMetric = new Map()));
      for (const [metric, total] of Object.entries(r.values)) {
        let byDate = byMetric.get(metric);
        if (!byDate) byMetric.set(metric, (byDate = new Map()));
        byDate.set(r.date, total);
      }
    }
  }

  for (const [managerId, byMetric] of snapshots) {
    for (const [metric, byDate] of byMetric) {
      if (dailyMetrics.get(managerId)?.has(metric)) {
        warnings.push(`${managerId}: «${metric}» есть и по дням, и снимками — снимки не учтены`);
        continue;
      }
      let previous = 0;
      for (const [date, total] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
        if (date > period.end) break;
        if (date >= period.start) valuesOf(managerId, date)[metric] = total - previous;
        previous = total;
      }
    }
  }
  return { series, warnings };
}

export function weightsOf(config: Pick<SeasonConfig, 'metrics'>): MetricValues {
  return Object.fromEntries(config.metrics.map((m) => [m.id, m.weight]));
}

/** Σ value × weight over the season's metrics (FR-SCORE-1). */
export function pointsOf(values: MetricValues, weights: MetricValues): number {
  let points = 0;
  for (const [metric, weight] of Object.entries(weights)) points += (values[metric] ?? 0) * weight;
  return points;
}

export function addValues(into: MetricValues, values: MetricValues): MetricValues {
  for (const [metric, value] of Object.entries(values)) into[metric] = (into[metric] ?? 0) + value;
  return into;
}

/** A manager's values summed over [from, to]. */
export function totalsBetween(
  days: Map<string, MetricValues> | undefined,
  from: string,
  to: string,
): MetricValues {
  const totals: MetricValues = {};
  for (const [date, values] of days ?? [])
    if (date >= from && date <= to) addValues(totals, values);
  return totals;
}
