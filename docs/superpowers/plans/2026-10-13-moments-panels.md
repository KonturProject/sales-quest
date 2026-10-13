# Moments on the panels and «Что нового» — Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process: executing-plans
> with a ledger and TDD), an independent review subagent (opus) checks the whole plan at the end (Task 9).
> Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md`.

**Goal:** every new portion of data (and the first opening after a break) becomes moments on the map's
panels: the team cards count their points up with a «до шага» bar, toasts tell who brought the points, the
achievement banners follow, the rating jumps to «Герои дня», and a page opened later replays the moves since
this browser's last visit.

**Architecture:** a pure `src/moments/` compares a small snapshot of what the screen showed with the new
`GameState` (`diffMoments`) and keeps the last snapshot in the browser's storage (`sq.seen.v1`); the viewer
(`src/app/viewer.ts`) turns each live recompute into a numbered batch `Moments` and computes «Герои дня» by
a second engine run as of the end of yesterday. The HUD plays a batch from pure helpers (`src/hud/moments.ts`,
`src/hud/cards.ts`) with one clock hook that runs only while the tab is visible (`src/hud/clock.ts`); the
scene's player and the 2D scheme take the remembered cells as «before» on the first show. The engine, the
data format and the admin do not change.

**Tech stack:** React 19, TypeScript 6 strict, Tailwind 4 + `src/hud/theme.css`, Vitest, Playwright 1.63
(`page.clock.setFixedTime`, `addInitScript`, `emulateMedia`).

**Spec:** `docs/superpowers/specs/2026-10-13-engagement-moments-design.md`, Part A (approved 13.10.2026) —
A1…A6; SPEC FR-MOVE-4, ACH-5, PERF-1, PERF-3; DECISIONS D-35, D-38, D-46.

**Refinements of the spec made here:**
- The plate's time reads as the HUD's other times: «Что нового с 12.10 18:40», «Новые данные от 14.10 15:02»
  (`shortTime`).
- **«since» lasts until the first batch with events.** A page opened over a remembered snapshot first shows
  the cached data (usually the same as remembered — no events); the first batch with events, even from the
  next check, is still «Что нового с …».
- **A new leader** — only a team that moved forward (as an overtake): a leader by others' corrections is not
  celebrated.
- **Toasts and banners:** a toast appears every 2.5 s and stays 7.5 s (at most three at once); the banners
  start after the last toast has appeared, 4 s each. A portion without toasts and banners (only a team
  correction, only decreases) shows no plate; the cards still count.
- **The snapshot keeps no names** (only ids and numbers) and only the latest season.
- «Герои дня» and gains below half a point are not shown (they would read «+0»).

## Global Constraints

- The engine (`src/engine`), the data files and the admin do not change; a second `computeGameState` per new
  data is the only extra engine cost (< 50 ms on this PC, ARCH-2).
- PERF-1: no endless `requestAnimationFrame`/timers — a clock ticks every 50 ms only while a count or a show
  runs, and stops; plain DOM; CSS animations play once; no `backdrop-filter`, blurred shadows or glow (D-46).
- PERF-3: a hidden tab plays nothing; what came meanwhile waits and plays when the tab is shown.
- `prefers-reduced-motion: reduce`: numbers jump to the result; no flashes and no slide-in.
- Browser storage in `try/catch`; without storage the game works as before (no moments after a reload).
- `?date=` and `?cells=` views: no moments and the stored snapshot is not touched.
- The viewers' initial JS stays under 600 KB gzip (`npm run size`); everything new is in the main chunk —
  small.
- No real names anywhere in the repo; tests use builders and the demo (`tests/fixtures/demo-data`).
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved, the
  push only after the author's «да» (D-3).

## Review Focus

1. **A malformed or foreign snapshot in storage** (another version, missing fields, not JSON) — ignored, the
   game opens as on a first visit — Task 2 test «a malformed snapshot is ignored».
2. **A portion with only decreases or only a team's correction** — no plate, no toasts; the card counts down
   quietly — Task 1 test «decreases are not celebrated» and Task 4 test «a show without gains or unlocks is
   empty».
3. **`?date=` and `?cells=` views** — no plate, the stored snapshot untouched — Task 7 e2e «a look at another
   day changes nothing».
4. **An unlock of an achievement no longer in the config** — skipped in the banners, the rest shown — Task 4
   test «unknown achievements are skipped».
5. **Reduced motion** — the card shows the final points at once, no flash — Task 7 e2e «reduced motion».

---

### Task 1: The snapshot and the events (pure)

**Где смотреть:** спецификация A1, A2; `src/engine/gameState.ts` (`GameState`, `TeamState`, `ManagerState`,
`Unlock`), `src/engine/leaderboard.ts` (`points`, `achievementPoints`, `totals`), `src/data/schemas/season.ts`
(`metrics`, `achievements[].rarity`); тесты-образцы `tests/unit/hud.test.ts`, хелперы
`tests/support/builders.ts`.

**Files:**
- Create: `src/moments/snapshot.ts`, `src/moments/events.ts`
- Test: `tests/unit/moments/events.test.ts`

**Interfaces:**
- Produces:
  - `type Snapshot = { seasonId; key; dataAsOf: string | null; trackLength: number; teams: SnapTeam[];
    managers: SnapManager[]; unlocks: Record<string, number> }`;
  - `snapshotOf(game: GameState, config: SeasonConfig): Snapshot`, `unlockKey(u): string`;
  - `type Gain = { managerId; teamId; points; metrics: Record<string, number>; bonus }`;
  - `type MomentEvent` (kinds `team_points`, `gain`, `gate`, `overtake`, `leader`, `finish`, `achievement`);
  - `diffMoments(before: Snapshot, after: Snapshot, unlocks: Unlock[], config: SeasonConfig): MomentEvent[]`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/moments/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Unlock } from '../../../src/engine/gameState.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { diffMoments, type MomentEvent } from '../../../src/moments/events.ts';
import { snapshotOf, type Snapshot } from '../../../src/moments/snapshot.ts';
import { at, daily, makeConfig, manager, team } from '../../support/builders.ts';

const config = makeConfig({
  teams: [team('t1', 1), team('t2', 2), team('t3', 3)],
  managers: [
    manager('a', 't1', { fullName: 'Борисова Анна' }),
    manager('b', 't1', { fullName: 'Абрамов Иван' }),
    manager('c', 't2', { fullName: 'Волков Пётр' }),
  ],
  achievements: [
    {
      id: 'hat',
      title: 'Хет-трик',
      description: '',
      icon: 'hat',
      scope: 'manager',
      rarity: 'common',
      rule: { type: 'threshold', metric: 'inv6', period: 'day', op: '>=', value: 3 },
      repeatable: 'daily',
      bonusPoints: 0,
      enabled: true,
    },
    {
      id: 'legend',
      title: 'Легенда',
      description: '',
      icon: 'legend',
      scope: 'manager',
      rarity: 'legendary',
      rule: { type: 'threshold', metric: 'pay', period: 'day', op: '>=', value: 5 },
      repeatable: false,
      bonusPoints: 0,
      enabled: true,
    },
  ],
});

const A = { managerId: 'a', teamId: 't1', points: 30, achievementPoints: 0, totals: { inv6: 10, inv20: 5, pay: 0 } };
const B = { managerId: 'b', teamId: 't1', points: 10, achievementPoints: 0, totals: { inv6: 4, inv20: 2, pay: 0 } };

/** A snapshot by hand: three teams, two operators, a 20-cell track. */
function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seasonId: 'test-season',
    key: 'test-season|20|30|inv20:3,inv6:1,pay:10',
    dataAsOf: '2026-10-13T10:00:00+03:00',
    trackLength: 20,
    teams: [
      { teamId: 't1', position: 4, points: 40, locationIndex: 1 },
      { teamId: 't2', position: 6, points: 60, locationIndex: 2 },
      { teamId: 't3', position: 2, points: 20, locationIndex: 1 },
    ],
    managers: [A, B],
    unlocks: {},
    ...over,
  };
}
const moveTeam = (s: Snapshot, teamId: string, change: Partial<Snapshot['teams'][number]>) => ({
  ...s,
  teams: s.teams.map((t) => (t.teamId === teamId ? { ...t, ...change } : t)),
});
const kinds = (events: MomentEvent[]) => events.map((e) => e.kind);
const unlock = (achievementId: string, managerId: string, unlockedAt: string): Unlock => ({
  achievementId,
  managerId,
  unlockedAt,
  source: 'auto',
});

describe('the snapshot (D-56)', () => {
  it('keeps cells, points and numbers by id — no names — and counts unlocks per key', () => {
    const game = computeGameState(
      {
        config,
        records: [daily('a', '2026-10-06', { inv6: 3, inv20: 1, pay: 0 })],
        adjustments: [],
        imports: [],
      },
      at('2026-10-07'),
    );
    const s = snapshotOf(game, config);
    expect(s.seasonId).toBe('test-season');
    expect(s.key).toBe(
      `test-season|${game.track.trackLength}|${game.track.maxPosition}|inv20:3,inv6:1,pay:10`,
    );
    expect(s.teams.map((t) => t.teamId)).toEqual(['t1', 't2', 't3']);
    expect(s.managers.find((m) => m.managerId === 'a')).toMatchObject({
      teamId: 't1',
      points: 6,
      totals: { inv6: 3, inv20: 1, pay: 0 },
    });
    expect(JSON.stringify(s)).not.toContain('Борисова');
    expect(s.unlocks).toEqual({ 'hat|a|': 1 });
  });
});

describe('the events of «было → стало» (D-56)', () => {
  it("a team's points: «было → стало» with the cells", () => {
    const after = moveTeam(snap(), 't1', { points: 52, position: 5 });
    expect(diffMoments(snap(), after, [], config)).toContainEqual({
      kind: 'team_points',
      teamId: 't1',
      from: 40,
      to: 52,
      cellsFrom: 4,
      cellsTo: 5,
    });
  });

  it('who brought points: the grown metrics and bonus, largest first, ties by name', () => {
    const after = snap({
      managers: [
        { managerId: 'a', teamId: 't1', points: 34, achievementPoints: 0, totals: { inv6: 12, inv20: 5, pay: 0 } },
        { managerId: 'b', teamId: 't1', points: 14, achievementPoints: 2, totals: { inv6: 6, inv20: 2, pay: 0 } },
        { managerId: 'c', teamId: 't2', points: 4, achievementPoints: 0, totals: { inv6: 4, inv20: 0, pay: 0 } },
      ],
    });
    const gains = diffMoments(snap(), after, [], config).filter((e) => e.kind === 'gain');
    // «Абрамов» (b) and «Борисова» (a) brought 4 each; «Волков» (c) is new — from 0.
    expect(gains).toEqual([
      { kind: 'gain', managerId: 'b', teamId: 't1', points: 4, metrics: { inv6: 2 }, bonus: 2 },
      { kind: 'gain', managerId: 'a', teamId: 't1', points: 4, metrics: { inv6: 2 }, bonus: 0 },
      { kind: 'gain', managerId: 'c', teamId: 't2', points: 4, metrics: { inv6: 4 }, bonus: 0 },
    ]);
  });

  it('a correction by points has no metrics', () => {
    const after = snap({ managers: [{ ...A, points: 35 }, B] });
    expect(diffMoments(snap(), after, [], config).filter((e) => e.kind === 'gain')).toEqual([
      { kind: 'gain', managerId: 'a', teamId: 't1', points: 5, metrics: {}, bonus: 0 },
    ]);
  });

  it('decreases are not celebrated: the team counts down, nobody «brought» anything', () => {
    const after = moveTeam(
      snap({ managers: [{ ...A, points: 20 }, B] }),
      't1',
      { points: 30, position: 3 },
    );
    expect(kinds(diffMoments(snap(), after, [], config))).toEqual(['team_points']);
  });

  it('another season, track or weights: no events', () => {
    const after = moveTeam(snap({ key: 'other' }), 't1', { points: 99, position: 9 });
    expect(diffMoments(snap(), after, [], config)).toEqual([]);
  });

  it('a gate: a team moved forward into a later location', () => {
    const after = moveTeam(snap(), 't1', { position: 6, points: 60, locationIndex: 2 });
    expect(diffMoments(snap(), after, [], config)).toContainEqual({
      kind: 'gate',
      teamId: 't1',
      locationIndex: 2,
    });
    const back = moveTeam(snap(), 't2', { position: 4, points: 40, locationIndex: 1 });
    expect(kinds(diffMoments(snap(), back, [], config))).not.toContain('gate');
  });

  it('an overtake: strictly ahead of a team that was strictly ahead; the same cell is not one', () => {
    const passed = moveTeam(snap(), 't1', { position: 7, points: 70, locationIndex: 2 });
    expect(diffMoments(snap(), passed, [], config)).toContainEqual({
      kind: 'overtake',
      teamId: 't1',
      passed: ['t2'],
    });
    const level = moveTeam(snap(), 't1', { position: 6, points: 60, locationIndex: 2 });
    expect(kinds(diffMoments(snap(), level, [], config))).not.toContain('overtake');
    // t2 pushed back behind t1 by a correction: t1 did not move — no overtake.
    const pushed = moveTeam(snap(), 't2', { position: 3, points: 30, locationIndex: 1 });
    expect(kinds(diffMoments(snap(), pushed, [], config))).not.toContain('overtake');
  });

  it('a new leader: alone first now and not before; a tie at the top or a pushed-back rival is none', () => {
    const lead = moveTeam(snap(), 't1', { position: 7, points: 70, locationIndex: 2 });
    expect(diffMoments(snap(), lead, [], config)).toContainEqual({ kind: 'leader', teamId: 't1' });
    const tie = moveTeam(snap(), 't1', { position: 6, points: 60, locationIndex: 2 });
    expect(kinds(diffMoments(snap(), tie, [], config))).not.toContain('leader');
    const fromTie = moveTeam(tie, 't1', { position: 8, points: 80 });
    expect(diffMoments(tie, fromTie, [], config)).toContainEqual({ kind: 'leader', teamId: 't1' });
    const still = moveTeam(snap(), 't2', { position: 9, points: 90, locationIndex: 2 });
    expect(kinds(diffMoments(snap(), still, [], config))).not.toContain('leader');
    const pushed = moveTeam(snap(), 't2', { position: 3, points: 30, locationIndex: 1 });
    expect(kinds(diffMoments(snap(), pushed, [], config))).not.toContain('leader');
  });

  it('the finish: a team reached the track length', () => {
    const before = moveTeam(snap(), 't2', { position: 19, points: 190, locationIndex: 4 });
    const after = moveTeam(before, 't2', { position: 21, points: 210 });
    expect(diffMoments(before, after, [], config)).toContainEqual({ kind: 'finish', teamId: 't2' });
    expect(kinds(diffMoments(after, moveTeam(after, 't2', { position: 22, points: 220 }), [], config))).not.toContain('finish');
  });

  it('achievements by count per key: a moved date shows nothing again; by date, then rarity', () => {
    const before = snap({ unlocks: { 'hat|a|': 1 } });
    const moved = [unlock('hat', 'a', '2026-10-09')];
    expect(diffMoments(before, snap({ unlocks: { 'hat|a|': 1 } }), moved, config)).toEqual([]);
    const unlocks = [
      unlock('hat', 'a', '2026-10-06'),
      unlock('hat', 'a', '2026-10-13'),
      unlock('hat', 'b', '2026-10-13'),
      unlock('legend', 'b', '2026-10-13'),
    ];
    const after = snap({ unlocks: { 'hat|a|': 2, 'hat|b|': 1, 'legend|b|': 1 } });
    const events = diffMoments(before, after, unlocks, config).filter(
      (e) => e.kind === 'achievement',
    );
    expect(events.map((e) => (e.kind === 'achievement' ? e.unlock : null))).toEqual([
      unlock('legend', 'b', '2026-10-13'),
      unlock('hat', 'a', '2026-10-13'),
      unlock('hat', 'b', '2026-10-13'),
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/moments/events.test.ts`
Expected: FAIL — `src/moments/events.ts` and `src/moments/snapshot.ts` cannot be resolved.

