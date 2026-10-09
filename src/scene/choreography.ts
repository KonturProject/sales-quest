import { plural } from '../text.ts';

/**
 * Moves as a timed plan (FR-MOVE-1…4, D-23): when the positions change, the teams move one after
 * another — the camera flies to the figure, it hops cell by cell, «+N» rises above it, a pause —
 * and the camera returns to the overview. Pure: the scene plays the plan back on its ticker.
 */

export type TeamPosition = { teamId: string; position: number };

export type Timing = {
  /** Camera flight to the next team. */
  flyMs: number;
  /** One cell (FR-MOVE-1: 250–350 ms). */
  hopMs: number;
  /** A long walk (a reset, a big import) is sped up to fit this. */
  maxWalkMs: number;
  /** After a team's walk, before the next team. */
  pauseMs: number;
  /** Flight back to the whole track. */
  overviewMs: number;
};

export const TIMING: Timing = {
  flyMs: 900,
  hopMs: 300,
  maxWalkMs: 3000,
  pauseMs: 700,
  overviewMs: 1200,
};

export type Move = {
  teamId: string;
  from: number;
  to: number;
  start: number;
  hopMs: number;
  end: number;
  /** Forward through a checkpoint gate or onto the finish: the hero cheers after the walk (3b). */
  cheer: boolean;
};
export type ShotTarget = { kind: 'team'; teamId: string } | { kind: 'overview' };
export type Shot = { start: number; duration: number; target: ShotTarget };
export type Popup = { teamId: string; text: string; start: number; end: number };
export type Plan = { moves: Move[]; shots: Shot[]; popups: Popup[]; duration: number };

export const EMPTY_PLAN: Plan = { moves: [], shots: [], popups: [], duration: 0 };

/**
 * The plan from the positions before to the positions after, teams in the order of `after`.
 * No `before` (the page just opened): nothing to play — figures stand where they are (FR-MOVE-4).
 * `gates` — positions of the checkpoints and the finish: passing one forward makes a cheer.
 */
export function planMoves(
  before: TeamPosition[] | null,
  after: TeamPosition[],
  timing: Timing = TIMING,
  gates: readonly number[] = [],
): Plan {
  if (!before) return EMPTY_PLAN;
  const was = new Map(before.map((t) => [t.teamId, t.position]));
  const plan: Plan = { moves: [], shots: [], popups: [], duration: 0 };
  let t = 0;
  for (const { teamId, position: to } of after) {
    const from = was.get(teamId) ?? to; // a team new to the game simply appears
    if (from === to) continue;
    plan.shots.push({ start: t, duration: timing.flyMs, target: { kind: 'team', teamId } });
    t += timing.flyMs;
    const cells = Math.abs(to - from);
    const hopMs = Math.min(timing.hopMs, timing.maxWalkMs / cells);
    const walk = cells * hopMs;
    const cheer = gates.some((g) => from < g && g <= to);
    plan.moves.push({ teamId, from, to, start: t, hopMs, end: t + walk, cheer });
    plan.popups.push({
      teamId,
      text: `${to > from ? '+' : '−'}${cells} ${plural(cells, 'шаг', 'шага', 'шагов')}`, // FR-MOVE-1
      start: t,
      end: t + walk + timing.pauseMs,
    });
    t += walk + timing.pauseMs;
  }
  if (plan.moves.length > 0) {
    plan.shots.push({ start: t, duration: timing.overviewMs, target: { kind: 'overview' } });
    t += timing.overviewMs;
  }
  plan.duration = t;
  return plan;
}

/** Where a figure is at time `t`: between cell `a` and the next cell `b`, `f` of the hop done. */
export type Pose = { a: number; b: number; f: number };

/** The figure's pose at `t` of the plan; `rest` — its position when it does not move in the plan. */
export function poseAt(plan: Plan, teamId: string, t: number, rest: number): Pose {
  const move = plan.moves.find((m) => m.teamId === teamId);
  if (!move) return { a: rest, b: rest, f: 0 };
  if (t <= move.start) return { a: move.from, b: move.from, f: 0 };
  if (t >= move.end) return { a: move.to, b: move.to, f: 0 };
  const dir = move.to > move.from ? 1 : -1;
  const hops = (t - move.start) / move.hopMs;
  const k = Math.floor(hops);
  const a = move.from + dir * k;
  return { a, b: a + dir, f: hops - k };
}

/** The camera shot under way at `t` and its progress 0…1; null before the first and after the plan. */
export function shotAt(plan: Plan, t: number): { shot: Shot; progress: number } | null {
  if (t >= plan.duration) return null;
  let current: Shot | null = null;
  for (const shot of plan.shots) if (shot.start <= t) current = shot;
  if (!current) return null;
  return { shot: current, progress: Math.min(1, (t - current.start) / current.duration) };
}

/** Popups visible at `t`, with their age 0…1. */
export function popupsAt(plan: Plan, t: number): (Popup & { age: number })[] {
  return plan.popups
    .filter((p) => t >= p.start && t < p.end)
    .map((p) => ({ ...p, age: (t - p.start) / (p.end - p.start) }));
}
