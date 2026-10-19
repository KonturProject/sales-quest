import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { membersOn } from '../engine/roster.ts';
import type { GameState } from '../engine/gameState.ts';
import { HONOR_NAMES, managerBadges, type Badge } from '../hud/badges.ts';
import { plateName, shortName } from '../text.ts';

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

/** A step of the podium: every team of its place stands on it side by side. */
export type PodiumColumn = {
  place: number;
  /** The column left to right: the second place, the first, the third. */
  slot: number;
  /** The teams of the place, with their index in the podium (the ceremony reveals by it). */
  teams: { team: PodiumPlace; index: number }[];
};

/**
 * The podium laid out (D-60): three steps in the reading order 1, 2, 3, shown second–first–third; a tie stands
 * side by side on its step (two winners on one wide first step). An empty place keeps its step's column, so the
 * winners stay in the middle.
 */
export function podiumColumns(podium: PodiumPlace[]): PodiumColumn[] {
  return [1, 2, 3].map((place) => ({
    place,
    slot: place === 2 ? 0 : place === 1 ? 1 : 2,
    teams: podium.flatMap((team, index) => (team.place === place ? [{ team, index }] : [])),
  }));
}

/** «Лучший в команде»: who brought the team the most points. */
export type TeamBest = {
  teamId: string;
  /** The group's code from the exports («СР6»); empty when the team has none. */
  group: string;
  /** The team's leader — the figure's hero. */
  leader: string;
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
          group: team.sourceCode ?? '',
          leader: team.leaderName,
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

/** «Значимые достижения»: a legendary or epic achievement and who took it. */
export type Significant = {
  achievementId: string;
  title: string;
  rarity: 'legendary' | 'epic';
  /** Operators' short names or teams' titles, by the day taken, then the name. */
  holders: string[];
  /** Holders beyond them: «и ещё N». */
  more: number;
};

/** Rows on the results screen. */
export const SIGNIFICANT_ROWS = 6;

/**
 * The game's legendary, then epic, achievements somebody holds — of operators (still in the game, R-5) and of
 * teams; within a rarity the config's order (D-58's rule for the board, raised to epic and up).
 */
export function significantOf(game: GameState, config: SeasonConfig): Significant[] {
  const people = new Map(
    game.managers.filter((m) => !m.fired).map((m) => [m.managerId, m.fullName]),
  );
  const teams = new Map(config.teams.map((t) => [t.id, plateName(t.leaderName, t.sourceCode)]));
  type Holder = { day: string; full: string; shown: string; count: number };
  // Achievements of one title fold into one row (the three «Первопроходец», as D-58's team line).
  const rows = new Map<
    string,
    { row: Omit<Significant, 'holders' | 'more'>; order: number; holders: Map<string, Holder> }
  >();
  config.achievements.forEach((def, order) => {
    const { rarity } = def;
    if (!def.enabled || (rarity !== 'legendary' && rarity !== 'epic')) return;
    const group = rows.get(def.title) ?? {
      row: { achievementId: def.id, title: def.title, rarity },
      order,
      holders: new Map<string, Holder>(),
    };
    rows.set(def.title, group);
    for (const u of game.unlocks) {
      if (u.achievementId !== def.id) continue;
      const key = def.scope === 'manager' ? u.managerId : u.teamId;
      const full =
        key === undefined ? undefined : def.scope === 'manager' ? people.get(key) : teams.get(key);
      if (key === undefined || full === undefined) continue;
      const was = group.holders.get(key);
      group.holders.set(key, {
        day: was && was.day < u.unlockedAt ? was.day : u.unlockedAt,
        full,
        shown: def.scope === 'manager' ? shortName(full) : full,
        count: (was?.count ?? 0) + 1,
      });
    }
  });
  return [...rows.values()]
    .filter((g) => g.holders.size > 0)
    .sort((a, b) =>
      a.row.rarity === b.row.rarity ? a.order - b.order : a.row.rarity === 'legendary' ? -1 : 1,
    )
    .slice(0, SIGNIFICANT_ROWS)
    .map(({ row, holders }) => {
      const all = [...holders.values()].sort(
        (a, b) => a.day.localeCompare(b.day) || a.full.localeCompare(b.full, 'ru'),
      );
      return {
        ...row,
        holders: all
          .slice(0, HONOR_NAMES)
          .map((h) => (h.count > 1 ? `${h.shown} ×${String(h.count)}` : h.shown)),
        more: Math.max(0, all.length - HONOR_NAMES),
      };
    });
}

/** «Вместе за две недели»: the department's result. */
export type DepartmentTotals = {
  /** Every metric of the game, in the config's order, with its title. */
  metrics: { id: string; title: string; total: number }[];
  /** Achievements taken. */
  achievements: number;
  /** The teams' points over the teams' plans. */
  planShare: number;
};

/** «+3:» or «− 1 000:» — the minus U+2212 and the ru-RU group space (`\s` takes it). */
const SIGN = /^([+−-])([\d\s]+):/;

/**
 * The count behind the admin's «показатели за день» (D-53): points only, but the reason starts with the
 * code-written «<показатель> ±N:» and the value is N × weight. Anything else — null: never guessed.
 */
export function manualCount(
  adjustment: Adjustment,
  config: SeasonConfig,
): { metricId: string; count: number } | null {
  if (adjustment.type !== 'manager_points') return null;
  for (const metric of config.metrics) {
    const head = `${metric.title} `;
    if (!adjustment.reason.startsWith(head)) continue;
    const found = SIGN.exec(adjustment.reason.slice(head.length));
    if (!found) continue;
    const digits = (found[2] ?? '').replace(/\s/g, '');
    if (digits === '') continue;
    const count = (found[1] === '+' ? 1 : -1) * Number(digits);
    if (Math.abs(adjustment.value - count * metric.weight) < 1e-6)
      return { metricId: metric.id, count };
  }
  return null;
}

/** The department's result: every operator's metrics (the fired too), the manual counts, achievements, plan. */
export function departmentTotals(
  game: GameState,
  config: SeasonConfig,
  adjustments: Adjustment[],
): DepartmentTotals {
  const manual = new Map<string, number>();
  for (const a of adjustments) {
    const found = manualCount(a, config);
    if (found) manual.set(found.metricId, (manual.get(found.metricId) ?? 0) + found.count);
  }
  const plan = game.teams.reduce((s, t) => s + t.targetPoints, 0);
  return {
    metrics: [...config.metrics]
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        id: m.id,
        title: m.title,
        total:
          game.managers.reduce((s, x) => s + (x.totals[m.id] ?? 0), 0) + (manual.get(m.id) ?? 0),
      })),
    achievements: game.unlocks.length,
    planShare: plan > 0 ? game.teams.reduce((s, t) => s + t.points, 0) / plan : 0,
  };
}

/** Everything the finale shows. */
export type Finale = {
  /** The closing this finale belongs to: a browser plays its ceremony once (D-59). */
  closedAt: string;
  podium: PodiumPlace[];
  best: TeamBest[];
  top: TopOperator[];
  significant: Significant[];
  totals: DepartmentTotals;
};

/** The finale of a closed game; null while it runs (or closed without the moment of closing). */
export function finaleOf(
  game: GameState,
  config: SeasonConfig,
  adjustments: Adjustment[],
): Finale | null {
  if (config.status !== 'closed' || config.closedAt === undefined) return null;
  return {
    closedAt: config.closedAt,
    podium: podiumOf(game, config),
    best: bestInTeams(game, config),
    top: topOperators(game, config),
    significant: significantOf(game, config),
    totals: departmentTotals(game, config, adjustments),
  };
}

/**
 * The finale for the screen: whatever goes wrong in it is no finale — the map and its HUD as usual — never an
 * error page on every screen (the extras never cost the map, as D-56's moments).
 */
export function finaleOrNull(
  game: GameState,
  config: SeasonConfig,
  adjustments: Adjustment[],
): Finale | null {
  try {
    return finaleOf(game, config, adjustments);
  } catch {
    return null;
  }
}