- [ ] **Step 3: The snapshot** — `src/moments/snapshot.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState, Unlock } from '../engine/gameState.ts';

export type SnapTeam = { teamId: string; position: number; points: number; locationIndex: number };
export type SnapManager = {
  managerId: string;
  /** The operator's team today. */
  teamId: string;
  points: number;
  achievementPoints: number;
  totals: Record<string, number>;
};

/**
 * What a screen showed (D-56): enough to tell «было» from «стало» — the teams' cells and points, the
 * operators' points and numbers, how many of each achievement. Ids and numbers only, no names: it is kept
 * in the browser's storage.
 */
export type Snapshot = {
  seasonId: string;
  /** The season, the track's length and end, the weights: another key — no moments, a new snapshot. */
  key: string;
  /** The latest import the screen showed (FR-LB-4). */
  dataAsOf: string | null;
  trackLength: number;
  teams: SnapTeam[];
  managers: SnapManager[];
  /** Unlocks per `achievementId|managerId|teamId`. */
  unlocks: Record<string, number>;
};

export const unlockKey = (u: Pick<Unlock, 'achievementId' | 'managerId' | 'teamId'>): string =>
  `${u.achievementId}|${u.managerId ?? ''}|${u.teamId ?? ''}`;

export function snapshotOf(game: GameState, config: SeasonConfig): Snapshot {
  const weights = [...config.metrics]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => `${m.id}:${m.weight}`)
    .join(',');
  const unlocks: Record<string, number> = {};
  for (const u of game.unlocks) unlocks[unlockKey(u)] = (unlocks[unlockKey(u)] ?? 0) + 1;
  return {
    seasonId: config.id,
    key: `${config.id}|${game.track.trackLength}|${game.track.maxPosition}|${weights}`,
    dataAsOf: game.dataAsOf,
    trackLength: game.track.trackLength,
    teams: game.teams.map((t) => ({
      teamId: t.teamId,
      position: t.position,
      points: t.points,
      locationIndex: t.locationIndex,
    })),
    managers: game.managers.map((m) => ({
      managerId: m.managerId,
      teamId: m.teamId,
      points: m.points,
      achievementPoints: m.achievementPoints,
      totals: { ...m.totals },
    })),
    unlocks,
  };
}
```

- [ ] **Step 4: The events** — `src/moments/events.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { Unlock } from '../engine/gameState.ts';
import { unlockKey, type SnapTeam, type Snapshot } from './snapshot.ts';

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
    gains.push({ managerId: m.managerId, teamId: m.teamId, points, metrics, bonus: bonus > EPS ? bonus : 0 });
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
  for (const { t, b } of moved) {
    if (t.locationIndex > b.locationIndex)
      events.push({ kind: 'gate', teamId: t.teamId, locationIndex: t.locationIndex });
    const passed = after.teams
      .filter((o) => {
        const ob = was.get(o.teamId);
        return o.teamId !== t.teamId && ob !== undefined && ob.position > b.position && t.position > o.position;
      })
      .map((o) => o.teamId);
    if (passed.length > 0) events.push({ kind: 'overtake', teamId: t.teamId, passed });
    if (b.position < after.trackLength && t.position >= after.trackLength)
      events.push({ kind: 'finish', teamId: t.teamId });
  }
  const leader = aloneFirst(after.teams);
  if (leader !== null && leader !== aloneFirst(before.teams) && moved.some(({ t }) => t.teamId === leader))
    events.push({ kind: 'leader', teamId: leader });

  // By count per key: a recompute that moves an old unlock's date shows nothing again.
  const byKey = new Map<string, Unlock[]>();
  for (const u of unlocks) byKey.set(unlockKey(u), [...(byKey.get(unlockKey(u)) ?? []), u]);
  const fresh: Unlock[] = [];
  for (const [key, list] of byKey) {
    const extra = list.length - (before.unlocks[key] ?? 0);
    if (extra > 0)
      fresh.push(...[...list].sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt)).slice(-extra));
  }
  const rarity = new Map(config.achievements.map((a) => [a.id, RARITY[a.rarity]]));
  const rank = (u: Unlock) => rarity.get(u.achievementId) ?? Number.MAX_SAFE_INTEGER;
  fresh.sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt) || rank(a) - rank(b));
  for (const unlock of fresh) events.push({ kind: 'achievement', unlock });
  return events;
}

/** The one team alone in first place, or null (a tie). */
function aloneFirst(teams: SnapTeam[]): string | null {
  const top = Math.max(...teams.map((t) => t.position));
  const first = teams.filter((t) => t.position === top);
  return first.length === 1 ? (first[0]?.teamId ?? null) : null;
}
```

