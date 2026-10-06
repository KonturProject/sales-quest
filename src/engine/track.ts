import type { SeasonConfig } from '../data/schemas/season.ts';

export type TrackLocation = {
  index: number;
  title: string;
  themePackId: string;
  firstCell: number;
  lastCell: number;
};

export type Track = {
  cellsPerLocation: number;
  /** The finish: 100 % of the plan. */
  trackLength: number;
  overflowCells: number;
  maxPosition: number;
  locations: TrackLocation[];
};

/**
 * Track geometry from the game's length (D-24): N cells per working day, rounded up so the four
 * locations are equal. Position 0 is the start before the first cell; cell `trackLength` is the
 * finish; the overflow zone after it holds the teams beyond the plan.
 */
export function buildTrack(
  config: Pick<SeasonConfig, 'track' | 'locations'>,
  workingDayCount: number,
): Track {
  const cellsPerLocation = Math.max(
    1,
    Math.ceil((config.track.cellsPerWorkingDay * workingDayCount) / 4),
  );
  const trackLength = 4 * cellsPerLocation;
  const overflowCells = Math.ceil((trackLength * config.track.overflowPct) / 100);
  const locations = [...config.locations]
    .sort((a, b) => a.index - b.index)
    .map((l) => ({
      index: l.index,
      title: l.title,
      themePackId: l.themePackId,
      firstCell: (l.index - 1) * cellsPerLocation + 1,
      lastCell: l.index * cellsPerLocation,
    }));
  return {
    cellsPerLocation,
    trackLength,
    overflowCells,
    maxPosition: trackLength + overflowCells,
    locations,
  };
}

/** Location (1–4) of a position: the start counts as location 1, the overflow zone as 4. */
export function locationIndexOf(track: Track, position: number): number {
  if (position <= 0) return 1;
  return Math.min(4, Math.ceil(position / track.cellsPerLocation));
}
