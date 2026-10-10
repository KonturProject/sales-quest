import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { membersOn } from '../engine/roster.ts';
import { plural } from '../text.ts';

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
  // The ranking's rows know whether an operator is fired (R-5).
  const current = game.managers.filter((m) => !m.fired);

  const slides: Slide[] = teams.map((team) => {
    const teamPoints = byTeam.get(team.id)?.points ?? 0;
    const earned = new Map(
      game.contributions.filter((c) => c.teamId === team.id).map((c) => [c.managerId, c.points]),
    );
    // The team today by the same rule as the card's headcount (review 3a).
    const rows = membersOn(config.managers, team.id, game.today)
      .map((m) => {
        const points = earned.get(m.id) ?? 0;
        return {
          managerId: m.id,
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
      // Below half a point it is float noise of fractional weights, not someone's points.
      others: teamPoints - listed >= 0.5 ? teamPoints - listed : 0,
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

export { plural };

/** «впереди темпа на 2 клетки» / «отстаёт на 1 клетку» / «идёт в темпе» (FR-PACE-3). */
export function paceText(delta: number): string {
  if (delta === 0) return 'идёт в темпе';
  const cells = `${Math.abs(delta)} ${plural(Math.abs(delta), 'клетку', 'клетки', 'клеток')}`;
  return delta > 0 ? `впереди темпа на ${cells}` : `отстаёт на ${cells}`;
}

/** The colour of a team's pace line (D-46): ahead, behind or on the pace. */
export function paceTone(delta: number): 'up' | 'down' | 'even' {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'even';
}

/** The filled part of a card's progress bar (D-46): the share of the plan, within 0…1. */
export function barShare(progress: number): number {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}

/** «604 балла» — rounded, grouped the Russian way. */
export function pointsText(points: number): string {
  const n = Math.round(points);
  return `${n.toLocaleString('ru-RU')} ${plural(n, 'балл', 'балла', 'баллов')}`;
}

/** `14.10 09:00` from a local timestamp (D-11). */
export function shortTime(ts: string | null): string {
  return ts ? `${ts.slice(8, 10)}.${ts.slice(5, 7)} ${ts.slice(11, 16)}` : '—';
}
