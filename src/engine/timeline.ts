import { addDays } from './dates.ts';
import { pacePosition } from './pace.ts';
import type { Prepared } from './prepare.ts';
import { computeTeamProgress, type TeamProgress } from './progress.ts';

export type TimelineDay = { date: string; pacePosition: number; teams: TeamProgress[] };

/** Team standings at the end of every completed working day (team achievements of plan 1b, replay). */
export function buildTimeline(prepared: Prepared, today: string): TimelineDay[] {
  return prepared.calendar.workingDays
    .filter((date) => date < today)
    .map((date) => ({
      date,
      pacePosition: pacePosition(prepared.calendar, prepared.track, addDays(date, 1)),
      teams: computeTeamProgress({ ...prepared, asOf: date }),
    }));
}
