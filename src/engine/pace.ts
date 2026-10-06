import { completedWorkingDays, type Calendar } from './calendar.ts';
import type { Track } from './track.ts';

const EPS = 1e-9;

/** Where a team exactly on plan stands after the completed working days (FR-PACE-1, D-18). */
export function pacePosition(calendar: Calendar, track: Track, today: string): number {
  const done = completedWorkingDays(calendar, today);
  return Math.floor((done / calendar.workingDays.length) * track.trackLength + EPS);
}