(By the date, then the rarity: of the same day the legendary one comes first; ties keep their order.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/moments/events.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/moments/snapshot.ts src/moments/events.ts tests/unit/moments/events.test.ts
git commit -m "Moments: the snapshot of what a screen showed and the events of «было → стало» — gains, gates, overtakes, the leader, the finish, achievements by count (D-56, plan moments task 1)"
```

---

### Task 2: The memory of the browser, the batches and «Герои дня» in the viewer

**Где смотреть:** спецификация A1, A3; `src/app/viewer.ts` (`update`, `nowFor`, `computedFor`),
`src/data/cache.ts` (хранилище в try/catch — образец), `src/engine/dates.ts` (`addDays`),
`src/engine/gameState.ts` (`computeGameState` «на конец дня» — путь `?date=`, D-35).

**Files:**
- Create: `src/moments/seen.ts`, `src/moments/heroes.ts`, `src/moments/tracker.ts`
- Modify: `src/app/viewer.ts`
- Test: `tests/unit/moments/tracker.test.ts`

**Interfaces:**
- Consumes: Task 1 — `Snapshot`, `snapshotOf`, `diffMoments`, `MomentEvent`.
- Produces:
  - `readSeen(seasonId: string, store?): Snapshot | null`, `writeSeen(s: Snapshot, store?): void` (key
    `sq.seen.v1`);
  - `type Hero = { managerId: string; name: string; teamId: string; points: number }`,
    `heroesOf(now: GameState, then: GameState | null): Hero[]`, `HEROES = 10`;
  - `type Moments = { id: number; kind: 'live' | 'since'; since: string | null; events: MomentEvent[];
    before: { teamId: string; position: number }[] }`;
  - `momentsTracker(seen: { read(seasonId: string): Snapshot | null; write(s: Snapshot): void })` →
    `{ next(game: GameState, config: SeasonConfig): Moments | null }`;
  - `ViewerState.moments: Moments | null`, `ViewerState.heroes: Hero[]`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/moments/tracker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeGameState, type GameState } from '../../../src/engine/gameState.ts';
import { heroesOf, HEROES } from '../../../src/moments/heroes.ts';
import { readSeen, writeSeen } from '../../../src/moments/seen.ts';
import { snapshotOf, type Snapshot } from '../../../src/moments/snapshot.ts';
import { momentsTracker } from '../../../src/moments/tracker.ts';
import { at, daily, makeConfig, manager, team } from '../../support/builders.ts';

const config = makeConfig({
  teams: [team('t1', 1), team('t2', 2)],
  managers: [
    manager('a', 't1', { fullName: 'Борисова Анна' }),
    manager('b', 't2', { fullName: 'Абрамов Иван' }),
  ],
});
const gameWith = (records: Parameters<typeof daily>[2][], day = '2026-10-08'): GameState =>
  computeGameState(
    {
      config,
      records: records.map((v, i) => daily(i % 2 === 0 ? 'a' : 'b', '2026-10-06', v)),
      adjustments: [],
      imports: [],
    },
    at(day),
  );
const g0 = gameWith([{ inv6: 2 }, { inv6: 1 }]);
const g1 = gameWith([{ inv6: 9, pay: 1 }, { inv6: 1 }]);

/** A storage in memory, as the browser's. */
function memory() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    items,
  };
}
const seenIn = (store: ReturnType<typeof memory>) => ({
  read: (id: string) => readSeen(id, store),
  write: (s: Snapshot) => writeSeen(s, store),
});

describe('the memory of what this browser showed (D-56)', () => {
  it('keeps the latest season only; reads it back', () => {
    const store = memory();
    writeSeen(snapshotOf(g0, config), store);
    expect(readSeen('test-season', store)).toEqual(snapshotOf(g0, config));
    expect(readSeen('other', store)).toBeNull();
  });

  it('a malformed snapshot is ignored; a storage that throws is no storage', () => {
    const store = memory();
    store.setItem('sq.seen.v1', '{"test-season":{"seasonId":"test-season","teams":7}}');
    expect(readSeen('test-season', store)).toBeNull();
    store.setItem('sq.seen.v1', 'not json');
    expect(readSeen('test-season', store)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeen('test-season', broken)).toBeNull();
    expect(() => writeSeen(snapshotOf(g0, config), broken)).not.toThrow();
    expect(readSeen('test-season', null)).toBeNull();
  });
});

describe('the batches of moments (D-56)', () => {
  it('the first visit plays nothing and remembers what it showed', () => {
    const store = memory();
    const tracker = momentsTracker(seenIn(store));
    expect(tracker.next(g0, config)).toBeNull();
    expect(readSeen('test-season', store)).toEqual(snapshotOf(g0, config));
  });

  it('over a remembered snapshot: «since» with its time and cells, then «live», ids growing', () => {
    const store = memory();
    writeSeen(snapshotOf(g0, config), store);
    const tracker = momentsTracker(seenIn(store));
    const first = tracker.next(g1, config);
    expect(first).toMatchObject({
      id: 1,
      kind: 'since',
      since: g0.dataAsOf,
      before: g0.teams.map((t) => ({ teamId: t.teamId, position: t.position })),
    });
    expect(first?.events.some((e) => e.kind === 'gain')).toBe(true);
    const second = tracker.next(g0, config);
    expect(second).toMatchObject({ id: 2, kind: 'live' });
    expect(readSeen('test-season', store)).toEqual(snapshotOf(g0, config));
  });

  it('the cache shown first changes nothing: the next batch with events is still «since»', () => {
    const store = memory();
    writeSeen(snapshotOf(g0, config), store);
    const tracker = momentsTracker(seenIn(store));
    expect(tracker.next(g0, config)).toBeNull();
    expect(tracker.next(g1, config)?.kind).toBe('since');
  });

  it('another season reads its own memory', () => {
    const store = memory();
    const tracker = momentsTracker(seenIn(store));
    tracker.next(g0, config);
    const other = { ...config, id: 'other-season' };
    expect(tracker.next(g1, other)).toBeNull();
    expect(readSeen('other-season', store)).not.toBeNull();
  });
});

describe('«Герои дня» (D-56)', () => {
  it('points brought since the end of yesterday, most first, ties by name, the top ten', () => {
    const heroes = heroesOf(g1, g0);
    expect(heroes).toEqual([
      { managerId: 'a', name: 'Борисова Анна', teamId: 't1', points: 17 },
    ]);
    expect(HEROES).toBe(10);
  });

  it('on the first day of the game «then» is nobody: all points count', () => {
    expect(heroesOf(g0, null).map((h) => [h.managerId, h.points])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('less than half a point is not a hero («+0»)', () => {
    expect(heroesOf(g0, g0)).toEqual([]);
  });
});
```

(With the builders' weights inv6 1 and pay 10: «a» went from 2 to 9 + 10 = 19 points — 17 brought.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/moments/tracker.test.ts`
Expected: FAIL — `seen.ts`, `heroes.ts`, `tracker.ts` cannot be resolved.

- [ ] **Step 3: The memory** — `src/moments/seen.ts`:

```ts
import type { Snapshot } from './snapshot.ts';

/**
 * The snapshot this browser showed last (D-56): «Что нового с вашего прошлого визита». One season — the
 * latest — in `localStorage`, every access in try/catch: without storage the game works, it only forgets.
 */
const KEY = 'sq.seen.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readSeen(seasonId: string, store: Store | null = browserStorage()): Snapshot | null {
  try {
    const all = JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, Partial<Snapshot>>;
    const s = all[seasonId];
    const ok =
      s !== undefined &&
      s.seasonId === seasonId &&
      typeof s.key === 'string' &&
      typeof s.trackLength === 'number' &&
      Array.isArray(s.teams) &&
      Array.isArray(s.managers) &&
      typeof s.unlocks === 'object' &&
      s.unlocks !== null;
    return ok ? (s as Snapshot) : null;
  } catch {
    return null;
  }
}

export function writeSeen(snapshot: Snapshot, store: Store | null = browserStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ [snapshot.seasonId]: snapshot }));
  } catch {
    // A full or blocked storage only costs «Что нового» after a reload.
  }
}
```

- [ ] **Step 4: «Герои дня»** — `src/moments/heroes.ts`:

```ts
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
```

- [ ] **Step 5: The batches** — `src/moments/tracker.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { diffMoments, type MomentEvent } from './events.ts';
import { snapshotOf, type Snapshot } from './snapshot.ts';

/** One portion of moments for the screen (D-56). */
export type Moments = {
  /** Grows with every batch: the HUD plays each once. */
  id: number;
  /** `since` — the first batch of a page opened over a remembered snapshot: «Что нового с …». */
  kind: 'live' | 'since';
  /** The data time of «было». */
  since: string | null;
  events: MomentEvent[];
  /** The teams' cells of «было»: on the first show the scene and the scheme walk from them. */
  before: { teamId: string; position: number }[];
};

export type SeenStore = { read(seasonId: string): Snapshot | null; write(s: Snapshot): void };

/**
 * «Было» for every live recompute (D-56): the page's own last snapshot, or — on the first one — what this
 * browser remembered. The new snapshot is remembered at once (a page closed mid-show loses that show).
 */
export function momentsTracker(seen: SeenStore) {
  let shown: Snapshot | null = null;
  let restored = false;
  let id = 0;
  return {
    next(game: GameState, config: SeasonConfig): Moments | null {
      const after = snapshotOf(game, config);
      if (shown === null || shown.seasonId !== after.seasonId) {
        shown = seen.read(after.seasonId);
        restored = shown !== null;
      }
      const before = shown;
      shown = after;
      seen.write(after);
      if (before === null) return null;
      if (before.key !== after.key) restored = false;
      const events = diffMoments(before, after, game.unlocks, config);
      if (events.length === 0) return null;
      const kind = restored ? 'since' : 'live';
      restored = false;
      id += 1;
      return {
        id,
        kind,
        since: before.dataAsOf,
        events,
        before: before.teams.map(({ teamId, position }) => ({ teamId, position })),
      };
    },
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/moments`
Expected: PASS (11 + 10 tests). If the hero numbers differ from the comment's arithmetic, recompute them from
the builders' weights (`makeConfig`: inv6 1, inv20 3, pay 10) and fix the test's numbers — ledger it.

- [ ] **Step 7: The viewer** — `src/app/viewer.ts`:
- imports: `import { addDays } from '../engine/dates.ts';`, `import { heroesOf, type Hero } from
  '../moments/heroes.ts';`, `import { readSeen, writeSeen } from '../moments/seen.ts';`,
  `import { momentsTracker, type Moments } from '../moments/tracker.ts';`;
- `ViewerState` gains:

```ts
  /** The latest batch of moments of the live view (D-56); the HUD plays each batch once. */
  moments: Moments | null;
  /** «Герои дня»: who brought most points since the end of yesterday (D-56). */
  heroes: Hero[];
```

- the initial store value gains `moments: null, heroes: []`;
- in `startViewer`, after `let sync …`: `const tracker = momentsTracker({ read: readSeen, write: writeSeen });`;
- `update` becomes:

```ts
  const update = (next: SyncState) => {
    const state = store.get();
    let { game, computeMs, error, moments, heroes } = state;
    if (next.phase === 'ready') {
      const now = nowFor(state.date);
      const key = `${next.loaded.version.rev}|${now.slice(0, 10)}|${state.cells ?? ''}`;
      if (key !== computedFor) {
        computedFor = key;
        try {
          const started = performance.now();
          const { input } = next.loaded;
          const track = {
            ...input.config.track,
            cellsPerWorkingDay: state.cells ?? input.config.track.cellsPerWorkingDay,
          };
          game = computeGameState({ ...input, config: { ...input.config, track } }, now);
          computeMs = performance.now() - started;
          // «Герои дня» (D-56): the same engine as of the end of yesterday (the path of `?date=`, D-35).
          const yesterday = addDays(now.slice(0, 10), -1);
          heroes = heroesOf(
            game,
            yesterday < input.config.period.start ? null : computeGameState(input, nowFor(yesterday)),
          );
          // Moments are news of the live view; another day or cell count is a look (D-56).
          if (state.date === null && state.cells === null)
            moments = tracker.next(game, input.config) ?? moments;
          error = null;
        } catch (e) {
          // The polling goes on: data fixed by the admin is picked up at the next check.
          game = null;
          heroes = [];
          error = `не получилось посчитать игру: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } else if (next.phase !== 'loading') {
      game = null;
      heroes = [];
      error = null;
      computedFor = '';
    }
    store.set({ ...state, sync: next, game, computeMs, error, moments, heroes });
  };
