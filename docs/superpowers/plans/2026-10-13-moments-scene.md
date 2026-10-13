# The scene of the moments: the jump, the counter, fireworks — Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process: executing-plans
> with a ledger and TDD), an independent review subagent (opus) checks the whole plan at the end (Task 7).
> Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md`;
> before any edit of the scene — NAVIGATOR §8–§10 and the perf rules of `CLAUDE.md`.

**Goal:** the tour of a portion gives every team its moment on the map: the camera flies to the figure, the
figure jumps up while «+12 баллов» runs over it, then walks its steps as now; gates, overtakes, a new leader
and the finish get fireworks — in 3D and in the 2D scheme.

**Architecture:** the pure choreography (`src/scene/choreography.ts`, D-23) gets the teams' points with their
cells and plans a beat for every team whose points grew or whose cell changed: a jump with a counting popup,
the walk, a burst of the most notable kind (rules shared with `src/moments/events.ts`). The scene draws the
jump and a live counter label per figure (`labels.ts`) and the bursts as one pool of ≤ 200 points
(`fireworks.ts` pure, `Fireworks.tsx`); the scheme draws the jump and the sparks by CSS animations played once.
The HUD's story (D-56) waits for the whole tour, as it waits for a walk now (`moving.ts`).

**Tech stack:** React 19, three.js via @react-three/fiber (render on demand, the scene's ticker), SVG + CSS
for the scheme, Vitest, Playwright 1.63 (QA-4 with CPU ×4, QA-6).

**Spec:** `docs/superpowers/specs/2026-10-13-engagement-moments-design.md`, Part B (approved 13.10.2026);
D-56 as built (the story waits for the walk); SPEC FR-MOVE-1…3, GFX, PERF-1, PERF-9, §12.1, §4 (a firework at
the finish); DECISIONS D-23, D-45, D-47, D-48.

**Refinements of the spec made here:**
- **One burst per beat**, of the most notable kind: finish > new leader > gate > overtake.
- **Admin steps forward are celebrated like any move:** the scene does not know why a figure moved, and it
  already cheers at a gate for an admin's steps (BACKLOG D-56 asked to decide this here).
- **The points beat** lasts `countMs` (scene 1.2 s, scheme 1 s); the jump takes its first `jumpMs` (0.7 s /
  0.5 s); with steps, the walk follows the count. Points shown are rounded; a gain below one point is no beat.
- **The counter's text** changes at most 15 times a second (the plan's time is quantized for it); one live
  texture per figure is redrawn — no texture per number.
- **A daytime portion without steps** now has a tour too (jumps and counters), and the panels' story (D-56)
  follows it — «сначала ход, потом его история».

## Global Constraints

- PERF-1: render on demand — frames only while the tour plays (the ticker's `play`); no endless loops; the
  fireworks are drawn only while a burst lives (`visible = false` otherwise).
- PERF-9: no post-processing, no physics, no shadows; additive points without sorting; at most **200**
  particles in **one** draw call; on the lower steps of the quality ladder (no ambient, D-45) — **half**.
- QA-4 at ×4 on this PC: ≥ 28 fps during moves, within §12.1 (calls ≤ 120, triangles ≤ 80 000) — for the
  base test and for «QA-4 with moments».
- `prefers-reduced-motion: reduce`: no fireworks, no jump animation in 2D; the counter shows the result.
- The choreography stays pure (no three.js, no DOM); old callers that pass cells without points get exactly
  today's plan.
- No real names in the repo; tests use builders and the demo.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved, the push
  only after the author's «да» (D-3).

## Review Focus

1. **Points that grew while the cells stayed the same** (a daytime portion) — a beat with a jump and a
   counter, a new plan even though the positions are equal — Task 2 test «equal cells, more points: a new plan».
2. **Data without points** (the old snapshot of D-56, the tests of the choreography) — today's plan exactly —
   Task 1 test «cells without points: no points beats».
3. **Many teams at once with a finish and a leader** — never more than 200 sparks, one draw call — Task 3 test
   «the pool never overflows».
4. **A hidden tab or a frozen scene mid-burst** — the burst resumes with the plan's clock, nothing piles up —
   Task 3 test «a burst is a function of its age».
5. **Reduced motion** — no sparks in 3D and 2D, the counter shows the final number — Task 1 test «still: the
   final number at once» and Task 5 e2e step.

---

### Task 1: The beats of the tour (pure choreography)

**Где смотреть:** спецификация B1, B2; `src/scene/choreography.ts` (`planMoves`, `Timing`, `Popup`,
`popupsAt`, `poseAt`), `src/moments/events.ts` (правила обгона и лидера — вынести общими),
`src/moments/tracker.ts` (`Moments.before`), `src/scene/layout.ts` (финиш — позиция `trackLength`); тесты
`tests/unit/scene/choreography.test.ts`, `tests/unit/moments/events.test.ts`.

**Files:**
- Modify: `src/moments/events.ts` (export `trackMoves`), `src/moments/tracker.ts` (`before` with points),
  `src/scene/choreography.ts`, `src/scheme/geometry.ts` (`SCHEME_TIMING`)
- Test: `tests/unit/scene/choreography.test.ts`, `tests/unit/moments/events.test.ts`,
  `tests/unit/moments/tracker.test.ts`

**Interfaces:**
- Produces:
  - `trackMoves(before: {teamId; position}[], after: {teamId; position}[]): { overtakes: Map<string,
    string[]>; leader: string | null }` (`src/moments/events.ts`);
  - `TeamPosition = { teamId: string; position: number; points?: number }`;
  - `Timing` gains `jumpMs`, `countMs`; `TIMING.jumpMs = 700`, `TIMING.countMs = 1200`;
    `SCHEME_TIMING.jumpMs = 500`, `SCHEME_TIMING.countMs = 1000`;
  - `type Jump = { teamId: string; start: number; end: number }`;
  - `type BurstKind = 'gate' | 'overtake' | 'leader' | 'finish'`;
    `type Burst = { teamId: string; kind: BurstKind; start: number }`;
  - `Popup` gains `count?: { points: number; ms: number }`;
  - `Plan = { moves; shots; popups; jumps: Jump[]; bursts: Burst[]; duration }`;
  - `planMoves(before, after, timing?, gates?, finish?: number)`;
  - `popupsAt(plan, t, still = false)` — the counting text at `t` (quantized to 15 a second);
  - `jumpAt(plan, teamId, t): number` — 0…1 of the jump's arc;
  - `COUNT_FPS = 15`.

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/scene/choreography.test.ts` (import `jumpAt`
from the choreography):

