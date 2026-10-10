import type { Track } from '../engine/track.ts';

/**
 * The mini-map of the HUD (GFX-5): the whole track as one strip — the four locations and the cells
 * beyond the plan, a marker per team, its pace tick, the camera's window. Shares of the strip
 * 0…1 from the start to the last cell beyond the plan. Pure.
 */

export type Band = { index: number; title: string; color: string | null; from: number; to: number };
export type Marker = {
  teamId: string;
  name: string;
  color: string;
  position: number;
  at: number;
  /** The n-th team on the same cell: its marker steps aside. */
  stack: number;
};
export type MiniMap = {
  bands: Band[];
  finish: number;
  markers: Marker[];
  paces: { teamId: string; color: string; at: number }[];
};

export function minimapModel(input: {
  track: Pick<Track, 'cellsPerLocation' | 'trackLength' | 'maxPosition' | 'locations'>;
  teams: { id: string; color: string; leaderName: string; order: number }[];
  states: { teamId: string; position: number; pacePosition: number }[];
  colorOf: (themePackId: string) => string;
}): MiniMap {
  const { track } = input;
  const share = (p: number) => Math.min(Math.max(p, 0), track.maxPosition) / track.maxPosition;
  const bands: Band[] = track.locations.map((l) => ({
    index: l.index,
    title: l.title,
    color: input.colorOf(l.themePackId),
    from: share((l.index - 1) * track.cellsPerLocation),
    to: share(l.index * track.cellsPerLocation),
  }));
  if (track.maxPosition > track.trackLength)
    bands.push({
      index: bands.length + 1,
      title: 'Сверх плана',
      color: null,
      from: share(track.trackLength),
      to: 1,
    });
  const state = new Map(input.states.map((s) => [s.teamId, s]));
  const ordered = [...input.teams].sort((a, b) => a.order - b.order);
  const onCell = new Map<number, number>();
  const markers: Marker[] = [];
  for (const team of ordered) {
    const s = state.get(team.id);
    if (!s) continue;
    const cell = Math.min(Math.max(Math.round(s.position), 0), track.maxPosition);
    const stack = onCell.get(cell) ?? 0;
    onCell.set(cell, stack + 1);
    markers.push({
      teamId: team.id,
      name: team.leaderName,
      color: team.color,
      position: s.position,
      at: share(s.position),
      stack,
    });
  }
  const paces = ordered.flatMap((team) => {
    const s = state.get(team.id);
    return s ? [{ teamId: team.id, color: team.color, at: share(s.pacePosition) }] : [];
  });
  return { bands, finish: share(track.trackLength), markers, paces };
}

/** The camera's window on the track as shares of the strip; null — unknown (the 2D scheme). */
export function spanFraction(
  span: { from: number; to: number } | null,
  maxPosition: number,
): { from: number; to: number } | null {
  if (!span) return null;
  const share = (p: number) => Math.min(Math.max(p, 0), maxPosition) / maxPosition;
  return { from: share(span.from), to: share(span.to) };
}