```

- [ ] **Step 8: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green
(the HUD does not read the new fields yet).

- [ ] **Step 9: Commit**

```bash
git add src/moments/seen.ts src/moments/heroes.ts src/moments/tracker.ts src/app/viewer.ts tests/unit/moments/tracker.test.ts
git commit -m "Moments: the browser remembers what it showed, the viewer numbers the batches («since» / «live») and counts «Герои дня» as of the end of yesterday (D-56, plan moments task 2)"
```

---

### Task 3: The team card — the points counting up, «до шага», the flash

**Где смотреть:** спецификация A4 «The team card», A5; `src/hud/Hud.tsx` (`TeamCards`), `src/hud/rating.ts`
(`pointsText`, `barShare`), `src/hud/theme.css` (`.sq-bar`, токены), `src/engine/progress.ts`
(`placeFromData`: клетка = `floor(progress × trackLength + EPS)` или `floor(points / pointsPerStep + EPS)`),
`src/scheme/Scheme.tsx` (`useMoves` — часы только при видимой вкладке, образец).

**Files:**
- Create: `src/hud/cards.ts`, `src/hud/clock.ts`
- Modify: `src/hud/Hud.tsx`, `src/hud/theme.css`, `src/app/App.tsx`
- Test: `tests/unit/hudMoments.test.ts`

**Interfaces:**
- Consumes: Task 2 — `Moments` (its `team_points` events), `ViewerState.moments`.
- Produces:
  - `nextStep(team, config, track): { share: number; left: number } | null`, `stepLeftText(left): string`
    (`src/hud/cards.ts`);
  - `countAt(from, to, ms: number | null, duration?): number`, `COUNT_MS = 1500`, `BADGE_MS = 4000`
    (`src/hud/cards.ts`);
  - `useVisibleClock(run: number | null, until: number): number | null`, `reducedMotion(): boolean`
    (`src/hud/clock.ts`);
  - `HudProps.moments: Moments | null`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/hudMoments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countAt, nextStep, stepLeftText } from '../../src/hud/cards.ts';

const track = { trackLength: 20, maxPosition: 30 };
const plan = { progressMode: 'plan_percent' as const, pointsPerStep: undefined };

describe('«до шага» on the card (D-56)', () => {
  it('the share of the way to the next cell from the data, and the points left', () => {
    // A plan of 100 points over 20 cells: 5 points a cell; 12 points — 2 cells and 2 of 5.
    const s = nextStep({ points: 12, targetPoints: 100, position: 2 }, plan, track);
    expect(s?.share).toBeCloseTo(0.4);
    expect(s?.left).toBeCloseTo(3);
    expect(nextStep({ points: 10, targetPoints: 100, position: 2 }, plan, track)).toEqual({
      share: 0,
      left: 5,
    });
  });

  it('in the absolute mode by the points of a step', () => {
    const absolute = { progressMode: 'absolute' as const, pointsPerStep: 10 };
    const s = nextStep({ points: 25, targetPoints: 100, position: 2 }, absolute, track);
    expect(s?.share).toBeCloseTo(0.5);
    expect(s?.left).toBeCloseTo(5);
  });

  it('none at the end of the overflow zone or without a plan', () => {
    expect(nextStep({ points: 400, targetPoints: 100, position: 30 }, plan, track)).toBeNull();
    expect(nextStep({ points: 0, targetPoints: 0, position: 0 }, plan, track)).toBeNull();
  });

  it('the points left read as a whole number, at least 1', () => {
    expect(stepLeftText(3)).toBe('3');
    expect(stepLeftText(0.2)).toBe('1');
    expect(stepLeftText(1234.4)).toBe((1235).toLocaleString('ru-RU'));
  });
});

describe('counting up (D-56)', () => {
  it('from «было» to «стало», easing out; before the start it shows «было»', () => {
    expect(countAt(380, 392, null)).toBe(380);
    expect(countAt(380, 392, 0)).toBe(380);
    expect(countAt(380, 392, 1500)).toBe(392);
    expect(countAt(380, 392, 99_999)).toBe(392);
    const mid = countAt(380, 392, 750);
    expect(mid).toBeGreaterThan(386);
    expect(mid).toBeLessThan(392);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/hudMoments.test.ts`
Expected: FAIL — `src/hud/cards.ts` cannot be resolved.

- [ ] **Step 3: The pure part** — `src/hud/cards.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { TeamState } from '../engine/gameState.ts';
import type { Track } from '../engine/track.ts';

/** The points of a portion count from «было» to «стало» this long (D-56). */
export const COUNT_MS = 1500;
/** The green «+12» and the flash of the card stay this long. */
export const BADGE_MS = 4000;

const EPS = 1e-9;

/**
 * The way to the next cell from the data (D-56): its share (the thin bar «до шага») and the points left.
 * The cell of the data is `floor(points / perCell + EPS)` as the engine counts it; admin steps and resets
 * move the figure, not the way to its next cell. None at the end of the overflow zone or without a plan.
 */
export function nextStep(
  team: Pick<TeamState, 'points' | 'targetPoints' | 'position'>,
  config: Pick<SeasonConfig, 'progressMode' | 'pointsPerStep'>,
  track: Pick<Track, 'trackLength' | 'maxPosition'>,
): { share: number; left: number } | null {
  if (team.position >= track.maxPosition) return null;
  const perCell =
    config.progressMode === 'absolute'
      ? (config.pointsPerStep ?? 0)
      : team.targetPoints / track.trackLength;
  if (!(perCell > 0)) return null;
  const cells = team.points / perCell;
  const whole = Math.floor(cells + EPS);
  return { share: Math.max(0, cells - whole), left: (whole + 1) * perCell - team.points };
}

/** «14» — the points left to the next cell, whole, at least 1. */
export function stepLeftText(left: number): string {
  return Math.max(1, Math.ceil(left - 1e-6)).toLocaleString('ru-RU');
}

/** The number shown `ms` after a count began (null — not yet): from «было» to «стало», easing out. */
export function countAt(from: number, to: number, ms: number | null, duration = COUNT_MS): number {
  if (ms === null) return from;
  const f = Math.min(1, Math.max(0, ms / duration));
  return from + (to - from) * (1 - (1 - f) ** 3);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/hudMoments.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: The clock** — `src/hud/clock.ts`:

```ts
import { useEffect, useState } from 'react';

/** How often a running count or show reads its clock: the DOM changes this often, no frame loop. */
const TICK_MS = 50;

/**
 * Milliseconds since `run` began, counted only while the tab is visible (PERF-3: a hidden tab keeps the
 * moment for later), up to `until`, then the timer stops (PERF-1). Null before the first visible tick
 * and without a run.
 */
export function useVisibleClock(run: number | null, until: number): number | null {
  const [clock, setClock] = useState<{ run: number | null; ms: number }>({ run: null, ms: 0 });
  useEffect(() => {
    if (run === null) return;
    let ms = 0;
    let started = false;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible') {
        if (started) ms += now - last;
        started = true;
        setClock({ run, ms: Math.min(ms, until) });
        if (ms >= until) window.clearInterval(timer);
      }
      last = now;
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [run, until]);
  return run !== null && clock.run === run ? clock.ms : null;
}

/** The viewer asked the system for less motion: numbers jump, nothing flashes (D-56). */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: The card** — `src/hud/Hud.tsx`:
- imports: `import type { Moments } from '../moments/tracker.ts';`, `import type { TeamState } from
  '../engine/gameState.ts';` (beside `GameState`), `import type { Track } from '../engine/track.ts';`,
  `import { BADGE_MS, countAt, nextStep, stepLeftText } from './cards.ts';`, `import { reducedMotion,
  useVisibleClock } from './clock.ts';`;
- `HudProps` gains `/** The latest batch of moments (D-56). */ moments: Moments | null;`;
- in `Hud`: `<TeamCards game={game} config={config} moments={props.moments} />`;
- `TeamCards` becomes:

```tsx
function TeamCards({
  game,
  config,
  moments,
}: {
  game: GameState;
  config: SeasonConfig;
  moments: Moments | null;
}) {
  const teams = useMemo(() => new Map(config.teams.map((t) => [t.id, t])), [config.teams]);
  const locations = useMemo(
    () => new Map(config.locations.map((l) => [l.index, l.title])),
    [config.locations],
  );
  // A team's points «было → стало» of the latest batch: its card counts them up (D-56).
  const gains = useMemo(
    () =>
      new Map(
        (moments?.events ?? []).flatMap((e) =>
          e.kind === 'team_points' ? [[e.teamId, { from: e.from, to: e.to }] as const] : [],
        ),
      ),
    [moments],
  );
  const { track } = game;
  return (
    <ul className="grid grid-cols-3 gap-1.5 lg:grid-cols-6" aria-label="Команды">
      {game.teams.map((t) => {
        const team = teams.get(t.teamId);
        const where =
          t.position > track.trackLength
            ? 'за финишем'
            : t.position === track.trackLength
              ? 'на финише'
              : (locations.get(t.locationIndex) ?? '');
        return (
          <TeamCard
            key={t.teamId}
            team={t}
            name={team?.leaderName ?? ''}
            color={team?.color ?? '#888888'}
            where={where}
            track={track}
            config={config}
            gain={gains.get(t.teamId) ?? null}
            run={moments?.id ?? null}
          />
        );
      })}
    </ul>
  );
}

function TeamCard({
  team: t,
  name,
  color,
  where,
  track,
  config,
  gain,
  run,
}: {
  team: TeamState;
  name: string;
  color: string;
  where: string;
  track: Track;
  config: SeasonConfig;
  gain: { from: number; to: number } | null;
  run: number | null;
}) {
  // The points of a portion run from «было» to «стало»; a hidden tab waits (PERF-3).
  const ms = useVisibleClock(gain ? run : null, BADGE_MS);
  const still = reducedMotion();
  const points = gain && !still ? countAt(gain.from, gain.to, ms) : t.points;
  const up = gain ? Math.round(gain.to - gain.from) : 0;
  const fresh = up > 0 && ms !== null && ms < BADGE_MS;
  const step = nextStep(t, config, track);
  const percent = Math.floor(t.progress * 100);
  return (
    <li className="sq-panel sq-panel-tight relative grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-2 px-2 pt-1 pb-1.5">
      {fresh && !still && (
        <span key={run} className="sq-flash" style={{ color }} aria-hidden="true" />
      )}
      <Crest color={color} className="row-span-2" />
      <div className="sq-name truncate text-[15px]">{name}</div>
      <div className="sq-bar mt-1 mb-0.5">
        <div
          className="sq-bar-fill"
          style={{ width: `${barShare(t.progress) * 100}%`, backgroundColor: color }}
        />
        <span className="sq-bar-text">
          клетка {t.position} из {track.trackLength} · {percent}%
          <span className="sr-only"> плана</span>
        </span>
      </div>
      <div className="col-span-2 mt-1 flex items-baseline gap-1.5 text-[12.5px]">
        <span className="sq-bright">{pointsText(points)}</span>
        {step && <span className="sq-muted">· до шага ещё {stepLeftText(step.left)}</span>}
        {fresh && <span className="sq-gain">+{up}</span>}
      </div>
      {step && (
        <div className="sq-bar-step col-span-2" aria-hidden="true">
          <div style={{ width: `${step.share * 100}%`, backgroundColor: color }} />
        </div>
      )}
      <div className={`col-span-2 mt-0.5 text-[12.5px] sq-pace-${paceTone(t.deltaVsPace)}`}>
        {paceText(t.deltaVsPace)}
      </div>
      <div className="sq-dim col-span-2 text-xs">
        {where} · {t.members} {plural(t.members, 'человек', 'человека', 'человек')}
      </div>
    </li>
  );
}
```

- [ ] **Step 7: The styles** — at the end of the `@layer components` block of `src/hud/theme.css`:

