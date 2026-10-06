import { addDays } from './dates.ts';
import { teamPacePosition } from './pace.ts';
import type { Prepared } from './prepare.ts';
import { computeTeamProgress, type TeamProgress } from './progress.ts';

export type TimelineTeam = TeamProgress & { pacePosition: number };
export type TimelineDay = { date: string; teams: TimelineTeam[] };

/** Team standings and pace at the end of every completed working day (team achievements of plan 1b, replay). */
export function buildTimeline(prepared: Prepared, today: string): TimelineDay[] {
  const { config, calendar, track } = prepared;
  return calendar.workingDays
    .filter((date) => date < today)
    .map((date) => ({
      date,
      teams: computeTeamProgress({ ...prepared, asOf: date }).map((t) => ({
        ...t,
        // The pace at the end of `date`: every working day up to and including it is done.
        pacePosition: teamPacePosition(t.teamId, config, calendar, track, addDays(date, 1)),
      })),
    }));
}
