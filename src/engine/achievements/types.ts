import type { AchievementRule } from '../../data/schemas/achievements.ts';
import type { SeasonConfig } from '../../data/schemas/season.ts';
import type { Calendar } from '../calendar.ts';
import type { LeaderboardRow } from '../leaderboard.ts';
import type { MetricValues } from '../scoring.ts';
import type { TimelineDay } from '../timeline.ts';
import type { Track } from '../track.ts';

/** In rules, `points` means the manager's points (weights + corrections), not a metric (D-30). */
export const POINTS = 'points';

/** An achievement earned (ACH-1). */
export type Unlock = {
  achievementId: string;
  managerId?: string;
  teamId?: string;
  /** The day of the data on which the condition was met; for a manual grant — the day of the grant. */
  unlockedAt: string;
  /** Game week of `unlockedAt` (D-24), when it falls into one. */
  week?: number;
  source: 'auto' | 'manual';
};

/** A manager's day with data inside the game, up to today; points without achievement bonuses (D-29). */
export type ManagerDay = { date: string; values: MetricValues; points: number };

/** What a rule found: who met the condition, and the day of the data it was met on. */
export type Candidate = { managerId?: string; teamId?: string; date: string };

export type RuleContext = {
  config: SeasonConfig;
  calendar: Calendar;
  track: Track;
  today: string;
  /** managerId → days with data, in date order (every manager of the config has an entry). */
  days: Map<string, ManagerDay[]>;
  /** Team standings at the end of every completed working day; empty while manager rules run. */
  timeline: TimelineDay[];
  /** Leaderboard of a finished game week (by index) or of the finished game; null while it runs. */
  board: (period: number | 'season') => LeaderboardRow[] | null;
  /** Whether a manager may still earn achievements on a date (R-5). */
  eligible: (managerId: string, date: string) => boolean;
};

export type AutoRule = Exclude<AchievementRule, { type: 'manual' }>;
export type RuleOf<T extends AutoRule['type']> = Extract<AutoRule, { type: T }>;
export type RuleHandler<T extends AutoRule['type']> = (
  rule: RuleOf<T>,
  ctx: RuleContext,
) => Candidate[];
