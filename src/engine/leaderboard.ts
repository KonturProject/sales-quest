import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { entriesBetween, managerPointsBetween, type PointEntry } from './adjustments.ts';
import { isFiredOn, teamOn } from './roster.ts';
import {
  pointsOf,
  totalsBetween,
  weightsOf,
  type DailySeries,
  type MetricValues,
} from './scoring.ts';

export type LeaderboardRow = {
  managerId: string;
  fullName: string;
  /** Current team (on `today`). */
  teamId: string;
  fired: boolean;
  totals: MetricValues;
  /** Points by the weights, corrections (D-25) and achievement bonuses. */
  points: number;
  /** Part of `points` that came from achievement bonuses (FR-SCORE-5). */
  achievementPoints: number;
  /** 1-based; `null` for fired managers (R-5). */
  rank: number | null;
};

export type LeaderboardInput = {
  config: SeasonConfig;
  series: DailySeries;
  adjustments: Adjustment[];
  from: string;
  to: string;
  today: string;
  /** Achievement bonuses (FR-SCORE-5); ranking for achievements leaves them out (D-29). */
  bonuses?: PointEntry[];
};

/** Points closer than this are equal: fractional weights leave float noise (0.1 + 0.2 ≠ 0.3). */
const POINTS_EPS = 1e-9;

/**
 * Managers by points over [from, to], counting only days up to `today` — the same data the team
 * positions use (FR-LB-1). Equal points: metrics in order of falling weight, then the name, then
 * the id (FR-LB-5, D-16). Fired managers go last, without a rank (R-5).
 */
export function buildLeaderboard(input: LeaderboardInput): LeaderboardRow[] {
  const { config, series, from, to, today } = input;
  const until = to < today ? to : today;
  const weights = weightsOf(config);
  const sumBy = (entries: PointEntry[]) => {
    const sums = new Map<string, number>();
    for (const e of entries) sums.set(e.managerId, (sums.get(e.managerId) ?? 0) + e.value);
    return sums;
  };
  const corrections = sumBy(managerPointsBetween(input.adjustments, from, until));
  const achievements = sumBy(entriesBetween(input.bonuses ?? [], from, until));

  const rows: LeaderboardRow[] = config.managers.map((m) => {
    const totals = totalsBetween(series.get(m.id), from, until);
    const achievementPoints = achievements.get(m.id) ?? 0;
    return {
      managerId: m.id,
      fullName: m.fullName,
      teamId: teamOn(m, today),
      fired: isFiredOn(m, today),
      totals,
      points: pointsOf(totals, weights) + (corrections.get(m.id) ?? 0) + achievementPoints,
      achievementPoints,
      rank: null,
    };
  });

  const tieMetrics = [...config.metrics]
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .map((m) => m.id);
  const compare = (a: LeaderboardRow, b: LeaderboardRow): number => {
    if (Math.abs(b.points - a.points) > POINTS_EPS) return b.points - a.points;
    for (const metric of tieMetrics) {
      const diff = (b.totals[metric] ?? 0) - (a.totals[metric] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.fullName.localeCompare(b.fullName, 'ru') || a.managerId.localeCompare(b.managerId);
  };

  const ranked = rows
    .filter((r) => !r.fired)
    .sort(compare)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return [...ranked, ...rows.filter((r) => r.fired).sort(compare)];
}
