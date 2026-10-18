import type { SeasonConfig } from '../data/schemas/season.ts';
import { membersOn } from '../engine/roster.ts';
import type { GameState } from '../engine/gameState.ts';
import { managerBadges, type Badge } from '../hud/badges.ts';
import { plateName } from '../text.ts';

/**
 * The finale of the game (D-59): what the ceremony and the results screen show, from the game as it stands —
 * pure, so a correction after the closing changes the results at once.
 */

const EPS = 1e-9;

/** A place on the podium: `place` is shared by an exact tie (1, 1, 3). */
export type PodiumPlace = {
  place: number;
  teamId: string;
  /** «СР6 • Имя Фамилия» — the group before the leader, as over the hero. */
  title: string;
  color: string;
  /** The cell the figure stands on. */
  position: number;
  /** The share of the plan. */
  progress: number;
};

/**
 * The top 3 teams «by speed»: by the cell the figure stands on — what everyone sees, with the admin's steps
 * and resets — then by the share of the plan; only an exact tie of both shares a place.
 */
export function podiumOf(game: GameState, config: SeasonConfig): PodiumPlace[] {
  const teams = new Map(config.teams.map((t) => [t.id, t]));
  const order = (id: string) => teams.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  const ranked = [...game.teams].sort(
    (a, b) =>
      b.position - a.position || b.progress - a.progress || order(a.teamId) - order(b.teamId),
  );
  const places: PodiumPlace[] = [];
  ranked.forEach((t, i) => {
    const before = ranked[i - 1];
    const tied =
      before !== undefined &&
      before.position === t.position &&
      Math.abs(before.progress - t.progress) < EPS;
    const team = teams.get(t.teamId);
    places.push({
      place: tied ? (places[i - 1]?.place ?? i + 1) : i + 1,
      teamId: t.teamId,
      title: team ? plateName(team.leaderName, team.sourceCode) : t.teamId,
      color: team?.color ?? '#888888',
      position: t.position,
      progress: t.progress,
    });
  });
  return places.filter((p) => p.place <= 3);
}

/** «Лучший в команде»: who brought the team the most points. */
export type TeamBest = {
  teamId: string;
  teamTitle: string;
  color: string;
  managerId: string;
  name: string;
  points: number;
};

/**
 * Each team's hero, in the teams' order: among the team's members on the game's day (as its rating slide
 * lists them, D-38 — not fired, vacationers kept), the most points brought to this team; a tie — by name.
 * A team nobody brought points gets no card (no «0» hero).
 */
export function bestInTeams(game: GameState, config: SeasonConfig): TeamBest[] {
  const brought = new Map(game.contributions.map((c) => [`${c.teamId}|${c.managerId}`, c.points]));
  return [...config.teams]
    .sort((a, b) => a.order - b.order)
    .flatMap((team) => {
      const best = membersOn(config.managers, team.id, game.today)
        .map((m) => ({ m, points: brought.get(`${team.id}|${m.id}`) ?? 0 }))
        .sort((a, b) => b.points - a.points || a.m.fullName.localeCompare(b.m.fullName, 'ru'))[0];
      if (!best || best.points < 0.5) return [];
      return [
        {
          teamId: team.id,
          teamTitle: plateName(team.leaderName, team.sourceCode),
          color: team.color,
          managerId: best.m.id,
          name: best.m.fullName,
          points: best.points,
        },
      ];
    });
}

/** «Лучшие из лучших»: an operator of the game's top. */
export type TopOperator = {
  rank: number;
  managerId: string;
  name: string;
  teamId: string;
  points: number;
  badges: Badge[];
};

/** The leaderboard's first `n` (FR-LB-5 ties; the fired have no rank, R-5), with their gems (D-58). */
export function topOperators(game: GameState, config: SeasonConfig, n = 3): TopOperator[] {
  const badges = managerBadges(game.unlocks, config.achievements);
  return game.managers
    .flatMap((m) => (m.rank === null ? [] : [{ m, rank: m.rank }]))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, n)
    .map(({ m, rank }) => ({
      rank,
      managerId: m.managerId,
      name: m.fullName,
      teamId: m.teamId,
      points: m.points,
      badges: badges.get(m.managerId) ?? [],
    }));
}