```ts
const withPoints = (entries: [string, number, number][]) =>
  entries.map(([teamId, position, points]) => ({ teamId, position, points }));

describe('the beats of a portion (D-57)', () => {
  it('points without steps: the camera flies, the figure jumps, «+N баллов» runs, a pause', () => {
    const plan = planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 52]]));
    const { flyMs, jumpMs, countMs, pauseMs, overviewMs } = TIMING;
    expect(plan.moves).toEqual([]);
    expect(plan.jumps).toEqual([{ teamId: 't1', start: flyMs, end: flyMs + jumpMs }]);
    expect(plan.popups).toEqual([
      {
        teamId: 't1',
        text: '+12 баллов',
        start: flyMs,
        end: flyMs + countMs + pauseMs,
        count: { points: 12, ms: countMs },
      },
    ]);
    expect(plan.shots.map((s) => s.target.kind)).toEqual(['team', 'overview']);
    expect(plan.duration).toBe(flyMs + countMs + pauseMs + overviewMs);
  });

  it('points and steps: the count first, then the walk with «+N шагов»', () => {
    const plan = planMoves(withPoints([['t1', 2, 20]]), withPoints([['t1', 4, 40]]));
    const { flyMs, countMs, hopMs } = TIMING;
    expect(plan.moves).toMatchObject([{ teamId: 't1', from: 2, to: 4, start: flyMs + countMs }]);
    expect(plan.popups.map((p) => [p.text, p.start])).toEqual([
      ['+20 баллов', flyMs],
      ['+2 шага', flyMs + countMs],
    ]);
    expect(plan.moves[0]?.end).toBe(flyMs + countMs + 2 * hopMs);
  });

  it('cells without points: no points beats — the plan of before D-57', () => {
    const plan = planMoves(pos([['t1', 2]]), pos([['t1', 4]]));
    expect(plan.jumps).toEqual([]);
    expect(plan.popups.map((p) => p.text)).toEqual(['+2 шага']);
    expect(plan.moves[0]?.start).toBe(TIMING.flyMs);
  });

  it('no change, a loss of points or less than a point: no beat', () => {
    expect(planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 40.4]]))).toEqual(EMPTY_PLAN);
    expect(planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 30]]))).toEqual(EMPTY_PLAN);
  });

  it('the counting text runs from +0 to the result, at most 15 changes a second; still — the result', () => {
    const plan = planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 52]]));
    const start = TIMING.flyMs;
    expect(popupsAt(plan, start)[0]?.text).toBe('+0 баллов');
    expect(popupsAt(plan, start + TIMING.countMs)[0]?.text).toBe('+12 баллов');
    expect(popupsAt(plan, start, true)[0]?.text).toBe('+12 баллов');
    const texts = new Set<string>();
    for (let ms = 0; ms <= 1000; ms += 5) texts.add(popupsAt(plan, start + ms)[0]?.text ?? '');
    expect(texts.size).toBeLessThanOrEqual(16);
  });

  it('the jump: an arc 0 → 1 → 0 over its time, none outside it', () => {
    const plan = planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 52]]));
    const { flyMs, jumpMs } = TIMING;
    expect(jumpAt(plan, 't1', flyMs - 1)).toBe(0);
    expect(jumpAt(plan, 't1', flyMs + jumpMs / 2)).toBeCloseTo(1);
    expect(jumpAt(plan, 't1', flyMs + jumpMs)).toBe(0);
    expect(jumpAt(plan, 't2', flyMs + jumpMs / 2)).toBe(0);
  });

  it('bursts at the end of a walk, the most notable one: finish > leader > gate > overtake', () => {
    const gates = [8, 16];
    const end = (plan: ReturnType<typeof planMoves>) => plan.moves[0]?.end;
    // t1 passes the gate at 8 and t2 (strictly ahead before, behind after), but t3 still leads.
    const gate = planMoves(
      pos([['t1', 6], ['t2', 7], ['t3', 12]]),
      pos([['t1', 9], ['t2', 7], ['t3', 12]]),
      TIMING,
      gates,
      16,
    );
    expect(gate.bursts).toEqual([{ teamId: 't1', kind: 'gate', start: end(gate) }]);
    const overtake = planMoves(
      pos([['t1', 4], ['t2', 5], ['t3', 12]]),
      pos([['t1', 6], ['t2', 5], ['t3', 12]]),
      TIMING,
      gates,
      16,
    );
    expect(overtake.bursts).toEqual([{ teamId: 't1', kind: 'overtake', start: end(overtake) }]);
    const leader = planMoves(
      pos([['t1', 6], ['t2', 7]]),
      pos([['t1', 9], ['t2', 7]]),
      TIMING,
      gates,
      16,
    );
    expect(leader.bursts).toEqual([{ teamId: 't1', kind: 'leader', start: end(leader) }]);
    const finish = planMoves(
      pos([['t1', 14], ['t2', 15]]),
      pos([['t1', 17], ['t2', 15]]),
      TIMING,
      gates,
      16,
    );
    expect(finish.bursts).toEqual([{ teamId: 't1', kind: 'finish', start: end(finish) }]);
    // A step back makes no burst.
    expect(planMoves(pos([['t1', 9]]), pos([['t1', 6]]), TIMING, gates, 16).bursts).toEqual([]);
  });
});
```

and to `tests/unit/moments/events.test.ts` (import `trackMoves`):

```ts
describe('the rules of the track, shared with the scene (D-57)', () => {
  const at = (entries: [string, number][]) =>
    entries.map(([teamId, position]) => ({ teamId, position }));
  it('overtakes and the one leader — only of a team that moved forward', () => {
    const r = trackMoves(at([['t1', 4], ['t2', 6], ['t3', 2]]), at([['t1', 7], ['t2', 6], ['t3', 2]]));
    expect([...r.overtakes]).toEqual([['t1', ['t2']]]);
    expect(r.leader).toBe('t1');
    const pushed = trackMoves(at([['t1', 4], ['t2', 6]]), at([['t1', 4], ['t2', 3]]));
    expect([...pushed.overtakes]).toEqual([]);
    expect(pushed.leader).toBeNull();
  });
});
```

and in `tests/unit/moments/tracker.test.ts`, the expectation of `before` in «over a remembered snapshot…»
becomes `before: g0.teams.map((t) => ({ teamId: t.teamId, position: t.position, points: t.points }))`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/scene/choreography.test.ts tests/unit/moments`
Expected: FAIL — `jumpAt`, `trackMoves` not exported; `plan.jumps` undefined; `before` without points.

- [ ] **Step 3: The shared rules** — in `src/moments/events.ts`, before `diffMoments`:

```ts
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
```

and in `diffMoments` replace the overtake and leader parts with the shared rules:

```ts
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
```

(`aloneFirst` takes `{ teamId; position }[]` now.) In `src/moments/tracker.ts` the batch's `before` keeps the
points: `before: before.teams.map(({ teamId, position, points }) => ({ teamId, position, points }))`, and the
`Moments.before` type becomes `{ teamId: string; position: number; points: number }[]`.

- [ ] **Step 4: The choreography** — `src/scene/choreography.ts`:
- imports: `import { trackMoves } from '../moments/events.ts';`;
- `export type TeamPosition = { teamId: string; position: number; points?: number };`;
- `Timing` gains

```ts
  /** The figure's jump at the start of a points beat (D-57). */
  jumpMs: number;
  /** «+N баллов» runs from +0 to N this long; the walk, if any, follows. */
  countMs: number;
