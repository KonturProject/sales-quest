import type { Calendar } from '../calendar.ts';
import { buildLeaderboard, type LeaderboardRow } from '../leaderboard.ts';
import { managerPointsBetween } from '../adjustments.ts';
import type { Prepared } from '../prepare.ts';
import { isFiredOn } from '../roster.ts';
import { pointsOf, weightsOf } from '../scoring.ts';
import { POINTS, type ManagerDay, type RuleContext } from './types.ts';

/** Sums of fractional weights carry float noise: a threshold is met within this margin. */
export const EPS = 1e-9;

export type Window = { start: string; end: string };

/** The game as one window, or its weeks (D-24). */
export function windowsOf(period: 'week' | 'season', calendar: Calendar): Window[] {
  return period === 'season'
    ? [{ start: calendar.start, end: calendar.end }]
    : calendar.weeks.map((w) => ({ start: w.start, end: w.end }));
}

export function valueOf(day: ManagerDay, metric: string): number {
  return metric === POINTS ? day.points : (day.values[metric] ?? 0);
}

export function sumIn(
  days: ManagerDay[],
  window: Window,
  value: (d: ManagerDay) => number,
): number {
  let sum = 0;
  for (const d of days) if (d.date >= window.start && d.date <= window.end) sum += value(d);
  return sum;
}

/** The day a running total over the window reaches `target`, if it does (D-29). */
export function dayReaching(
  days: ManagerDay[],
  window: Window,
  value: (d: ManagerDay) => number,
  target: number,
): string | undefined {
  let sum = 0;
  for (const d of days) {
    if (d.date < window.start || d.date > window.end) continue;
    sum += value(d);
    if (sum >= target - EPS) return d.date;
  }
  return undefined;
}

/**
 * Each manager's days inside the game up to today: records plus point corrections for the day
 * (D-25); points by the weights, without achievement bonuses (D-29).
 */
export function managerDays(p: Prepared, today: string): Map<string, ManagerDay[]> {
  const { config } = p;
  const weights = weightsOf(config);
  const until = today < config.period.end ? today : config.period.end;
  const corrections = new Map<string, Map<string, number>>();
  for (const e of managerPointsBetween(p.adjustments, config.period.start, until)) {
    let byDate = corrections.get(e.managerId);
    if (!byDate) corrections.set(e.managerId, (byDate = new Map()));
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.value);
  }
  return new Map(
    config.managers.map((m) => {
      const series = p.series.get(m.id);
      const extra = corrections.get(m.id);
      const dates = new Set<string>();
      for (const date of series?.keys() ?? []) if (date <= until) dates.add(date);
      for (const date of extra?.keys() ?? []) dates.add(date);
      const days = [...dates].sort().map((date) => {
        const values = series?.get(date) ?? {};
        return { date, values, points: pointsOf(values, weights) + (extra?.get(date) ?? 0) };
      });
      return [m.id, days];
    }),
  );
}

/** The context shared by every rule (team rules also get the timeline). */
export function ruleContext(p: Prepared, today: string): RuleContext {
  const { config, calendar } = p;
  const managers = new Map(config.managers.map((m) => [m.id, m]));
  const boards = new Map<number | 'season', LeaderboardRow[] | null>();
  const board = (period: number | 'season'): LeaderboardRow[] | null => {
    if (!boards.has(period)) {
      const range =
        period === 'season'
          ? { from: calendar.start, to: calendar.end }
          : (() => {
              const week = calendar.weeks[period - 1];
              return week && { from: week.start, to: week.end };
            })();
      // Ranked at the end of the period, by the roster of that day and without bonuses (D-29).
      boards.set(
        period,
        range && today > range.to
          ? buildLeaderboard({ ...p, from: range.from, to: range.to, today: range.to })
          : null,
      );
    }
    return boards.get(period) ?? null;
  };
  return {
    config,
    calendar,
    track: p.track,
    today,
    days: managerDays(p, today),
    timeline: [],
    board,
    eligible: (managerId, date) => {
      const m = managers.get(managerId);
      return m !== undefined && !isFiredOn(m, date);
    },
  };
}
