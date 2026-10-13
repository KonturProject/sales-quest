import type { GameState } from '../engine/gameState.ts';

export type Hero = { managerId: string; name: string; teamId: string; points: number };

export const HEROES = 10;

/**
 * «Герои дня» (D-56): the points each operator brought since the end of yesterday — everything uploaded
 * today. `then` — the game as known at the end of yesterday; null — yesterday was before the game.
 * Less than half a point would read «+0» and is left out.
 */
export function heroesOf(now: GameState, then: GameState | null): Hero[] {
  const before = new Map((then?.managers ?? []).map((m) => [m.managerId, m.points]));
  return now.managers
    .map((m) => ({
      managerId: m.managerId,
      name: m.fullName,
      teamId: m.teamId,
      points: m.points - (before.get(m.managerId) ?? 0),
    }))
    .filter((h) => h.points >= 0.5)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ru'))
    .slice(0, HEROES);
}