```

  `TIMING` gains `jumpMs: 700, countMs: 1200`;
- the types:

```ts
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

export const EMPTY_PLAN: Plan = { moves: [], shots: [], popups: [], jumps: [], bursts: [], duration: 0 };

/** The counter's text changes at most this often (a texture is redrawn per change, D-57). */
export const COUNT_FPS = 15;
const RANK: Record<BurstKind, number> = { finish: 4, leader: 3, gate: 2, overtake: 1 };
const pointsText = (n: number) => `+${n} ${plural(n, 'балл', 'балла', 'баллов')}`;
```

- `planMoves`:

```ts
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
        count: { points: gain, ms: timing.countMs },
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
  plan.duration = t;
  return plan;
}
```

- `popupsAt` and `jumpAt`:

```ts
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
```

- `src/scheme/geometry.ts`, `SCHEME_TIMING` gains `jumpMs: 500, countMs: 1000`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/scene tests/unit/scheme tests/unit/moments`
Expected: PASS (the old choreography tests too: cells without points plan as before).

- [ ] **Step 6: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/moments/events.ts src/moments/tracker.ts src/scene/choreography.ts src/scheme/geometry.ts tests/unit/scene/choreography.test.ts tests/unit/moments/events.test.ts tests/unit/moments/tracker.test.ts
git commit -m "Choreography: a beat for a team whose points grew — the jump and «+N баллов» running, then the walk; a burst at the end of a walk — finish, leader, gate, overtake (rules shared with the panels) (D-57, plan scene task 1)"
```

---

### Task 2: The player and the scheme carry the points

**Где смотреть:** `src/scene/player.ts` (`load`, `samePositions`, `popups`), `src/scheme/geometry.ts`
(`nextMoves`, `firstMoves`, `samePositions`), `src/scene/GameScene.tsx` (эффект с `player.load`),
`src/scheme/Scheme.tsx` (`positions`), `src/app/App.tsx` (`replayFrom`); тесты
`tests/unit/scene/player.test.ts`, `tests/unit/scheme/geometry.test.ts`.

**Files:**
- Modify: `src/scene/player.ts`, `src/scheme/geometry.ts`, `src/scene/GameScene.tsx`, `src/scheme/Scheme.tsx`
- Test: `tests/unit/scene/player.test.ts`, `tests/unit/scheme/geometry.test.ts`

**Interfaces:**
- Consumes: Task 1 — `TeamPosition.points`, `planMoves(…, finish)`, `popupsAt(…, still)`, `jumpAt`, `Burst`.
- Produces: `ScenePlayer.load(after, trackKey, gates?, from?, finish?)`; `ScenePlayer.jump(teamId): number`;
  `ScenePlayer.bursts(): (Burst & { age: number })[]`; `ScenePlayer.popups(still?: boolean)`;
  `nextMoves(current, positions, trackKey, gates, finish?)`, `firstMoves(positions, trackKey, gates, from,
  finish?)`; in `choreography.ts` — `BURST_MS: Record<BurstKind, number>` (the lifetimes of the bursts, the
  one source; Task 3's sparks are pinned to it by a test) and `burstsAt(plan, t): (Burst & { age: number
  })[]`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/scene/player.test.ts`, inside «ScenePlayer (FR-MOVE)»:

```ts
  it('equal cells, more points: a new plan with a jump (a daytime portion, D-57)', () => {
    const player = new ScenePlayer();
    player.load([{ teamId: 't1', position: 4, points: 40 }], '20');
    const plan = player.load([{ teamId: 't1', position: 4, points: 52 }], '20');
    expect(plan.jumps).toHaveLength(1);
    player.advance(TIMING.flyMs + TIMING.jumpMs / 2);
    expect(player.jump('t1')).toBeCloseTo(1);
    expect(player.popups()[0]?.text).toMatch(/^\+\d+ балл/);
    expect(player.popups(true)[0]?.text).toBe('+12 баллов');
  });

  it('a burst lives for its time from the end of the walk', () => {
    const player = new ScenePlayer();
    player.load(at([['t1', 6], ['t2', 7]]), '20', [8, 16], null, 16);
    const plan = player.load(at([['t1', 9], ['t2', 7]]), '20', [8, 16], null, 16);
    const burst = plan.bursts[0];
    if (!burst) throw new Error('no burst');
    player.advance(burst.start - 1);
    expect(player.bursts()).toEqual([]);
    player.advance(101);
    expect(player.bursts()).toMatchObject([{ teamId: 't1', kind: 'leader', age: 100 }]);
  });
```

`tests/unit/scheme/geometry.test.ts`, inside «the first moves of a page»:

```ts
  it('equal cells, more points: the next moves play a jump (D-57)', () => {
    const was = firstMoves([{ teamId: 't1', position: 4, points: 40 }], '20|30', [], null);
    const next = nextMoves(was, [{ teamId: 't1', position: 4, points: 52 }], '20|30', []);
    expect(next.restart).toBe(true);
    expect(next.plan.jumps).toHaveLength(1);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/scene/player.test.ts tests/unit/scheme/geometry.test.ts`
Expected: FAIL — equal positions keep the old plan; `jump`, `bursts` missing.

- [ ] **Step 3: The bursts at `t`** — in `src/scene/choreography.ts`:

```ts
/** How long a burst of each kind lives (D-57): the finish fires three waves, the leader two. */
export const BURST_MS: Record<BurstKind, number> = {
  overtake: 1300,
  gate: 1600,
  leader: 2350,
  finish: 3500,
};

/** The bursts alive at `t`, with their age in ms. */
export function burstsAt(plan: Plan, t: number): (Burst & { age: number })[] {
  return plan.bursts
    .filter((b) => t >= b.start && t < b.start + BURST_MS[b.kind])
    .map((b) => ({ ...b, age: t - b.start }));
}
```

- [ ] **Step 4: The player** — `src/scene/player.ts`:
- imports gain `burstsAt`, `jumpAt`;
- `samePositions` compares the points too:

```ts
function samePositions(a: TeamPosition[], b: TeamPosition[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (t, i) =>
        t.teamId === b[i]?.teamId && t.position === b[i]?.position && t.points === b[i]?.points,
    )
  );
}
```

- `load(after, trackKey, gates = [], from = null, finish?: number)` passes `finish` to
  `planMoves(before, after, TIMING, gates, finish)`;
- new methods:

