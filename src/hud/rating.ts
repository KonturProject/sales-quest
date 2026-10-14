import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState, Unlock } from '../engine/gameState.ts';
import { isOnVacation, membersOn } from '../engine/roster.ts';
import type { Hero } from '../moments/heroes.ts';
import { plural } from '../text.ts';
import {
  honorBoard,
  honorPages,
  managerBadges,
  teamBadges,
  type Badge,
  type HonorRow,
} from './badges.ts';

/**
 * The rotating rating on the map (D-38): each team's operators with their share of the team's
 * points, then the overall top 10, then «Доска почёта» when somebody holds a rare achievement (D-58),
 * then «Герои дня» when somebody brought points today (D-56) — one slide every 15 s, round and round.
 */

export const SLIDE_MS = 15_000;
export const TOP = 10;

export type TeamRow = {
  managerId: string;
  name: string;
  points: number;
  share: number;
  /** Away on vacation today (D-54): a mark, the place is kept. */
  away: boolean;
  /** Rarity gems by the name (D-58). */
  badges: Badge[];
};
export type TeamSlide = {
  kind: 'team';
  teamId: string;
  title: string;
  color: string;
  teamPoints: number;
  rows: TeamRow[];
  /** Points of operators no longer in the team (fired, moved): they stay the team's (R-1, R-5). */
  others: number;
  /** The team's own achievements, under the heading (D-58). */
  badges: Badge[];
};
export type TopRow = {
  managerId: string;
  rank: number;
  name: string;
  teamId: string;
  points: number;
  /** Away on vacation today (D-54). */
  away: boolean;
  badges: Badge[];
};
export type TopSlide = { kind: 'top'; rows: TopRow[] };
/** «Доска почёта» (D-58): one page of the board — `page` of `pages`, counted from 1. */
export type HonorSlide = { kind: 'honor'; page: number; pages: number; rows: HonorRow[] };
export type HeroRow = Hero & { badges: Badge[] };
/** «Герои дня» (D-56): who brought most points since the end of yesterday. */
export type HeroesSlide = { kind: 'heroes'; rows: HeroRow[] };
export type Slide = TeamSlide | TopSlide | HonorSlide | HeroesSlide;

/** `unlocks` — the achievements on view: the HUD holds back a batch's new ones until its show is over (D-58). */
export function ratingSlides(
  game: GameState,
  config: SeasonConfig,
  heroes: Hero[] = [],
  unlocks: Unlock[] = game.unlocks,
): Slide[] {
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  const byTeam = new Map(game.teams.map((t) => [t.teamId, t]));
  // The ranking's rows know whether an operator is fired (R-5).
  const current = game.managers.filter((m) => !m.fired);
  const mine = managerBadges(unlocks, config.achievements);
  const ours = teamBadges(unlocks, config.achievements);
  const badgesOf = (managerId: string) => mine.get(managerId) ?? [];

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
          away: isOnVacation(m, game.today),
          badges: badgesOf(m.id),
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
      badges: ours.get(team.id) ?? [],
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
      away: m.onVacation,
      badges: badgesOf(m.managerId),
    })),
  });
  const pages = honorPages(honorBoard(unlocks, config.achievements, game.managers));
  pages.forEach((rows, i) =>
    slides.push({ kind: 'honor', page: i + 1, pages: pages.length, rows }),
  );
  if (heroes.length > 0)
    slides.push({
      kind: 'heroes',
      rows: heroes.map((h) => ({ ...h, badges: badgesOf(h.managerId) })),
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