```css
  /* Moments (D-56): short, once — never an endless animation; with reduced motion, none at all. */
  .sq-bar-step {
    position: relative;
    height: 4px;
    margin-top: 3px;
    background: #0c0806;
    border: 1px solid var(--sq-edge);
  }
  .sq-bar-step > div {
    position: absolute;
    inset: 0 auto 0 0;
    opacity: 0.8;
    transition: width 1.5s ease-out;
  }
  .sq-gain {
    color: var(--sq-up);
    font-weight: 700;
  }
  .sq-flash {
    position: absolute;
    inset: -4px;
    border: 2px solid currentColor;
    opacity: 0;
    pointer-events: none;
    animation: sq-flash 1.5s ease-out;
  }
  @keyframes sq-flash {
    20% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sq-flash {
      display: none;
    }
    .sq-bar-step > div {
      transition: none;
    }
  }
```

- [ ] **Step 8: The map passes the moments** — `src/app/App.tsx`, in `<Hud …>`: `moments={state.moments}`.

- [ ] **Step 9: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green. If
`react-hooks` lint flags a rule in `TeamCard`/`useVisibleClock`, follow the existing pattern of
`src/scheme/Scheme.tsx` `useMoves` (state set only inside the interval callback) and ledger the change.

- [ ] **Step 10: Commit**

```bash
git add src/hud/cards.ts src/hud/clock.ts src/hud/Hud.tsx src/hud/theme.css src/app/App.tsx tests/unit/hudMoments.test.ts
git commit -m "HUD: the team card counts the points of a portion up, «N баллов · до шага ещё M» with a thin bar, a flash in the team's colour (D-56, plan moments task 3)"
```

---

### Task 4: The plate, «кто принёс баллы» and the achievement banners

**Где смотреть:** спецификация A4 (тосты, надпись, баннеры), A5; SPEC ACH-5; `src/hud/Hud.tsx` (корень HUD:
`absolute inset-0 … p-3`, верхняя панель, рейтинг справа), `src/hud/rating.ts` (`shortTime`, `plural`),
`src/data/schemas/achievements.ts` (`title`, `description`, `rarity`).

**Files:**
- Create: `src/hud/moments.ts`, `src/hud/Moments.tsx`
- Modify: `src/hud/Hud.tsx`, `src/hud/theme.css`
- Test: `tests/unit/hudMoments.test.ts`