```ts
  /** The figure's jump at the player's time: 0…1 of its arc (D-57). */
  jump(teamId: string): number {
    return jumpAt(this.plan, teamId, this.clock);
  }

  /** The bursts alive at the player's time (D-57). */
  bursts() {
    return burstsAt(this.plan, this.clock);
  }
```

- `popups(still = false) { return popupsAt(this.plan, this.clock, still); }`.

`src/scheme/geometry.ts`: `samePositions` as above; `nextMoves(current, positions, trackKey, gates, finish?:
number)` and `firstMoves(positions, trackKey, gates, from, finish?: number)` pass `finish` to `planMoves`.

- [ ] **Step 5: The callers pass points and the finish**
- `src/scene/GameScene.tsx` (the load effect):

```ts
    const plan = player.load(
      game.teams.map((t) => ({ teamId: t.teamId, position: t.position, points: t.points })),
      `${game.track.trackLength}|${game.track.maxPosition}`,
      gates,
      replayFrom,
      game.track.trackLength,
    );
```

- `src/scheme/Scheme.tsx`: `positions` include `points: t.points`; `useMoves(…)` gets `finish:
  number` (`game.track.trackLength`) and passes it to `firstMoves` and `nextMoves`.

- [ ] **Step 6: Run the tests to verify they pass; the suite**

Run: `npx vitest run tests/unit/scene tests/unit/scheme && npm run typecheck && npm run lint && npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/scene/choreography.ts src/scene/player.ts src/scheme/geometry.ts src/scene/GameScene.tsx src/scheme/Scheme.tsx tests/unit/scene/player.test.ts tests/unit/scheme/geometry.test.ts
git commit -m "Scene and scheme: the moves carry the teams' points — equal cells with more points make a tour; the player knows the jump and the bursts at its time (D-57, plan scene task 2)"
```

---

### Task 3: Fireworks (pure) and the 3D: the jump, the counter, the sparks

**Где смотреть:** спецификация B2; `src/scene/Figures.tsx` (позы, `body.position.y`, всплывающие таблички),
`src/scene/heroes.ts` (`heroAction`), `src/scene/labels.ts` (тексты в текстуры, кэш), `src/scene/layout.ts`,
`src/scene/runtime/quality.ts` (`ambient` — нижние ступени), `src/hud/clock.ts` (`reducedMotion`);
NAVIGATOR §7–§10 (герои, ходы, рендер); тесты `tests/unit/scene/heroes.test.ts`.

**Files:**
- Create: `src/scene/fireworks.ts`, `src/scene/Fireworks.tsx`
- Modify: `src/scene/Figures.tsx`, `src/scene/heroes.ts`, `src/scene/labels.ts`, `src/scene/layout.ts`,
  `src/scene/GameScene.tsx`
- Test: `tests/unit/scene/fireworks.test.ts`, `tests/unit/scene/heroes.test.ts`

**Interfaces:**
- Consumes: Task 2 — `player.jump`, `player.bursts`, `player.popups(still)`; Task 1 — `BurstKind`,
  `BURST_MS`.
- Produces: `POOL = 200`; `BURSTS: Record<BurstKind, { sparks: number; waves: number[]; life: number; speed:
  number; gold: boolean }>`; `writeSparks(kind, age, origin, color, positions, colors, offset, room, share):
  number`; `figureScale(layout): number` (`src/scene/layout.ts`); `counterLabel(teamId, text): Label`
  (`src/scene/labels.ts`); `<Fireworks layout player teamIds colors full />`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/scene/fireworks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BURST_MS } from '../../../src/scene/choreography.ts';
import { BURSTS, POOL, writeSparks } from '../../../src/scene/fireworks.ts';

const buffers = () => ({
  positions: new Float32Array(POOL * 3),
  colors: new Float32Array(POOL * 3),
});
const RED: [number, number, number] = [1, 0.2, 0.1];

