import type { SeasonConfig } from '../data/schemas/season.ts';
import type { Unlock } from '../engine/gameState.ts';
import { unlockKey, type Snapshot } from './snapshot.ts';

/** An operator who brought points (D-56). */
export type Gain = {
  managerId: string;
  teamId: string;
  points: number;
  /** The metrics that grew, by id. */
  metrics: Record<string, number>;
  /** Achievement points (FR-SCORE-5) that grew. */
  bonus: number;
};

export type MomentEvent =
  | {
      kind: 'team_points';
      teamId: string;
      from: number;
      to: number;
      cellsFrom: number;
      cellsTo: number;
    }
  | ({ kind: 'gain' } & Gain)
  | { kind: 'gate'; teamId: string; locationIndex: number }
  | { kind: 'overtake'; teamId: string; passed: string[] }
  | { kind: 'leader'; teamId: string }
  | { kind: 'finish'; teamId: string }
  | { kind: 'achievement'; unlock: Unlock };

const EPS = 1e-9;
const RARITY = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;

/**
 * Who overtook whom and who leads alone now (D-56, D-57) — only a team that moved forward: strictly ahead
 * of a team that was strictly ahead of it; the one team first now that was not alone first before.
 * Shared by the panels' events and the scene's fireworks.
 */
export function trackMoves(
  before: { teamId: string; position: number }[],
  after: { teamId: string; position: number }[],
): { overtakes: Map<string, string[]>; leader: string | null } {
  const was = new Map(before.map((t) => [t.teamId, t.position]));
  const moved = after.filter((t) => {
    const b = was.get(t.teamId);
    return b !== undefined && t.position > b;
  });
  const overtakes = new Map<string, string[]>();
  for (const t of moved) {
    const b = was.get(t.teamId) as number;
    const passed = after
      .filter((o) => {
        const ob = was.get(o.teamId);
        return o.teamId !== t.teamId && ob !== undefined && ob > b && t.position > o.position;
      })
      .map((o) => o.teamId);
    if (passed.length > 0) overtakes.set(t.teamId, passed);
  }
  const first = aloneFirst(after);
  const leader =
    first !== null && first !== aloneFirst(before) && moved.some((t) => t.teamId === first)
      ? first
      : null;
  return { overtakes, leader };
}

/**
 * The moments between what a screen showed and what it shows now (D-56), pure. Decreases are not
 * celebrated: a team's points still go «было → стало» (its card counts down), but nobody «brought» them,
 * and only a team that moved forward passes a gate, overtakes, leads or finishes. Another key (season,
 * track, weights) — no events at all. `unlocks` — the new state's (`GameState.unlocks`).
 */
export function diffMoments(
  before: Snapshot,
  after: Snapshot,
  unlocks: Unlock[],
  config: SeasonConfig,
): MomentEvent[] {
  if (before.key !== after.key) return [];
  const events: MomentEvent[] = [];
  const was = new Map(before.teams.map((t) => [t.teamId, t]));

  for (const t of after.teams) {
    const b = was.get(t.teamId);
    if (b && Math.abs(t.points - b.points) > EPS)
      events.push({
        kind: 'team_points',
        teamId: t.teamId,
        from: b.points,
        to: t.points,
        cellsFrom: b.position,
        cellsTo: t.position,
      });
  }

  const names = new Map(config.managers.map((m) => [m.id, m.fullName]));
  const wasManager = new Map(before.managers.map((m) => [m.managerId, m]));
  const gains: Gain[] = [];
  for (const m of after.managers) {
    const b = wasManager.get(m.managerId);
    const points = m.points - (b?.points ?? 0);
    if (points <= EPS) continue;
    const metrics: Record<string, number> = {};
    for (const [id, v] of Object.entries(m.totals)) {
      const grown = v - (b?.totals[id] ?? 0);
      if (grown > EPS) metrics[id] = grown;
    }
    const bonus = m.achievementPoints - (b?.achievementPoints ?? 0);
    gains.push({
      managerId: m.managerId,
      teamId: m.teamId,
      points,
      metrics,
      bonus: bonus > EPS ? bonus : 0,
    });
  }
  const name = (id: string) => names.get(id) ?? id;
  gains.sort(
    (a, b) => b.points - a.points || name(a.managerId).localeCompare(name(b.managerId), 'ru'),
  );
  for (const g of gains) events.push({ kind: 'gain', ...g });

  const moved = after.teams.flatMap((t) => {
    const b = was.get(t.teamId);
    return b && t.position > b.position ? [{ t, b }] : [];
  });
  const { overtakes, leader } = trackMoves(before.teams, after.teams);
  for (const { t, b } of moved) {
    if (t.locationIndex > b.locationIndex)
      events.push({ kind: 'gate', teamId: t.teamId, locationIndex: t.locationIndex });
    const passed = overtakes.get(t.teamId);
    if (passed) events.push({ kind: 'overtake', teamId: t.teamId, passed });
    if (b.position < after.trackLength && t.position >= after.trackLength)
      events.push({ kind: 'finish', teamId: t.teamId });
  }
  if (leader !== null) events.push({ kind: 'leader', teamId: leader });

  // By count per key: a recompute that moves an old unlock's date shows nothing again.
  const byKey = new Map<string, Unlock[]>();
  for (const u of unlocks) byKey.set(unlockKey(u), [...(byKey.get(unlockKey(u)) ?? []), u]);
  const fresh: Unlock[] = [];
  for (const [key, list] of byKey) {
    const extra = list.length - (before.unlocks[key] ?? 0);
    if (extra > 0)
      fresh.push(
        ...[...list].sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt)).slice(-extra),
      );
  }
  const rarity = new Map(config.achievements.map((a) => [a.id, RARITY[a.rarity]]));
  const rank = (u: Unlock) => rarity.get(u.achievementId) ?? Number.MAX_SAFE_INTEGER;
  fresh.sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt) || rank(a) - rank(b));
  for (const unlock of fresh) events.push({ kind: 'achievement', unlock });
  return events;
}

/** The one team alone in first place, or null (a tie). */
function aloneFirst(teams: { teamId: string; position: number }[]): string | null {
  const top = Math.max(...teams.map((t) => t.position));
  const first = teams.filter((t) => t.position === top);
  return first.length === 1 ? (first[0]?.teamId ?? null) : null;
}