**Interfaces:**
- Consumes: Task 2 — `Moments`; Task 3 — `useVisibleClock`, `reducedMotion`, `countAt`.
- Produces: `showOf(m: Moments, game: GameState, config: SeasonConfig): Show`,
  `timeline(show: Show): Timeline`, `at(line: Timeline, ms: number)`, constants `TOASTS = 5`, `BANNERS = 6`,
  `TOAST_EVERY_MS = 2500`, `TOAST_MS = 7500`, `BANNER_MS = 4000`, `TOAST_COUNT_MS = 1200`;
  `MomentsLayer({ moments, game, config })`.

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/hudMoments.test.ts` (imports:
`computeGameState` from the engine, `at as onDay`, `makeConfig`, `manager`, `team` from the builders,
`showOf`, `timeline`, `at`, `TOASTS` from `src/hud/moments.ts`, `type Moments` from
`src/moments/tracker.ts`, `type MomentEvent` from `src/moments/events.ts`):

```ts
describe('the show of a batch (D-56)', () => {
  const config = makeConfig({
    teams: [
      team('t1', 1, { leaderName: 'Руководитель Один', color: '#aa0000' }),
      team('t2', 2, { color: '#0000aa' }),
    ],
    managers: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) =>
      manager(id, id === 'g' ? 't2' : 't1', { fullName: `Оператор ${id.toUpperCase()}` }),
    ),
    achievements: [
      {
        id: 'hat',
        title: 'Хет-трик',
        description: 'Три счёта за день',
        icon: 'hat',
        scope: 'manager',
        rarity: 'rare',
        rule: { type: 'threshold', metric: 'inv6', period: 'day', op: '>=', value: 3 },
        repeatable: 'daily',
        bonusPoints: 0,
        enabled: true,
      },
      {
        id: 'all',
        title: 'Все в деле',
        description: '',
        icon: 'all',
        scope: 'team',
        rarity: 'epic',
        rule: { type: 'team_all_members', metric: 'inv6', minEach: 1, period: 'week' },
        repeatable: false,
        bonusPoints: 0,
        enabled: true,
      },
    ],
  });
  const game = computeGameState({ config, records: [], adjustments: [], imports: [] }, onDay('2026-10-14'));
  const gain = (managerId: string, points: number, metrics = {}, bonus = 0): MomentEvent => ({
    kind: 'gain',
    managerId,
    teamId: managerId === 'g' ? 't2' : 't1',
    points,
    metrics,
    bonus,
  });
  const batch = (events: MomentEvent[], over: Partial<Moments> = {}): Moments => ({
    id: 7,
    kind: 'live',
    since: null,
    events,
    before: [],
    ...over,
  });

  it('toasts: the top five with their numbers by the config titles, then «и ещё N операторов — +M баллов»', () => {
    const show = showOf(
      batch([
        gain('a', 7, { inv6: 2, inv20: 1 }, 2),
        gain('b', 6, { pay: 1 }),
        gain('c', 5),
        gain('d', 4),
        gain('e', 3),
        gain('f', 2),
        gain('g', 1),
      ]),
      game,
      config,
    );
    expect(show.toasts).toHaveLength(TOASTS + 1);
    expect(show.toasts[0]).toEqual({
      kind: 'gain',
      key: 'gain-a',
      name: 'Оператор A',
      color: '#aa0000',
      points: 7,
      details: 'Качественные счета +2 · Разговоры от 20 минут +1 · ачивки +2',
    });
    expect(show.toasts[2]).toMatchObject({ name: 'Оператор C', details: '' });
    expect(show.toasts[TOASTS]).toEqual({
      kind: 'more',
      key: 'more',
      text: 'и ещё 2 оператора — +3 балла',
    });
  });

  it('the plate: «Новые данные от …», «Что нового с …»', () => {
    // The builders' game has no imports: its data time reads «—».
    expect(showOf(batch([gain('a', 1)]), game, config).plate).toBe('Новые данные от —');
    expect(
      showOf(batch([gain('a', 1)], { kind: 'since', since: '2026-10-12T18:40:00+03:00' }), game, config)
        .plate,
    ).toBe('Что нового с 12.10 18:40');
    expect(showOf(batch([gain('a', 1)], { kind: 'since', since: null }), game, config).plate).toBe(
      'Что нового с прошлого визита',
    );
  });

  it('banners: who, what, how rare; a team achievement names the team; unknown achievements are skipped', () => {
    const show = showOf(
      batch([
        { kind: 'achievement', unlock: { achievementId: 'hat', managerId: 'a', unlockedAt: '2026-10-13', source: 'auto' } },
        { kind: 'achievement', unlock: { achievementId: 'gone', managerId: 'a', unlockedAt: '2026-10-13', source: 'auto' } },
        { kind: 'achievement', unlock: { achievementId: 'all', teamId: 't1', unlockedAt: '2026-10-13', source: 'auto' } },
      ]),
      game,
      config,
    );
    expect(show.banners).toEqual([
      {
        kind: 'achievement',
        key: 'ach-0-hat',
        title: 'Хет-трик',
        description: 'Три счёта за день',
        rarity: 'rare',
        who: 'Оператор A',
        color: '#aa0000',
      },
      {
        kind: 'achievement',
        key: 'ach-1-all',
        title: 'Все в деле',
        description: '',
        rarity: 'epic',
        who: 'команда Руководитель Один',
        color: '#aa0000',
      },
    ]);
  });

  it('more than six banners: «и ещё N ачивок»', () => {
    const many = Array.from({ length: 8 }, (): MomentEvent => ({
      kind: 'achievement',
      unlock: { achievementId: 'hat', managerId: 'a', unlockedAt: '2026-10-13', source: 'auto' },
    }));
    const show = showOf(batch(many), game, config);
    expect(show.banners).toHaveLength(7);
    expect(show.banners[6]).toEqual({ kind: 'more', key: 'more', text: 'и ещё 2 ачивки' });
  });

  it('a show without gains or unlocks is empty: only a team correction, only decreases, gates', () => {
    const show = showOf(
      batch([
        { kind: 'team_points', teamId: 't1', from: 50, to: 40, cellsFrom: 5, cellsTo: 4 },
        { kind: 'gate', teamId: 't2', locationIndex: 2 },
        gain('a', 0.4),
      ]),
      game,
      config,
    );
    expect([show.toasts, show.banners]).toEqual([[], []]);
  });

  it('the timeline: a toast every 2.5 s for 7.5 s (three at most), then banners of 4 s', () => {
    const show = showOf(
      batch([
        gain('a', 5),
        gain('b', 4),
        gain('c', 3),
        gain('d', 2),
        { kind: 'achievement', unlock: { achievementId: 'hat', managerId: 'a', unlockedAt: '2026-10-13', source: 'auto' } },
      ]),
      game,
      config,
    );
    const line = timeline(show);
    expect(line.toasts.map((t) => [t.start, t.end])).toEqual([
      [0, 7500],
      [2500, 10000],
      [5000, 12500],
      [7500, 15000],
    ]);
    expect(line.banners.map((b) => [b.start, b.end])).toEqual([[10000, 14000]]);
    expect(line.end).toBe(15000);
    expect(at(line, 6000).toasts).toHaveLength(3);
    expect(at(line, 11000)).toMatchObject({ toasts: [{}, {}], banners: [{}] });
    expect(at(line, 15000)).toEqual({ toasts: [], banners: [] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/hudMoments.test.ts`
Expected: FAIL — `src/hud/moments.ts` cannot be resolved.

- [ ] **Step 3: The pure show** — `src/hud/moments.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import type { Gain } from '../moments/events.ts';
import type { Moments } from '../moments/tracker.ts';
import { plural, shortTime } from './rating.ts';

export type Rarity = SeasonConfig['achievements'][number]['rarity'];
export type ToastItem =
  | { kind: 'gain'; key: string; name: string; color: string; points: number; details: string }
  | { kind: 'more'; key: 'more'; text: string };
export type BannerItem =
  | {
      kind: 'achievement';
      key: string;
      title: string;
      description: string;
      rarity: Rarity;
      who: string;
      color: string;
    }
  | { kind: 'more'; key: 'more'; text: string };
/** What a batch shows (D-56): the plate, «кто принёс баллы», then the banners of achievements. */
export type Show = { id: number; plate: string; toasts: ToastItem[]; banners: BannerItem[] };

export const TOASTS = 5;
export const BANNERS = 6;
export const TOAST_EVERY_MS = 2500;
export const TOAST_MS = 7500;
export const BANNER_MS = 4000;
/** The points of a toast run up this long. */
export const TOAST_COUNT_MS = 1200;

const GREY = '#888888';
const num = (n: number) => Math.round(n).toLocaleString('ru-RU');

export function showOf(m: Moments, game: GameState, config: SeasonConfig): Show {
  const names = new Map(config.managers.map((x) => [x.id, x.fullName]));
  const teams = new Map(config.teams.map((t) => [t.id, t]));
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const gains = m.events.flatMap((e) => (e.kind === 'gain' && Math.round(e.points) >= 1 ? [e] : []));
  const details = (g: Gain) =>
    [
      ...metrics.flatMap((x) => {
        const d = g.metrics[x.id];
        return d !== undefined && Math.round(d) >= 1 ? [`${x.title} +${num(d)}`] : [];
      }),
      ...(Math.round(g.bonus) >= 1 ? [`ачивки +${num(g.bonus)}`] : []),
    ].join(' · ');
  const toasts: ToastItem[] = gains.slice(0, TOASTS).map((g) => ({
    kind: 'gain',
    key: `gain-${g.managerId}`,
    name: names.get(g.managerId) ?? g.managerId,
    color: teams.get(g.teamId)?.color ?? GREY,
    points: Math.round(g.points),
    details: details(g),
  }));
  const rest = gains.slice(TOASTS);
  if (rest.length > 0) {
    const sum = Math.round(rest.reduce((s, g) => s + g.points, 0));
    toasts.push({
      kind: 'more',
      key: 'more',
      text: `и ещё ${rest.length} ${plural(rest.length, 'оператор', 'оператора', 'операторов')} — +${num(sum)} ${plural(sum, 'балл', 'балла', 'баллов')}`,
    });
  }

  const defs = new Map(config.achievements.map((a) => [a.id, a]));
  const teamOf = new Map(game.managers.map((x) => [x.managerId, x.teamId]));
  const unlocks = m.events.flatMap((e) => {
    const def = e.kind === 'achievement' ? defs.get(e.unlock.achievementId) : undefined;
    return e.kind === 'achievement' && def ? [{ u: e.unlock, def }] : [];
  });
  const banners: BannerItem[] = unlocks.slice(0, BANNERS).map(({ u, def }, i) => {
    const teamId = u.managerId !== undefined ? teamOf.get(u.managerId) : u.teamId;
    return {
      kind: 'achievement',
      key: `ach-${i}-${def.id}`,
      title: def.title,
      description: def.description,
      rarity: def.rarity,
      who:
        u.managerId !== undefined
          ? (names.get(u.managerId) ?? u.managerId)
          : `команда ${teams.get(u.teamId ?? '')?.leaderName ?? u.teamId ?? ''}`,
      color: teams.get(teamId ?? '')?.color ?? GREY,
    };
  });
  if (unlocks.length > BANNERS) {
    const n = unlocks.length - BANNERS;
    banners.push({ kind: 'more', key: 'more', text: `и ещё ${n} ${plural(n, 'ачивка', 'ачивки', 'ачивок')}` });
  }

  const plate =
    m.kind === 'since'
      ? m.since
        ? `Что нового с ${shortTime(m.since)}`
        : 'Что нового с прошлого визита'
      : `Новые данные от ${shortTime(game.dataAsOf)}`;
  return { id: m.id, plate, toasts, banners };
}

export type Timed<T> = { item: T; start: number; end: number };
export type Timeline = { toasts: Timed<ToastItem>[]; banners: Timed<BannerItem>[]; end: number };

/** When each toast and banner shows: a toast every 2.5 s for 7.5 s, then the banners one by one. */
export function timeline(show: Show): Timeline {
  const toasts = show.toasts.map((item, i) => ({
    item,
    start: i * TOAST_EVERY_MS,
    end: i * TOAST_EVERY_MS + TOAST_MS,
  }));
  const after = show.toasts.length * TOAST_EVERY_MS;
  const banners = show.banners.map((item, j) => ({
    item,
    start: after + j * BANNER_MS,
    end: after + (j + 1) * BANNER_MS,
  }));
  const end = Math.max(0, ...toasts.map((t) => t.end), ...banners.map((b) => b.end));
  return { toasts, banners, end };
}

/** What is on screen `ms` into a show. */
export function at(line: Timeline, ms: number) {
  return {
    toasts: line.toasts.filter((t) => ms >= t.start && ms < t.end),
    banners: line.banners.filter((b) => ms >= b.start && ms < b.end),
  };
}
```

(Note: with four toasts the banners start at `4 × 2500 = 10000` — after the last toast has appeared; the
test above says so.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/hudMoments.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: The layer** — `src/hud/Moments.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import type { Moments } from '../moments/tracker.ts';
import { countAt } from './cards.ts';
import { reducedMotion, useVisibleClock } from './clock.ts';
import {
  TOAST_COUNT_MS,
  at,
  showOf,
  timeline,
  type BannerItem,
  type Rarity,
  type Show,
  type ToastItem,
} from './moments.ts';
import { plural } from './rating.ts';

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'обычная',
  rare: 'редкая',
  epic: 'эпическая',
  legendary: 'легендарная',
};

/**
 * The moments of a portion of data (D-56): the plate «Новые данные от …» / «Что нового с …», «кто принёс
 * баллы», then the achievement banners (ACH-5: one at a time, 4 s) — one batch after another, played only
 * while the tab is visible. Plain DOM; CSS animations once (PERF-1).
 */
export function MomentsLayer({
  moments,
  game,
  config,
}: {
  moments: Moments | null;
  game: GameState;
  config: SeasonConfig;
}) {
  const [queue, setQueue] = useState<Show[]>([]);
  const [taken, setTaken] = useState<number | null>(null);
  // A new batch joins the queue once (set while rendering, as `MapPage` adopts `?view=`).
  if (moments !== null && moments.id !== taken) {
    setTaken(moments.id);
    const show = showOf(moments, game, config);
    if (show.toasts.length + show.banners.length > 0) setQueue((q) => [...q, show]);
  }
  const head = queue[0] ?? null;
  const line = useMemo(() => (head ? timeline(head) : null), [head]);
  const ms = useVisibleClock(head?.id ?? null, line?.end ?? 0);
  if (head !== null && line !== null && ms !== null && ms >= line.end)
    setQueue((q) => (q[0] === head ? q.slice(1) : q));
  if (head === null || line === null || ms === null || ms >= line.end) return null;
  const now = at(line, ms);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-2">
        <div role="status" className="sq-plate sq-moment-in sq-bright px-4 py-1">
          {head.plate}
        </div>
        {now.banners.map(({ item }) => (
          <Banner key={item.key} item={item} />
        ))}
      </div>
      <ol
        aria-label="Кто принёс баллы"
        className="pointer-events-none absolute top-16 left-3 flex w-72 flex-col gap-1.5"
      >
        {now.toasts.map(({ item, start }) => (
          <li key={item.key} className="sq-plate sq-moment-in px-3 py-1.5">
            <Toast item={item} ms={ms - start} />
          </li>
        ))}
      </ol>
    </>
  );
}

function Toast({ item, ms }: { item: ToastItem; ms: number }) {
  if (item.kind === 'more') return <div className="sq-muted text-sm">{item.text}</div>;
  const n = Math.round(reducedMotion() ? item.points : countAt(0, item.points, ms, TOAST_COUNT_MS));
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="sq-gem sq-gem-small" style={{ background: item.color }} aria-hidden="true" />
        <span className="sq-name min-w-0 flex-1 truncate">{item.name}</span>
        <span className="sq-gain text-base">
          +{n} {plural(n, 'балл', 'балла', 'баллов')}
        </span>
      </div>
      {item.details && <div className="sq-muted text-xs">{item.details}</div>}
    </>
  );
}

function Banner({ item }: { item: BannerItem }) {
  if (item.kind === 'more')
    return <div className="sq-plate sq-moment-in px-4 py-1 text-sm">{item.text}</div>;
  return (
    <section
      aria-label="Ачивка"
      className={`sq-plate sq-banner sq-rarity-${item.rarity} sq-moment-in flex items-center gap-3 px-4 py-2`}
    >
      <span className="sq-emblem" aria-hidden="true" />
      <div className="min-w-0">
        <div className="sq-caps sq-muted">Ачивка · {RARITY_TEXT[item.rarity]}</div>
        <div className="sq-name sq-bright text-[17px]">{item.title}</div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="sq-gem sq-gem-small" style={{ background: item.color }} aria-hidden="true" />
          {item.who}
        </div>
        {item.description && <div className="sq-muted text-xs">{item.description}</div>}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: In the HUD and the styles** — `src/hud/Hud.tsx`: `import { MomentsLayer } from
'./Moments.tsx';` and, as the last child of the HUD's root `div`, `<MomentsLayer moments={props.moments}
game={game} config={config} />`. `src/hud/theme.css`, after the card's moments styles (Task 3):

```css
  .sq-moment-in {
    animation: sq-moment-in 0.35s ease-out both;
  }
  @keyframes sq-moment-in {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  .sq-banner {
    min-width: 300px;
  }
  .sq-emblem {
    flex: none;
    width: 22px;
    height: 22px;
    transform: rotate(45deg);
    border: 2px solid var(--sq-edge);
  }
  .sq-rarity-common .sq-emblem {
    background: linear-gradient(135deg, #ece3cf, #7d7464);
  }
  .sq-rarity-rare .sq-emblem {
    background: linear-gradient(135deg, #a9d3ff, #2f5f96);
  }
  .sq-rarity-epic .sq-emblem {
    background: linear-gradient(135deg, #e0b3ff, #6b2f96);
  }
  .sq-rarity-legendary .sq-emblem {
    background: linear-gradient(135deg, #ffe08a, #a8641c);
  }
  @media (prefers-reduced-motion: reduce) {
    .sq-moment-in {
      animation: none;
    }
  }
```

- [ ] **Step 7: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/hud/moments.ts src/hud/Moments.tsx src/hud/Hud.tsx src/hud/theme.css tests/unit/hudMoments.test.ts
git commit -m "HUD: the plate «Новые данные от …» / «Что нового с …», toasts «кто принёс баллы» and the achievement banners of a portion, played while the tab is visible (D-56, ACH-5, plan moments task 4)"
```

---

### Task 5: «Герои дня» in the rotating rating

**Где смотреть:** спецификация A4 «Герои дня»; DECISIONS D-38; `src/hud/rating.ts` (`ratingSlides`, `Slide`),
`src/hud/Hud.tsx` (`Rating`, `SlideView`); тесты `tests/unit/hud.test.ts`.

**Files:**
- Modify: `src/hud/rating.ts`, `src/hud/Hud.tsx`, `src/app/App.tsx`
- Test: `tests/unit/hud.test.ts`

**Interfaces:**
- Consumes: Task 2 — `Hero`, `ViewerState.heroes`.
- Produces: `HeroesSlide = { kind: 'heroes'; rows: Hero[] }` in `Slide`; `ratingSlides(game, config, heroes?)`;
  `HudProps.heroes: Hero[]`.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/hud.test.ts`:

```ts
describe('ratingSlides — «Герои дня» (D-56)', () => {
  const config = makeConfig({ teams: [team('t1', 1)], managers: [manager('a', 't1')] });
  const game = computeGameState(
    { config, records: [daily('a', '2026-10-13', { inv6: 3 })], adjustments: [], imports: [] },
    at('2026-10-14'),
  );

  it('after the top, when somebody brought points today; none without heroes', () => {
    const heroes = [{ managerId: 'a', name: 'Оператор a', teamId: 't1', points: 3 }];
    const slides = ratingSlides(game, config, heroes);
    expect(slides.map((s) => s.kind)).toEqual(['team', 'top', 'heroes']);
    expect(slides[2]).toEqual({ kind: 'heroes', rows: heroes });
    expect(ratingSlides(game, config, []).map((s) => s.kind)).toEqual(['team', 'top']);
    expect(ratingSlides(game, config).map((s) => s.kind)).toEqual(['team', 'top']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/hud.test.ts`
Expected: FAIL — no `heroes` slide (and a type error on the third argument at typecheck).

- [ ] **Step 3: The slide** — `src/hud/rating.ts`: `import type { Hero } from '../moments/heroes.ts';`;
the types:

```ts
/** «Герои дня» (D-56): who brought most points since the end of yesterday. */
export type HeroesSlide = { kind: 'heroes'; rows: Hero[] };
export type Slide = TeamSlide | TopSlide | HeroesSlide;
```

`export function ratingSlides(game: GameState, config: SeasonConfig, heroes: Hero[] = []): Slide[]` and,
before `return slides;`: `if (heroes.length > 0) slides.push({ kind: 'heroes', rows: heroes });`. The doc
comment of the module gains «…, then «Герои дня» when somebody brought points today (D-56)».

Run: `npx vitest run tests/unit/hud.test.ts`
Expected: PASS.

- [ ] **Step 4: The rating** — `src/hud/Hud.tsx`:
- `import type { Hero } from '../moments/heroes.ts';`; `HudProps` gains
  `/** «Герои дня» (D-56). */ heroes: Hero[];`;
- in `Hud`: `<Rating game={game} config={config} heroes={props.heroes} jump={props.moments?.id ?? null} />`;
- `Rating`:

```tsx
function Rating({
  game,
  config,
  heroes,
  jump,
}: {
  game: GameState;
  config: SeasonConfig;
  heroes: Hero[];
  /** A new batch of moments: show «Герои дня» at once, for a whole slide (D-56). */
  jump: number | null;
}) {
  const slides = useMemo(() => ratingSlides(game, config, heroes), [game, config, heroes]);
  const [index, setIndex] = useState(0);
  const [jumped, setJumped] = useState<number | null>(null);
  if (jump !== null && jump !== jumped) {
    setJumped(jump);
    const heroesAt = slides.findIndex((s) => s.kind === 'heroes');
    if (heroesAt >= 0) setIndex(heroesAt);
  }
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [jumped]);
```

  (the rest of `Rating` as it is; the gems' key becomes `key={s.kind === 'team' ? s.teamId : s.kind}`);
- `SlideView`, before `if (slide.kind === 'top')`:

```tsx
  if (slide.kind === 'heroes') {
    const color = new Map(config.teams.map((t) => [t.id, t.color]));
    return (
      <>
        <h2 className="sq-name mt-2 text-base">Герои дня</h2>
        <div className="sq-note">кто принёс больше всех баллов сегодня</div>
        <ol className="sq-parchment mt-2">
          {slide.rows.map((r) => (
            <li key={r.managerId} className="flex items-center gap-2 py-px">
              <span
                className="sq-gem sq-gem-small"
                style={{ background: color.get(r.teamId) }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="font-bold">+{fmt(r.points)}</span>
            </li>
          ))}
        </ol>
      </>
    );
  }
```

- `src/app/App.tsx`, in `<Hud …>`: `heroes={state.heroes}`.

- [ ] **Step 5: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/hud/rating.ts src/hud/Hud.tsx src/app/App.tsx tests/unit/hud.test.ts
git commit -m "HUD: «Герои дня» in the rotating rating — who brought most points today; a new portion shows it at once (D-56, D-38, plan moments task 5)"
```

---

### Task 6: The moves since the last visit — the scene and the scheme (FR-MOVE-4 changed)

**Где смотреть:** спецификация A6; SPEC FR-MOVE-4; `src/scene/player.ts` (`load`), `src/scene/GameScene.tsx`
(`Play`, эффект с `player.load`), `src/scheme/geometry.ts` (`nextMoves`, `SCHEME_TIMING`),
`src/scheme/Scheme.tsx` (`useMoves`); тесты `tests/unit/scene/player.test.ts`,
`tests/unit/scheme/geometry.test.ts`.

**Files:**
- Modify: `src/scene/player.ts`, `src/scene/GameScene.tsx`, `src/scheme/geometry.ts`, `src/scheme/Scheme.tsx`,
  `src/app/App.tsx`
- Test: `tests/unit/scene/player.test.ts`, `tests/unit/scheme/geometry.test.ts`

**Interfaces:**
- Consumes: Task 2 — `Moments.kind`, `Moments.before`.
- Produces: `ScenePlayer.load(after, trackKey, gates?, from?: TeamPosition[] | null)`;
  `firstMoves(positions, trackKey, gates, from: TeamPosition[] | null): SchemeMoves`;
  props `replayFrom?: TeamPosition[] | null` on `GameScene` and `Scheme`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/scene/player.test.ts`, inside «ScenePlayer (FR-MOVE)»:

```ts
  it('on the first load walks from what this browser showed last (D-56); later loads ignore it', () => {
    const player = new ScenePlayer();
    const plan = player.load(at([['t1', 5]]), '20', [], at([['t1', 3]]));
    expect(plan.moves).toMatchObject([{ teamId: 't1', from: 3, to: 5 }]);
    const next = player.load(at([['t1', 6]]), '20', [], at([['t1', 0]]));
    expect(next.moves).toMatchObject([{ teamId: 't1', from: 5, to: 6 }]);
  });
```

`tests/unit/scheme/geometry.test.ts` (import `firstMoves` from `src/scheme/geometry.ts`):

```ts
describe('the first moves of a page (FR-MOVE-4, D-56)', () => {
  const now = [{ teamId: 't1', position: 5 }];
  it('none without a remembered «before»', () => {
    expect(firstMoves(now, '20|30', [], null).plan.duration).toBe(0);
  });
  it('a walk from the remembered cells', () => {
    const moves = firstMoves(now, '20|30', [], [{ teamId: 't1', position: 3 }]);
    expect(moves.plan.moves).toMatchObject([{ teamId: 't1', from: 3, to: 5 }]);
    expect(moves).toMatchObject({ positions: now, trackKey: '20|30' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/scene/player.test.ts tests/unit/scheme/geometry.test.ts`
Expected: FAIL — the first load plays nothing; `firstMoves` is not exported.

- [ ] **Step 3: The player** — `src/scene/player.ts`, `load`:

```ts
  /**
   * New positions: a plan from the previous ones. The first load walks from `from` — the cells this
   * browser showed last (D-56, FR-MOVE-4 changed) — or plays nothing; another track plays nothing (its
   * cells mean other positions). The same positions again (a recompute at midnight, a re-publish) keep the
   * plan under way (review 3a).
   */
  load(
    after: TeamPosition[],
    trackKey: string,
    gates: readonly number[] = [],
    from: TeamPosition[] | null = null,
  ): Plan {
    if (trackKey === this.trackKey && this.last && samePositions(this.last, after))
      return this.plan;
    const before = trackKey === this.trackKey ? this.last : this.last === null ? from : null;
```

(the rest of `load` unchanged).

`src/scheme/geometry.ts`, after `nextMoves`:

```ts
/** The first moves of a page (FR-MOVE-4, D-56): none — unless this browser remembered what it showed. */
export function firstMoves(
  positions: TeamPosition[],
  trackKey: string,
  gates: readonly number[],
  from: TeamPosition[] | null,
): SchemeMoves {
  return {
    positions,
    trackKey,
    plan: from ? planMoves(from, positions, SCHEME_TIMING, gates) : EMPTY_PLAN,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/scene/player.test.ts tests/unit/scheme/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: The scene, the scheme, the map**
- `src/scene/GameScene.tsx`: `GameScene` props gain
  `/** The cells this browser showed last: the first show walks from them (D-56). */ replayFrom?: TeamPosition[] | null;`
  (import `type TeamPosition` from `./choreography.ts`), passed to `<Play … replayFrom={replayFrom ?? null} />`;
  `Play`'s props gain `replayFrom: TeamPosition[] | null`; its load effect calls
  `player.load(…, gates, replayFrom)` with `replayFrom` in the effect's dependencies.
- `src/scheme/Scheme.tsx`: `export default function Scheme({ game, config, replayFrom = null }: { game:
  GameState; config: SeasonConfig; replayFrom?: TeamPosition[] | null })`; `useMoves(positions, gates,
  trackKey, replayFrom)`; in `useMoves` the new last parameter `from: TeamPosition[] | null` and
  `useState<SchemeMoves>(() => firstMoves(positions, trackKey, gates, from))`; import `firstMoves`; the doc
  comment of `useMoves` says «none on the first render — unless this browser remembered its last cells
  (D-56)».
- `src/app/App.tsx`: before the `return` of the ready map,
  `const replayFrom = state.moments?.kind === 'since' ? state.moments.before : null;` and
  `replayFrom={replayFrom}` on `<GameScene …>` and `<Scheme …>`.

- [ ] **Step 6: Types, lint, the suite** — `npm run typecheck && npm run lint && npm test`; Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/scene/player.ts src/scene/GameScene.tsx src/scheme/geometry.ts src/scheme/Scheme.tsx src/app/App.tsx tests/unit/scene/player.test.ts tests/unit/scheme/geometry.test.ts
git commit -m "Scene and scheme: a page opened after a break walks the figures from the cells this browser showed last (D-56, FR-MOVE-4 changed, plan moments task 6)"
```

---

### Task 7: End to end — «Что нового», the first visit, a hidden tab, another day, reduced motion; the look

**Где смотреть:** `tests/e2e/admin.spec.ts` (`loadRepoState` демо в Node, `page.clock.setFixedTime`),
`tests/e2e/visual.spec.ts` (QA-6: эталоны, маски), `tests/e2e/scheme.spec.ts`; токены схемы —
`data-team`, `data-cell` (`src/scheme/Scheme.tsx`); NAVIGATOR «Грабли среды».

**Files:**
- Create: `tests/e2e/moments.spec.ts`
- Modify (regenerated): `tests/e2e/visual.spec.ts-snapshots/*.png`

- [ ] **Step 1: Write the e2e tests** — `tests/e2e/moments.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { loadRepoState } from '../../src/admin/pipeline.ts';
import { computeGameState } from '../../src/engine/gameState.ts';
import { snapshotOf, type Snapshot } from '../../src/moments/snapshot.ts';
import { FakeGitHubRepo } from '../support/fakeGitHub.ts';

// D-56 end to end on the demo: «Что нового» from a snapshot put into the browser's storage, as a visit of
// 12.10 left it; the time is pinned so the demo's data are the same every run.
const DEMO = 'sales-quest-demo';
const NOW = '2026-10-14T12:00:00+03:00';
test.use({ viewport: { width: 1280, height: 720 } });

async function demo() {
  const { input } = await loadRepoState(FakeGitHubRepo.fromDir(DEMO_DATA), DEMO, new Map());
  const seen = snapshotOf(computeGameState(input, '2026-10-12T23:59:00+03:00'), input.config);
  return { input, seen, now: computeGameState(input, NOW) };
}

/** The map in 2D with the clock pinned; `seen` goes into the storage first; `hidden` — a hidden tab. */
async function open(
  page: Page,
  seen: Snapshot | null,
  opts: { hidden?: boolean; query?: string } = {},
) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(
    ([value, hidden]) => {
      if (value) localStorage.setItem('sq.seen.v1', value);
      if (hidden) {
        const w = window as Window & { __sqHidden?: boolean };
        w.__sqHidden = true;
        Object.defineProperty(document, 'visibilityState', {
          get: () => (w.__sqHidden ? 'hidden' : 'visible'),
        });
      }
    },
    [seen ? JSON.stringify({ [seen.seasonId]: seen }) : null, opts.hidden ?? false] as const,
  );
  await page.goto(`./#/?view=2d&k=${DEMO}${opts.query ?? ''}`);
  await expect(page.getByRole('img', { name: 'Схема трека' })).toBeVisible({ timeout: 30_000 });
}
const plate = (page: Page) => page.getByRole('status').filter({ hasText: /^(Что нового|Новые данные)/ });
const cell = (page: Page, teamId: string) =>
  page.locator(`[data-team="${teamId}"]`).first().getAttribute('data-cell');

test('«Что нового с прошлого визита»: the plate, who brought points, the cards, «Герои дня», a banner, the walk (D-56)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { seen, now } = await demo();
  // The last team to walk: its token stands on the remembered cell while the others walk.
  const last = [...now.teams].reverse().find((t) => {
    const was = seen.teams.find((s) => s.teamId === t.teamId);
    return was !== undefined && was.position !== t.position;
  });
  if (!last) throw new Error('в демо никто не сдвинулся с 12.10 по 14.10');
  const was = seen.teams.find((s) => s.teamId === last.teamId)?.position;
  const fresh = now.unlocks.length - Object.values(seen.unlocks).reduce((a, b) => a + b, 0);
  expect(fresh, 'в демо нет новых ачивок с 12.10 по 14.10').toBeGreaterThan(0);

  await open(page, seen);
  expect(await cell(page, last.teamId)).toBe(String(was));
  await expect(plate(page)).toHaveText(/^Что нового с \d\d\.\d\d \d\d:\d\d$/);
  await expect(
    page.getByRole('list', { name: 'Кто принёс баллы' }).getByText(/^\+\d+ балл/).first(),
  ).toBeVisible();
  const cards = page.getByRole('list', { name: 'Команды' });
  await expect(cards.getByText(/^· до шага ещё \d+/)).toHaveCount(6);
  await expect(cards.getByText(/^\+\d+$/).first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Рейтинг операторов' }).getByRole('heading', { name: 'Герои дня' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ачивка' }).first()).toBeVisible({ timeout: 40_000 });
  await expect.poll(() => cell(page, last.teamId), { timeout: 30_000 }).toBe(String(last.position));
});

test('the first visit replays nothing and remembers what it showed (FR-MOVE-4, D-56)', async ({
  page,
}) => {
  const { now } = await demo();
  await open(page, null);
  const first = now.teams[0];
  if (!first) throw new Error('в демо нет команд');
  expect(await cell(page, first.teamId)).toBe(String(first.position));
  await page.waitForTimeout(3000);
  await expect(plate(page)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('sq.seen.v1'));
  expect(Object.keys(JSON.parse(stored ?? '{}'))).toEqual(['demo']);
});

test('a hidden tab keeps the show for later (D-56, PERF-3)', async ({ page }) => {
  const { seen } = await demo();
  await open(page, seen, { hidden: true });
  await page.waitForTimeout(3000);
  await expect(plate(page)).toHaveCount(0);
  await page.evaluate(() => {
    (window as Window & { __sqHidden?: boolean }).__sqHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(plate(page)).toHaveText(/^Что нового с /);
});

test('a look at another day changes nothing: no plate, the remembered snapshot kept (D-56)', async ({
  page,
}) => {
  const { seen } = await demo();
  await open(page, seen, { query: '&date=2026-10-13' });
  await page.waitForTimeout(3000);
  await expect(plate(page)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('sq.seen.v1'));
  expect(JSON.parse(stored ?? '{}')).toEqual({ [seen.seasonId]: seen });
});

test('reduced motion: the card shows the result at once, nothing flashes (D-56)', async ({ page }) => {
  const { seen, now } = await demo();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, seen);
  const t = now.teams[0];
  if (!t) throw new Error('в демо нет команд');
  const card = page.getByRole('list', { name: 'Команды' }).getByRole('listitem').first();
  // Digits only: the browser's and Node's group separators of «1 234» may differ.
  const digits = async () => ((await card.locator('span.sq-bright').textContent()) ?? '').replace(/\D/g, '');
  expect(await digits()).toBe(String(Math.round(t.points)));
  await expect(page.locator('.sq-flash')).toHaveCount(0);
});
```

(The demo's season id is `demo` (`tests/fixtures/demo-data/seasons/index.json`); the second test checks the
storage holds exactly that season.)

- [ ] **Step 2: Run them**

Run: `npx playwright test tests/e2e/moments.spec.ts --project=e2e`
Expected: PASS (5 tests). If the first test's «remembered cell» read is late (the token already walked), read
the token's cells through a `MutationObserver` put in by `addInitScript` instead, and ledger it. If the demo
has no new achievements between 12.10 and 14.10 (the explicit
`expect(fresh …)` fails), move the snapshot day earlier (`2026-10-09`) and ledger it; if «Герои дня» is not
the slide at that moment, the jump is broken — debug, do not loosen.

- [ ] **Step 3: Screenshots of the moments** — a throwaway spec (not committed) that opens as the first test
and takes three shots into the scratchpad: at ~2 s (the plate, the first toasts, the cards counting), at
~8 s (three toasts), at the first banner. Look at them: readable on parchment and over the map, nothing
covers the cards or the rating, the colours of the rarity frames. Fix what does not read; ledger it.

- [ ] **Step 4: The baselines QA-6** — the cards gained a line and the «до шага» bar, the rating a slide:

Run: `npx playwright test visual --update-snapshots`
Then look at `tests/e2e/visual.spec.ts-snapshots/*.png` (rest, whole, scheme): the cards show «N баллов ·
до шага ещё M» and the thin bar; no plate or toasts (the `?date=` view has no moments).

- [ ] **Step 5: The whole e2e** — `npx playwright test --project=e2e`; Expected: green.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/moments.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "e2e: «Что нового» end to end — the plate, toasts, cards, «Герои дня», a banner, the walk; the first visit, a hidden tab, another day, reduced motion; QA-6 baselines with the new cards (D-56, plan moments task 7)"
```

---

### Task 8: Documents and the full check

**Где смотреть:** `docs/DECISIONS.md` (последнее — D-55), `docs/NAVIGATOR.md` (HUD, сцена, данные),
`CLAUDE.md` (строка этапа, архитектура), `docs/BACKLOG.md`.

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/NAVIGATOR.md`, `CLAUDE.md`, `docs/BACKLOG.md`

- [ ] **Step 1: DECISIONS** — after D-55:

```markdown
**D-56. Моменты на панелях и «Что нового с прошлого визита»** (ответы автора 13.10.2026: «набор баллов, кто
принёс баллы, салюты, ачивки на карте»; «и офисный экран, и свои ноутбуки»; спецификация
`docs/superpowers/specs/2026-10-13-engagement-moments-design.md`, часть А, план
`docs/superpowers/plans/2026-10-13-moments-panels.md`; к FR-MOVE-4, ACH-5, D-35, D-38, PERF-1, PERF-3):
- **события — из сравнения «было → стало»** на экране зрителя (`src/moments/`): снимок того, что экран показал
  (клетки и баллы команд, баллы и показатели операторов, число ачивок по ключу — без имён), и новое состояние
  дают набор баллов команд, «кто принёс», ворота, обгон, нового лидера (только у шагнувшей вперёд), финиш,
  новые ачивки (по количеству, не по дате). Снижения не празднуются. Другой сезон, трек или веса — событий нет.
  Движок, данные и админка не менялись;
- **«Что нового»:** последний снимок хранится в браузере (`sq.seen.v1`, только последний сезон, в try/catch).
  Страница, открытая после перерыва, проигрывает шаги с запомненных клеток и показывает «Что нового с …»;
  **FR-MOVE-4 изменено:** без снимка (первый визит) — по-прежнему без проигрывания. Просмотр другого дня
  (`?date=`) и другого числа клеток (`?cells=`) — без моментов, снимок не трогается;
- **экран:** карточка считает баллы порции от «было» до «стало» (1,5 с), «N баллов · до шага ещё M» и тонкая
  полоса пути к следующей клетке по данным, «+N» и вспышка рамки цветом команды; надпись «Новые данные от …» /
  «Что нового с …»; тосты «кто принёс баллы» — пятеро с наибольшим приростом и «и ещё N операторов»; баннеры
  ачивок (ACH-5) — по одному, 4 с, не больше шести и «и ещё N ачивок»; слайд «Герои дня» в рейтинге (D-38) —
  баллы, принесённые с конца вчерашнего дня (второй расчёт движка «на конец вчера», D-35), и переход к нему при
  новой порции;
- **скорость и вкладка:** обычный DOM, CSS-анимации один раз; часы тикают 50 мс только пока идёт отсчёт или
  показ; скрытая вкладка ничего не играет — всё ждёт её показа; «уменьшить движение» — числа сразу, без вспышек.
```

- [ ] **Step 2: NAVIGATOR, CLAUDE.md, BACKLOG** — NAVIGATOR: a new item «**Моменты (D-56):**
`src/moments/` (`snapshot.ts`, `events.ts`, `seen.ts`, `heroes.ts`, `tracker.ts`), в зрителе — `moments`,
`heroes` (`src/app/viewer.ts`); HUD — `src/hud/cards.ts`, `clock.ts`, `moments.ts`, `Moments.tsx`, слайд
«Герои дня» в `rating.ts`; проигрывание с запомненных клеток — `ScenePlayer.load(…, from)`,
`firstMoves` (`src/scheme/geometry.ts`); тесты `tests/unit/moments/*`, `tests/unit/hudMoments.test.ts`, e2e
`tests/e2e/moments.spec.ts`.» in the HUD section, and the plan's path in the stage list. CLAUDE.md: the stage
line — «моменты на панелях (D-56) — `docs/superpowers/plans/2026-10-13-moments-panels.md`; дальше часть Б —
сцена (D-57)»; the architecture list gains «`src/moments/` — снимок показанного, события «было → стало»,
память браузера, «Герои дня» (D-56)». BACKLOG: under «Сделано», a short entry for D-56 and «дальше часть Б».

- [ ] **Step 3: The full check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:engine && npm run build && npm run size && npx playwright test --project=e2e`
Expected: green; `size` under 600 KB (the new HUD and `src/moments` are a few KB).

Run (bash): `npx playwright test --project=perf --no-deps`
Expected: QA-4 at ×4 ≥ 28 fps on this PC (the moments are DOM: the scene's frames should not change).

- [ ] **Step 4: Commit**

```bash
git add docs/DECISIONS.md docs/NAVIGATOR.md CLAUDE.md docs/BACKLOG.md
git commit -m "Docs: D-56 — moments on the panels and «Что нового с прошлого визита» (FR-MOVE-4 changed); NAVIGATOR and the current stage"
```

---

### Task 9: Independent review, fixes, the report

- [ ] **Step 1:** the review package of the whole plan, an independent reviewer on opus with the spec, this
plan, its Review Focus and the ledger's rulings; the reviewer must not open the root `*.xlsx`, `refs/`,
`assets-src/`, the author's Downloads, and must not decrypt `data/`.
- [ ] **Step 2:** re-grade; Critical and Important — one fix pass, each fix RED → GREEN + the whole suite;
minors — to the ledger and `docs/BACKLOG.md`.
- [ ] **Step 3:** a short report in Russian with the screenshots of a show (Task 7 Step 3): what managers will
see, when (a new portion; the first opening after a break), the rulings, the deferred minors; the push only
after a fresh «да»; after the deploy — F5 on the office screen.