describe('fireworks (D-57)', () => {
  it('each kind fits the pool and lives exactly as long as the plan keeps it', () => {
    for (const [kind, b] of Object.entries(BURSTS)) {
      expect(b.sparks * b.waves.length).toBeLessThanOrEqual(POOL);
      expect(Math.max(...b.waves) + b.life).toBe(BURST_MS[kind as keyof typeof BURSTS]);
    }
  });

  it('a burst is a function of its age: at 0 at the origin, then outwards, then gone', () => {
    const { positions, colors } = buffers();
    const n0 = writeSparks('gate', 0, [1, 2, 3], RED, positions, colors, 0, POOL, 1);
    expect(n0).toBe(BURSTS.gate.sparks);
    expect([positions[0], positions[1], positions[2]]).toEqual([1, 2, 3]);
    const n1 = writeSparks('gate', 400, [1, 2, 3], RED, positions, colors, 0, POOL, 1);
    expect(n1).toBe(BURSTS.gate.sparks);
    const d = Math.hypot((positions[0] ?? 0) - 1, (positions[1] ?? 0) - 2, (positions[2] ?? 0) - 3);
    expect(d).toBeGreaterThan(0.3);
    expect(writeSparks('gate', BURST_MS.gate, [1, 2, 3], RED, positions, colors, 0, POOL, 1)).toBe(0);
  });

  it('the pool never overflows: a burst writes at most the room left; half quality — half', () => {
    const { positions, colors } = buffers();
    expect(writeSparks('finish', 1000, [0, 0, 0], RED, positions, colors, 190, 10, 1)).toBe(10);
    const half = writeSparks('gate', 100, [0, 0, 0], RED, positions, colors, 0, POOL, 0.5);
    expect(half).toBe(BURSTS.gate.sparks / 2);
  });

  it('the finish fires its waves one after another; gold in a leader and a finish', () => {
    const { positions, colors } = buffers();
    const first = writeSparks('finish', 100, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    const later = writeSparks('finish', 1000, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    expect(later).toBeGreaterThan(first);
    writeSparks('leader', 50, [0, 0, 0], RED, positions, colors, 0, POOL, 1);
    // Some sparks are gold: green as high as red.
    const gold = Array.from({ length: BURSTS.leader.sparks }, (_, i) => colors[i * 3 + 1] ?? 0);
    expect(gold.some((g, i) => g > 0.6 * (colors[i * 3] ?? 0))).toBe(true);
  });
});
```

`tests/unit/scene/heroes.test.ts` (import `TIMING`, `planMoves` exist there):

```ts
describe('the jump of a points beat (D-57)', () => {
  it('a hero hops in place while it jumps', () => {
    const plan = planMoves(
      [{ teamId: 't1', position: 4, points: 40 }],
      [{ teamId: 't1', position: 4, points: 52 }],
    );
    const action = heroAction(plan, 't1', TIMING.flyMs + TIMING.jumpMs / 2);
    expect(action.clip).toBe('hop');
    expect(action.phase).toBeCloseTo(0.5);
    expect(heroAction(plan, 't1', TIMING.flyMs + TIMING.jumpMs + 10).clip).toBe('idle');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/scene/fireworks.test.ts tests/unit/scene/heroes.test.ts`
Expected: FAIL — `src/scene/fireworks.ts` cannot be resolved; `heroAction` idle during the jump.

- [ ] **Step 3: The sparks** — `src/scene/fireworks.ts`:

```ts
import type { BurstKind } from './choreography.ts';

/**
 * Fireworks as points (D-57, PERF-9): one pool, one draw call, additive, no physics engine — each spark a
 * function of its burst's age, so a paused tour resumes its bursts where they were.
 */

/** At most this many sparks at once (§12.1 budget of the effect). */
export const POOL = 200;
const GOLD: [number, number, number] = [1, 0.84, 0.42];
const GRAVITY = 2.2; // units per s², pulls the sparks down
const DRAG = 0.55; // a spark keeps (1 − DRAG·age/life) of its flight

export const BURSTS: Record<
  BurstKind,
  { sparks: number; waves: number[]; life: number; speed: number; gold: boolean }
> = {
  overtake: { sparks: 24, waves: [0], life: 1300, speed: 1.8, gold: false },
  gate: { sparks: 40, waves: [0], life: 1600, speed: 2.4, gold: false },
  leader: { sparks: 30, waves: [0, 350], life: 2000, speed: 2.8, gold: true },
  finish: { sparks: 40, waves: [0, 450, 900], life: 2600, speed: 3.2, gold: true },
};

/**
 * Writes the live sparks of a burst `age` ms old from `offset` on, at most `room` of them; `share` — the
 * part of the sparks drawn (1, or 0.5 on the lower steps of the quality ladder). Returns how many it
 * wrote. A spark flies along a fixed direction (a golden-angle spiral over the upper half-sphere), slows,
 * falls and fades; half the sparks of a leader or a finish are gold.
 */
export function writeSparks(
  kind: BurstKind,
  age: number,
  origin: readonly [number, number, number],
  color: readonly [number, number, number],
  positions: Float32Array,
  colors: Float32Array,
  offset: number,
  room: number,
  share: number,
): number {
  const b = BURSTS[kind];
  const count = Math.round(b.sparks * share);
  let n = 0;
  for (const wave of b.waves) {
    const a = age - wave;
    if (a < 0 || a >= b.life) continue;
    const s = a / 1000;
    const fade = (1 - a / b.life) ** 1.5;
    const flight = b.speed * s * (1 - (DRAG * a) / b.life);
    for (let i = 0; i < count && n < room; i++, n++) {
      const up = 0.25 + (0.75 * (i + 0.5)) / count;
      const around = i * 2.399963 + wave;
      const r = Math.sqrt(1 - up * up);
      const k = (offset + n) * 3;
      positions[k] = origin[0] + r * Math.cos(around) * flight;
      positions[k + 1] = origin[1] + up * flight - GRAVITY * s * s * 0.5;
      positions[k + 2] = origin[2] + r * Math.sin(around) * flight;
      const tint = b.gold && i % 2 === 0 ? GOLD : color;
      colors[k] = tint[0] * fade;
      colors[k + 1] = tint[1] * fade;
      colors[k + 2] = tint[2] * fade;
    }
  }
  return n;
}
```

In `src/scene/choreography.ts` keep `BURST_MS` as the single source of the lifetimes (the test pins them to
`BURSTS`): overtake 1300, gate 1600, leader 350 + 2000 = 2350, finish 900 + 2600 = 3500.

- [ ] **Step 4: The hero's jump** — `src/scene/heroes.ts`, at the start of `heroAction`:

```ts
  const jump = plan.jumps.find((j) => j.teamId === teamId && t >= j.start && t < j.end);
  if (jump) return { clip: 'hop', phase: (t - jump.start) / (jump.end - jump.start) };
```

(the doc line gains «jumps in place at the start of a points beat (D-57)»).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/scene`
Expected: PASS.

- [ ] **Step 6: The scale, the counter label, the figures**
- `src/scene/layout.ts`:

```ts
/** The figures' scale on a board (heroes, rings, popups, sparks): a cell's size, within 0.6…1. */
export function figureScale(layout: Pick<Layout, 'cellSize'>): number {
  return Math.min(Math.max(layout.cellSize / 1.4, 0.6), 1);
}
```

  and `Figures.tsx` uses it instead of its own formula.
- `src/scene/labels.ts`, after `labelTexture`:

```ts
const counters = new Map<string, { label: Label; text: string; draw: (text: string) => void }>();

/**
 * The live counter over a figure (D-57): one texture per team, redrawn when the text changes (at most
 * `COUNT_FPS` times a second by the plan) — not a texture per number. The plate is the gain style's, wide
 * enough for «+9 999 баллов».
 */
export function counterLabel(teamId: string, text: string): Label {
  let c = counters.get(teamId);
  if (!c) {
    const s = STYLES.gain;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2D is not available');
    const font = `${s.weight} ${s.px}px ${SERIF}`;
    ctx.font = font;
    const padX = s.px * 0.8;
    canvas.width = Math.ceil(ctx.measureText('+9 999 баллов').width + padX * 2);
    canvas.height = Math.ceil(s.px * 1.5);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const label = { texture, aspect: canvas.width / canvas.height };
    const draw = (next: string) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintPlate(ctx, canvas.width, canvas.height, 'gain', next);
      texture.needsUpdate = true;
    };
    c = { label, text: '', draw };
    counters.set(teamId, c);
  }
  if (c.text !== text) {
    c.draw(text);
    c.text = text;
  }
  return c.label;
}
```

  Move the drawing of a plate out of `labelTexture` into `function paintPlate(ctx, width, height, style,
  text)` (the edge, the fill, the rim, the two rhombi, the text — the code that is there now, unchanged),
  used by both. `clearLabels` also disposes the counters and clears their map.
- `src/scene/Figures.tsx`:
  - imports `counterLabel`, `figureScale`, `reducedMotion` (`../hud/clock.ts`);
  - `const JUMP_HEIGHT = 0.8; // the jump of a points beat (D-57)`;
  - in the `still` branch: `body.position.y = player.jump(teamId) * JUMP_HEIGHT;` (inside the figure's scale);
  - the popups loop becomes:

```ts
    const active = new Map(player.popups(reducedMotion()).map((p) => [p.teamId, p]));
    for (const [teamId, sprite] of popups.current) {
      const popup = active.get(teamId);
      const figure = figures.current.get(teamId);
      sprite.visible = popup !== undefined && figure !== undefined;
      if (!popup || !figure) continue;
      const material = sprite.material as SpriteMaterial;
      if (shownText.current.get(teamId) !== popup.text) {
        // A counting popup redraws its team's one live texture; others are cached by text (D-57).
        const label = popup.count
          ? counterLabel(teamId, popup.text)
          : labelTexture(popup.text, popup.text.startsWith('+') ? 'gain' : 'loss');
        if (material.map !== label.texture) {
          material.map = label.texture;
          material.needsUpdate = true;
        }
        sprite.scale.set(0.6 * label.aspect * scale, 0.6 * scale, 1);
        shownText.current.set(teamId, popup.text);
      }
      // …the opacity and the position as they are.
```
- `src/scene/Fireworks.tsx`:

```tsx
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  PointsMaterial,
  type Points,
} from 'three';
import { reducedMotion } from '../hud/clock.ts';
import { POOL, writeSparks } from './fireworks.ts';
import { figureScale, type Layout } from './layout.ts';
import { figurePositions, type ScenePlayer } from './player.ts';

/** Above the hero's head, in world units at figure scale 1. */
const BURST_Y = 2.6;

/** A soft round spark, drawn once. */
function sparkTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(canvas);
}

/**
 * The fireworks of the tour (D-57, PERF-9): one pool of points, one draw call, drawn only while a burst
 * lives; half the sparks on the lower steps of the quality ladder; none with reduced motion.
 */
export function Fireworks({
  layout,
  player,
  teamIds,
  colors,
  full,
}: {
  layout: Layout;
  player: ScenePlayer;
  teamIds: string[];
  /** Team id → its colour. */
  colors: Map<string, string>;
  full: boolean;
}) {
  const points = useRef<Points>(null);
  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(POOL * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(POOL * 3), 3));
    g.setDrawRange(0, 0);
    const m = new PointsMaterial({
      size: 0.32,
      map: sparkTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const rgb = useMemo(
    () =>
      new Map(
        [...colors].map(([id, hex]) => {
          const c = new Color(hex);
          return [id, [c.r, c.g, c.b] as [number, number, number]];
        }),
      ),
    [colors],
  );
  const scale = figureScale(layout);

  useFrame(() => {
    const p = points.current;
    if (!p) return;
    const bursts = reducedMotion() ? [] : player.bursts();
    if (bursts.length === 0) {
      p.visible = false;
      return;
    }
    const at = figurePositions(layout, player, teamIds);
    const position = geometry.getAttribute('position') as BufferAttribute;
    const color = geometry.getAttribute('color') as BufferAttribute;
    let n = 0;
    for (const b of bursts) {
      const xz = at(b.teamId);
      if (!xz) continue;
      n += writeSparks(
        b.kind,
        b.age,
        [xz.x, BURST_Y * scale, xz.z],
        rgb.get(b.teamId) ?? [1, 1, 1],
        position.array as Float32Array,
        color.array as Float32Array,
        n,
        POOL - n,
        full ? 1 : 0.5,
      );
    }
    geometry.setDrawRange(0, n);
    position.needsUpdate = true;
    color.needsUpdate = true;
    p.visible = n > 0;
  });

  return (
    <points
      ref={points}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
    />
  );
}
```

- `src/scene/GameScene.tsx`: `Play` renders, after `<Figures …/>`,
  `<Fireworks layout={layout} player={player} teamIds={teamIds} colors={teamColors} full={full} />` with
  `const teamColors = useMemo(() => new Map(teams.map((t) => [t.id, t.color])), [teams]);` and a new prop of
  `Play`, `full: boolean`, given by `GameScene` as `quality.ambient`.

- [ ] **Step 7: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 8: Screenshots of a beat** — a throwaway spec (not committed): the demo opened over a snapshot
of 12.10 at 14.10 noon in 3D (as `tests/e2e/moments.spec.ts` does), shots at a jump with the counter
(≈ 1.4 s after the first team's flight), at a burst (poll `window.__sqMoving` and take three shots 1 s apart),
into the scratchpad. Look: the counter readable and not jittering in width, the jump visible, the sparks in the
team's colour above the head, nothing covers the plate of the name for long. Fix what does not read; ledger it.

- [ ] **Step 9: Commit**

```bash
git add src/scene/fireworks.ts src/scene/Fireworks.tsx src/scene/Figures.tsx src/scene/heroes.ts src/scene/labels.ts src/scene/layout.ts src/scene/GameScene.tsx tests/unit/scene/fireworks.test.ts tests/unit/scene/heroes.test.ts
git commit -m "Scene: the figure jumps and «+N баллов» runs over it on one live label; fireworks — one pool of ≤ 200 points, one draw call, half on the lower steps of the ladder, none with reduced motion (D-57, plan scene task 3)"
```

---

### Task 4: The 2D scheme: the jump, the counter, the sparks

**Где смотреть:** спецификация B2 «2D scheme»; `src/scheme/Scheme.tsx` (`Tokens`, всплывашка, `useMoves` —
чтение плана 10 раз в секунду), `src/scheme/geometry.ts`, `src/hud/theme.css` (общие стили, `@layer
components`); D-47.

**Files:**
- Modify: `src/scheme/Scheme.tsx`, `src/hud/theme.css`
- Test: `tests/unit/scheme/geometry.test.ts`

**Interfaces:**
- Consumes: Task 1 — `jumpAt` (only to know a jump is on), `plan.jumps`, `burstsAt`, `popupsAt(…, still)`.
- Produces: `sparkOffsets(kind, count, size): { dx: number; dy: number; delay: number }[]` in
  `src/scheme/geometry.ts`.

- [ ] **Step 1: Write the failing test** — `tests/unit/scheme/geometry.test.ts` (import `sparkOffsets`):

```ts
describe('the sparks of the scheme (D-57)', () => {
  it('fly out around the token, fewer for an overtake, in waves for the finish', () => {
    const gate = sparkOffsets('gate', 24, 10);
    expect(gate).toHaveLength(24);
    expect(gate.every((s) => Math.hypot(s.dx, s.dy) > 0)).toBe(true);
    expect(sparkOffsets('overtake', 24, 10)).toHaveLength(16);
    const finish = sparkOffsets('finish', 24, 10);
    expect(new Set(finish.map((s) => s.delay)).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/scheme/geometry.test.ts`
Expected: FAIL — `sparkOffsets` is not exported.

- [ ] **Step 3: The offsets** — `src/scheme/geometry.ts`:

```ts
/**
 * The sparks of a burst on the scheme (D-57): where each flies from the token (dx, dy in px of the
 * board) and its delay — the finish in three waves, the leader in two, an overtake with fewer sparks.
 */
export function sparkOffsets(
  kind: 'gate' | 'overtake' | 'leader' | 'finish',
  count: number,
  size: number,
): { dx: number; dy: number; delay: number }[] {
  const n = kind === 'overtake' ? Math.round((count * 2) / 3) : count;
  const waves = kind === 'finish' ? [0, 450, 900] : kind === 'leader' ? [0, 350] : [0];
  const reach = size * (kind === 'finish' ? 3.2 : kind === 'leader' ? 2.8 : 2.2);
  return Array.from({ length: n }, (_, i) => {
    const a = i * 2.399963;
    const r = reach * (0.55 + 0.45 * ((i * 7) % 10) / 10);
    return {
      dx: Math.round(Math.cos(a) * r * 10) / 10,
      dy: Math.round((Math.sin(a) * r - reach * 0.35) * 10) / 10,
      delay: waves[i % waves.length] ?? 0,
    };
  });
}
```

Run: `npx vitest run tests/unit/scheme/geometry.test.ts`
Expected: PASS.

- [ ] **Step 4: The tokens** — `src/scheme/Scheme.tsx`, `Tokens`:
- `const still = reducedMotion();` (import from `../hud/clock.ts`); popups by `popupsAt(plan, t, still)`;
  `const bursts = still ? [] : burstsAt(plan, t);` (import `burstsAt`, `sparkOffsets`);
- the token's inner content (the two shield paths, the plaque and the popup) is wrapped in

```tsx
            <g
              key={jump ? `jump-${jump.start}` : 'still'}
              className={jump && !still ? 'sq-jump' : undefined}
              style={
                jump
                  ? ({
                      '--sq-jump-ms': `${jump.end - jump.start}ms`,
                      '--sq-jump-h': `${-c * 0.9}px`,
                    } as CSSProperties)
                  : undefined
              }
            >
              …the shield, the rim, the plaque, the popup as they are…
            </g>
```

  where `const jump = plan.jumps.find((j) => j.teamId === team.id && t >= j.start && t < j.end);` and
  `import type { CSSProperties } from 'react';`;
- after that group, in the token's `g`, the sparks of its burst:

```tsx
            {bursts
              .filter((b) => b.teamId === team.id)
              .map((b) => (
                <g key={`burst-${b.start}`} transform={`translate(0 ${-shield * 0.9})`}>
                  {sparkOffsets(b.kind, 24, c).map((s, i) => (
                    <circle
                      key={i}
                      r={c * (b.kind === 'overtake' ? 0.09 : 0.12)}
                      fill={i % 2 === 0 && (b.kind === 'leader' || b.kind === 'finish') ? '#ffd56b' : team.color}
                      className="sq-spark"
                      style={
                        {
                          '--sq-dx': `${s.dx}px`,
                          '--sq-dy': `${s.dy}px`,
                          animationDelay: `${s.delay}ms`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </g>
              ))}
```

- `src/hud/theme.css`, after the moments styles:

```css
  /* The scheme's moments (D-57): a jump and sparks, each played once by CSS — no frame loop. */
  .sq-jump {
    animation: sq-jump var(--sq-jump-ms) ease-out both;
  }
  @keyframes sq-jump {
    50% {
      transform: translateY(var(--sq-jump-h));
    }
  }
  .sq-spark {
    opacity: 0;
    animation: sq-spark 1.4s ease-out both;
  }
  @keyframes sq-spark {
    0% {
      opacity: 1;
      transform: translate(0, 0);
    }
    100% {
      opacity: 0;
      transform: translate(var(--sq-dx), var(--sq-dy));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sq-jump,
    .sq-spark {
      animation: none;
    }
  }
```

- [ ] **Step 5: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 6: Screenshots of the scheme** — the throwaway spec of Task 3 Step 8 with `?view=2d`: a jump with
the counter, a burst. Look: the token jumps smoothly (a CSS animation, not 10 steps a second), the sparks
fly around the shield, the counter's text fits its parchment.

- [ ] **Step 7: Commit**

```bash
git add src/scheme/Scheme.tsx src/scheme/geometry.ts src/hud/theme.css tests/unit/scheme/geometry.test.ts
git commit -m "Scheme: the token jumps and «+N баллов» runs over it; sparks of a gate, an overtake, a new leader, the finish — CSS animations played once, none with reduced motion (D-57, plan scene task 4)"
```

---

### Task 5: The checks: QA-4 that measures a walk, e2e, the look

**Где смотреть:** `tests/e2e/perf.spec.ts` (QA-4 и «QA-4 with moments»), `tests/e2e/moments.spec.ts`,
`tests/e2e/visual.spec.ts`, `src/scene/moving.ts`, `src/scene/runtime/RenderStats.tsx`
(`window.__sqFrames`, `__sqStats`); D-45 (CI — только динамика); the CI run of 13.10 (`gh run view
38450309954 --log-failed`: «QA-4 moments 29.9» beside «QA-4 12.5»).

**Files:**
- Modify: `src/scene/moving.ts`, `tests/e2e/perf.spec.ts`, `tests/e2e/moments.spec.ts`

- [ ] **Step 1: The probe of the walk** — `src/scene/moving.ts`: `publishMoving` also sets
`(window as Window & { __sqMoving?: boolean }).__sqMoving = next` when `window` exists (a probe for the
tests, as `__sqFrames`).

- [ ] **Step 2: QA-4 with moments measures a walk** — in `tests/e2e/perf.spec.ts`, «QA-4 with moments», the
measuring window becomes (the CI run read 29.9 fps where the base read 12.5 — likely not a walk):

```ts
  await page.waitForTimeout(500);
  const walking = await page.evaluate(
    () => (window as Window & { __sqMoving?: boolean }).__sqMoving ?? false,
  );
  const f0 = await frames(page);
  const t0 = Date.now();
  let worst = { calls: 0, triangles: 0 };
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const s = await stats(page);
    if (s)
      worst = {
        calls: Math.max(worst.calls, s.calls),
        triangles: Math.max(worst.triangles, s.triangles),
      };
  }
  const fps = ((await frames(page)) - f0) / ((Date.now() - t0) / 1000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
```

and the report and the checks:

```ts
  const report = { rate: RATE, fps: Math.round(fps * 10) / 10, ...worst, walking, moments: true };
  writeFileSync(testInfo.outputPath('qa4-moments.json'), JSON.stringify(report, null, 2));
  console.log(`QA-4 moments ${JSON.stringify(report)}`);
  expect(walking, 'the window must be a walk, not rest').toBe(true);
  expect(fps).toBeGreaterThanOrEqual(28);
  expect(worst.calls).toBeLessThanOrEqual(120);
  expect(worst.triangles).toBeLessThanOrEqual(80_000);
```

- [ ] **Step 3: e2e of the beats** — in `tests/e2e/moments.spec.ts` a new test:

```ts
test('a daytime portion without steps: the figure jumps and counts, then the story (D-57)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { input, now } = await demo();
  const seen = snapshotOf(now, input.config);
  // As if, a moment ago, one team and one of its operators had 12 points less — on the same cells.
  const team = seen.teams[seen.teams.length - 1];
  const operator = seen.managers.find((m) => m.teamId === team?.teamId);
  if (!team || !operator) throw new Error('в демо нет команды с операторами');
  const lowered = {
    ...seen,
    teams: seen.teams.map((t) => (t.teamId === team.teamId ? { ...t, points: t.points - 12 } : t)),
    managers: seen.managers.map((m) =>
      m.managerId === operator.managerId ? { ...m, points: m.points - 12 } : m,
    ),
  };
  await open(page, lowered);
  const token = page.locator(`[data-team="${team.teamId}"]`).first();
  await expect(token.locator('.sq-jump')).toHaveCount(1, { timeout: 20_000 });
  await expect(token.getByText(/^\+\d+ балл/)).toBeVisible();
  expect(await cell(page, team.teamId)).toBe(String(team.position));
  await expect(plate(page)).toHaveText(/^Что нового с /, { timeout: 30_000 });
});
```

and in «reduced motion: the card shows the result at once, nothing flashes», after the card's check:

```ts
  // The tour: no sparks; the first team's counter shows its result from the start of its beat.
  await expect(page.locator('.sq-spark')).toHaveCount(0);
  const first = now.teams[0];
  const was = seen.teams.find((s) => s.teamId === first?.teamId);
  const gain = first && was ? Math.round(first.points - was.points) : 0;
  if (first && gain >= 1)
    await expect(
      page.locator(`[data-team="${first.teamId}"]`).first().getByText(/^\+\d+ балл/),
    ).toHaveText(new RegExp(`^\\+${gain} балл`), { timeout: 3000 });
```

- [ ] **Step 4: Run the e2e and QA-4**

Run: `npx playwright test tests/e2e/moments.spec.ts --project=e2e` — Expected: PASS.
Run (bash), three times: `npx playwright test --project=perf --no-deps` — Expected: both tests ≥ 28 fps at ×4,
calls ≤ 120, triangles ≤ 80 000. If below: the bursts' cost (ledger the numbers), lower `POOL` or the spark
size, never the threshold.

- [ ] **Step 5: QA-6 and the whole e2e** — `npx playwright test --project=e2e`; the rest scenes do not play a
tour, so the baselines should not change; if one does, look at the picture, update only if the change is
intended (`npx playwright test visual --update-snapshots`), ledger it.

- [ ] **Step 6: Commit**

```bash
git add src/scene/moving.ts tests/e2e/perf.spec.ts tests/e2e/moments.spec.ts
git commit -m "QA-4 with moments measures a walk (a probe of the map's walk), with the budgets; e2e of a daytime portion's beats and of reduced motion in the tour (D-57, plan scene task 5)"
```

---

### Task 6: Documents and the full check

**Где смотреть:** `docs/DECISIONS.md` (D-56 — «сначала ход, потом его история»), `docs/NAVIGATOR.md` §8 (ходы),
§10 (рендер), `CLAUDE.md`, `docs/BACKLOG.md` (вопрос о шагах админа, аномалия QA-4 в CI).

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/NAVIGATOR.md`, `CLAUDE.md`, `docs/BACKLOG.md`

- [ ] **Step 1: DECISIONS** — after D-56:

```markdown
**D-57. Сцена моментов: подлёт, счётчик над фигуркой, салюты** (ответы автора 13.10.2026: «фигурка подлетает и
ей начисляются баллы … число прирастает до целевого», «салюты»; спецификация
`docs/superpowers/specs/2026-10-13-engagement-moments-design.md`, часть Б, план
`docs/superpowers/plans/2026-10-13-moments-scene.md`; к D-23, D-45, D-47, D-48, D-56, FR-MOVE-1…3, PERF-9):
- **тур порции:** у каждой команды, чьи баллы выросли хотя бы на балл или чья клетка сменилась, — свой ход:
  камера летит к фигурке, фигурка подпрыгивает, над ней «+N баллов» бежит от +0 до N (сцена 1,2 с, схема 1 с;
  текст меняется не чаще 15 раз в секунду, одна живая текстура на фигурку), затем шаги с «+N шагов», как было.
  Дневная порция без шагов тоже получает тур; история на панелях (D-56) идёт после него;
- **салюты** — в конце шага, один на ход, самый заметный: финиш (три залпа, золото) > новый лидер (два, золото) >
  ворота > обгон; правила обгона и лидера — общие с панелями (`trackMoves`). Шаги админа вперёд празднуются, как
  любой ход: сцена не знает, кто подвинул фигурку, и у ворот она и раньше ликовала;
- **3D:** один пул из ≤ 200 точек, один вызов отрисовки, только пока салют жив; на нижних ступенях лестницы
  (без «жизни») — половина искр; **2D:** прыжок и искры — CSS-анимации один раз; «уменьшить движение» — без
  салютов, счётчик сразу с итогом;
- **QA-4 с моментами** меряет именно ход (проба `window.__sqMoving`) и проверяет бюджеты §12.1.
```

- [ ] **Step 2: NAVIGATOR, CLAUDE.md, BACKLOG** — NAVIGATOR §8: «**Ходы с моментами (D-57):** такты в
`planMoves` (прыжок `jumps`, считающая всплывашка `count`, салюты `bursts`), `jumpAt`, `burstsAt`,
`BURST_MS`; искры — `src/scene/fireworks.ts` (чистые) и `Fireworks.tsx`; живая табличка — `counterLabel`
(`labels.ts`); схема — `.sq-jump`, `.sq-spark` (`theme.css`), `sparkOffsets`; тесты
`tests/unit/scene/choreography.test.ts`, `fireworks.test.ts`.» CLAUDE.md: the stage line gains «сцена моментов
(D-57) — `docs/superpowers/plans/2026-10-13-moments-scene.md`»; the scene's list in «Архитектура» gains
`fireworks.ts`, `Fireworks.tsx`, `moving.ts`. BACKLOG: «Сделано: сцена моментов (D-57)»; the question of the
admin's steps closed by D-57; the CI anomaly — what Task 5 found.

- [ ] **Step 3: The full check**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run size && npx playwright test --project=e2e`
Expected: green; `size` under 600 KB.
Run (bash): `npx playwright test --project=perf --no-deps` three times — both ≥ 28 fps at ×4 (paired run).

- [ ] **Step 4: Commit**

```bash
git add docs/DECISIONS.md docs/NAVIGATOR.md CLAUDE.md docs/BACKLOG.md
git commit -m "Docs: D-57 — the scene of the moments: the jump, the counter over the figure, fireworks; NAVIGATOR and the current stage"
```

---

### Task 7: Independent review, fixes, the report

- [ ] **Step 1:** the review package of the whole plan; an independent reviewer on opus with the spec, this plan,
its Review Focus and the ledger's rulings; must not open the root `*.xlsx`, `refs/`, `assets-src/`, the
author's Downloads, and must not decrypt `data/`.
- [ ] **Step 2:** re-grade; Critical and Important — one fix pass, each fix RED → GREEN + the whole suite and
QA-4; minors — to the ledger and `docs/BACKLOG.md`.
- [ ] **Step 3:** a short report in Russian with the screenshots (3D and 2D beats, a burst); the push only after a
fresh «да»; after the deploy — F5 on the office screen.
