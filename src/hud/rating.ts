import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';

/**
 * The rotating rating on the map (D-38): each team's operators with their share of the team's
 * points, then the overall top 10 — one slide every 15 s, round and round.
 */

export const SLIDE_MS = 15_000;
export const TOP = 10;

export type TeamRow = { managerId: string; name: string; points: number; share: number };
export type TeamSlide = {
  kind: 'team';
  teamId: string;
  title: string;
  color: string;
  teamPoints: number;
  rows: TeamRow[];
  /** Points of operators no longer in the team (fired, moved): they stay the team's (R-1, R-5). */
  others: number;
};
export type TopRow = {
  managerId: string;
  rank: number;
  name: string;
  teamId: string;
  points: number;
};
export type TopSlide = { kind: 'top'; rows: TopRow[] };
export type Slide = TeamSlide | TopSlide;

export function ratingSlides(game: GameState, config: SeasonConfig): Slide[] {
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  const byTeam = new Map(game.teams.map((t) => [t.teamId, t]));
  // The ranking's rows know each operator's current team and whether they are fired (R-5).
  const current = game.managers.filter((m) => !m.fired);

  const slides: Slide[] = teams.map((team) => {
    const teamPoints = byTeam.get(team.id)?.points ?? 0;
    const earned = new Map(
      game.contributions.filter((c) => c.teamId === team.id).map((c) => [c.managerId, c.points]),
    );
    const rows = current
      .filter((m) => m.teamId === team.id)
      .map((m) => {
        const points = earned.get(m.managerId) ?? 0;
        return {
          managerId: m.managerId,
          name: m.fullName,
          points,
          share: teamPoints > 0 ? points / teamPoints : 0,
        };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ru'));
    const listed = rows.reduce((s, r) => s + r.points, 0);
    return {
      kind: 'team',
      teamId: team.id,
      title: team.leaderName,
      color: team.color,
      teamPoints,
      rows,
      others: Math.max(0, teamPoints - listed),
    };
  });

  slides.push({
    kind: 'top',
    rows: current.slice(0, TOP).map((m) => ({
      managerId: m.managerId,
      rank: m.rank ?? 0,
      name: m.fullName,
      teamId: m.teamId,
      points: m.points,
    })),
  });
  return slides;
}

/** «клетка / клетки / клеток» and the like. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** «впереди темпа на 2 клетки» / «отстаёт на 1 клетку» / «идёт в темпе» (FR-PACE-3). */
export function paceText(delta: number): string {
  if (delta === 0) return 'идёт в темпе';
  const cells = `${Math.abs(delta)} ${plural(Math.abs(delta), 'клетку', 'клетки', 'клеток')}`;
  return delta > 0 ? `впереди темпа на ${cells}` : `отстаёт на ${cells}`;
}

/** `14.10 09:00` from a local timestamp (D-11). */
export function shortTime(ts: string | null): string {
  return ts ? `${ts.slice(8, 10)}.${ts.slice(5, 7)} ${ts.slice(11, 16)}` : '—';
}
