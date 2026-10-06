import type { SeasonConfig } from '../data/schemas/season.ts';
import { eachDate, isoWeekday } from './dates.ts';

export type Week = { index: number; start: string; end: string; workingDays: string[] };
export type Calendar = { start: string; end: string; workingDays: string[]; weeks: Week[] };

/**
 * Working days and weeks of a game (D-24). Working days: the explicit list, or Mon–Fri of the
 * period minus holidays. Weeks: calendar weeks Mon–Sun clipped to the period; weeks without a
 * working day are dropped.
 */
export function buildCalendar(
  config: Pick<SeasonConfig, 'period' | 'workingDays' | 'holidays'>,
): Calendar {
  const { start, end } = config.period;
  const holidays = new Set(config.holidays);
  const workingDays = config.workingDays
    ? [...new Set(config.workingDays)].filter((d) => d >= start && d <= end).sort()
    : eachDate(start, end).filter((d) => isoWeekday(d) <= 5 && !holidays.has(d));
  if (workingDays.length === 0) throw new Error(`в игре ${start}…${end} нет рабочих дней`);

  const working = new Set(workingDays);
  const spans: Week[] = [];
  for (const day of eachDate(start, end)) {
    const current = spans[spans.length - 1];
    if (!current || isoWeekday(day) === 1) {
      spans.push({ index: 0, start: day, end: day, workingDays: working.has(day) ? [day] : [] });
    } else {
      current.end = day;
      if (working.has(day)) current.workingDays.push(day);
    }
  }
  const weeks = spans
    .filter((w) => w.workingDays.length > 0)
    .map((w, i) => ({ ...w, index: i + 1 }));
  return { start, end, workingDays, weeks };
}

export function weekOf(calendar: Calendar, date: string): Week | undefined {
  return calendar.weeks.find((w) => date >= w.start && date <= w.end);
}

/** Working days strictly before `today` (D-18). */
export function completedWorkingDays(calendar: Calendar, today: string): number {
  return calendar.workingDays.filter((d) => d < today).length;
}
