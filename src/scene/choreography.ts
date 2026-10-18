import { trackMoves } from '../moments/events.ts';
import { plural } from '../text.ts';

/**
 * Moves as a timed plan (FR-MOVE-1…4, D-23): when the positions change, the teams move one after
 * another — the camera flies to the figure, it hops cell by cell, «+N» rises above it, a pause —
 * and the camera returns to the overview. Pure: the scene plays the plan back on its ticker.
 */

export type TeamPosition = { teamId: string; position: number; points?: number };

export type Timing = {
  /** Camera flight to the next team. */
  flyMs: number;
  /** One cell (FR-MOVE-1: 250–350 ms). */
  hopMs: number;
  /** A long walk (a reset, a big import) is sped up to fit this. */
  maxWalkMs: number;
  /** After a team's walk, before the next team. */
  pauseMs: number;
  /** The pause after a gate: the hero's cheer, seen to its end (review 3b). */
  cheerMs: number;
  /** Flight back to the whole track. */
  overviewMs: number;
  /** The figure's jump at the start of a points beat (D-57). */
  jumpMs: number;
  /** «+N баллов» runs from +0 to N this long; the walk, if any, follows. */
  countMs: number;
};

export const TIMING: Timing = {
  flyMs: 900,
  hopMs: 300,
  maxWalkMs: 3000,
  pauseMs: 700,
  cheerMs: 1700,
  overviewMs: 1200,
  jumpMs: 700,
  countMs: 1200,
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
export type Jump = { teamId: string; start: number; end: number };
export type BurstKind = 'gate' | 'overtake' | 'leader' | 'finish';
/** A firework over a figure at the end of its walk (D-57): the most notable of its moments. */
export type Burst = { teamId: string; kind: BurstKind; start: number };
export type Popup = {
  teamId: string;
  text: string;
  start: number;
  end: number;
  /** A counting popup: «+0 баллов» … «+N баллов» over `ms` from its start. */
  count?: { points: number; ms: number };
};
export type Plan = {
  moves: Move[];
  shots: Shot[];
  popups: Popup[];
  jumps: Jump[];
  bursts: Burst[];
  duration: number;
};

export const EMPTY_PLAN: Plan = {
  moves: [],
  shots: [],
  popups: [],
  jumps: [],
  bursts: [],
  duration: 0,
};

/** The counter's text changes at most this often (a texture is redrawn per change, D-57). */
export const COUNT_FPS = 15;
const RANK: Record<BurstKind, number> = { finish: 4, leader: 3, gate: 2, overtake: 1 };
const pointsText = (n: number) => `+${n} ${plural(n, 'балл', 'балла', 'баллов')}`;

/** Fireworks on request (D-59): the teams of a celebration fire one after another, this far apart. */
export const CELEBRATION_STAGGER_MS = 250;

/** A celebration's bursts from `start` on: one per team, staggered (the finale's fireworks, D-59). */
export function celebrationBursts(teamIds: string[], kind: BurstKind, start: number): Burst[] {
  return teamIds.map((teamId, i) => ({ teamId, kind, start: start + i * CELEBRATION_STAGGER_MS }));
}

/** How long a burst of each kind lives (D-57): the finish fires three waves, the leader two. */
export const BURST_MS: Record<BurstKind, number> = {
  overtake: 1300,
  gate: 1600,
  leader: 2350,
  finish: 3500,
};

/**
 * The plan from the positions before to the positions after, teams in the order of `after` (D-23, D-57).
 * A team gets a beat when its points grew by a point or more (the camera flies to it, the figure jumps,
 * «+N баллов» runs) and/or its cell changed (the walk with «+N шагов»). The end of a forward walk may
 * fire a burst: the finish, a new leader, a gate, an overtake — the most notable. No `before` (the page
 * just opened): nothing to play (FR-MOVE-4). Cells without points plan as before D-57.
 */
export function planMoves(
  before: TeamPosition[] | null,
  after: TeamPosition[],
  timing: Timing = TIMING,
  gates: readonly number[] = [],
  finish?: number,
): Plan {
  if (!before) return EMPTY_PLAN;
  const was = new Map(before.map((t) => [t.teamId, t]));
  const { overtakes, leader } = trackMoves(before, after);
  const plan: Plan = { moves: [], shots: [], popups: [], jumps: [], bursts: [], duration: 0 };
  let t = 0;
  for (const { teamId, position: to, points } of after) {
    const b = was.get(teamId);
    const from = b?.position ?? to; // a team new to the game simply appears
    const gained =
      points !== undefined && b?.points !== undefined ? Math.round(points - b.points) : 0;
    const gain = gained >= 1 ? gained : 0;
    if (from === to && gain === 0) continue;
    plan.shots.push({ start: t, duration: timing.flyMs, target: { kind: 'team', teamId } });
    t += timing.flyMs;
    if (gain > 0) {
      plan.jumps.push({ teamId, start: t, end: t + timing.jumpMs });
      plan.popups.push({
        teamId,
        text: pointsText(gain),
        start: t,
        end: t + timing.countMs + (from === to ? timing.pauseMs : 0),
        // The number runs over three quarters of the beat and holds its result (review D-57).
        count: { points: gain, ms: Math.round(timing.countMs * 0.75) },
      });
      t += timing.countMs;
    }
    if (from === to) {
      t += timing.pauseMs;
      continue;
    }
    const cells = Math.abs(to - from);
    const hopMs = Math.min(timing.hopMs, timing.maxWalkMs / cells);
    const walk = cells * hopMs;
    const cheer = gates.some((g) => from < g && g <= to);
    const pause = cheer ? Math.max(timing.pauseMs, timing.cheerMs) : timing.pauseMs;
    plan.moves.push({ teamId, from, to, start: t, hopMs, end: t + walk, cheer });
    plan.popups.push({
      teamId,
      text: `${to > from ? '+' : '−'}${cells} ${plural(cells, 'шаг', 'шага', 'шагов')}`, // FR-MOVE-1
      start: t,
      end: t + walk + pause,
    });
    const kinds: BurstKind[] = [];
    if (finish !== undefined && from < finish && finish <= to) kinds.push('finish');
    if (leader === teamId) kinds.push('leader');
    if (cheer) kinds.push('gate');
    if (overtakes.has(teamId)) kinds.push('overtake');
    const kind = kinds.sort((x, y) => RANK[y] - RANK[x])[0];
    if (kind) plan.bursts.push({ teamId, kind, start: t + walk });
    t += walk + pause;
  }
  if (plan.shots.length > 0) {
    plan.shots.push({ start: t, duration: timing.overviewMs, target: { kind: 'overview' } });
    t += timing.overviewMs;
  }
  // The plan lasts while its last burst lives: a leader's or a finisher's sparks never hang in the air
  // after the tour (review D-57); the overview shot holds at its end meanwhile.
  plan.duration = Math.max(t, ...plan.bursts.map((b) => b.start + BURST_MS[b.kind]));
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

/**
 * Popups visible at `t`, with their age 0…1 and their text then: a counting popup runs from +0 to its
 * points, easing out, its text changing at most `COUNT_FPS` times a second; `still` (reduced motion) —
 * the result at once.
 */
export function popupsAt(plan: Plan, t: number, still = false): (Popup & { age: number })[] {
  return plan.popups
    .filter((p) => t >= p.start && t < p.end)
    .map((p) => {
      const age = (t - p.start) / (p.end - p.start);
      if (!p.count || still) return { ...p, age };
      const step = 1000 / COUNT_FPS;
      const ms = Math.floor((t - p.start) / step) * step;
      const f = Math.min(1, ms / p.count.ms);
      const n = Math.round(p.count.points * (1 - (1 - f) ** 3));
      return { ...p, age, text: pointsText(n) };
    });
}

/** How high a figure is in its jump at `t`: 0 → 1 → 0 over the jump, 0 outside it. */
export function jumpAt(plan: Plan, teamId: string, t: number): number {
  const jump = plan.jumps.find((j) => j.teamId === teamId && t >= j.start && t < j.end);
  return jump ? Math.sin((Math.PI * (t - jump.start)) / (jump.end - jump.start)) : 0;
}

/** The bursts alive at `t`, with their age in ms. */
export function burstsAt(plan: Plan, t: number): (Burst & { age: number })[] {
  return plan.bursts
    .filter((b) => t >= b.start && t < b.start + BURST_MS[b.kind])
    .map((b) => ({ ...b, age: t - b.start }));
}

/**
 * How opaque a popup is (D-57): «+N шагов» fades over the last fifth of its time; a counting popup does
 * not — its result stays bright until the walk's popup replaces it (review D-57).
 */
export function popupAlpha(popup: Popup & { age: number }): number {
  if (popup.count) return 1;
  return popup.age > 0.8 ? Math.max(0, (1 - popup.age) / 0.2) : 1;
}
