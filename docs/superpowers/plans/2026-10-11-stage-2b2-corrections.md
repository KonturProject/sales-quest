# Stage 2b-2 — Corrections while the game runs: Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process; the author
> chose inline execution for stage 2), an independent review subagent checks the whole plan at the end
> (Task 6). Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and
> `docs/NAVIGATOR.md` §3.

**Goal:** while the real game runs (12.10–25.10.2026), the coordinator gives a team a bonus or a penalty in
steps, fixes an operator's numbers for a day and — rarely — sends a team back to the start, as one batch
with one preview and one commit, without the developer.

**Architecture:** a correction is a value; a batch is a list applied by a pure function
(`applyCorrections`) to the season's adjustments, every written value derived from the season it is
applied to (the steps a figure can still take, the points of a count). A pure step
(`prepareCorrections`) gives the preview, the cells after the batch and the public message. The screen
holds the batch and writes it through `commitChange` of plan 2a, with the batch draft shared with the
roster screen (`BatchDraft`, extracted from `RosterDraft`). After «данные изменились» the same list is
applied to the fresh season (ADM-2). The engine and the data format do not change: `team_steps`,
`team_reset`, `manager_points` exist since stage 1.

**Tech stack:** React 19, TypeScript 6 strict, zod 4, Vitest, Playwright 1.63 (`page.clock`); the GitHub
write path, the fake GitHub and the engine of stages 1–2b-1 as they are.

**Spec:** `docs/superpowers/specs/2026-10-11-stage-2b2-corrections-design.md` (approved 11.10.2026); SPEC
§8 (ADM-STEPS, ADM-RESET-TEAM, ADM-PREVIEW, ADM-1, ADM-2), FR-STEP-3, FR-STEP-5; DECISIONS D-17, D-25,
R-1, D-51, D-52; BACKLOG «Этап 2».

**Refinements of the spec made here** (the spec's intent kept, its wording made workable):
- `applyCorrections(input, corrections, { now, by })` — an adjustment needs `by` (the admin's login) as
  well as the time.
- The stored reason of an operator's numbers is `«<metric's title> <±count>: <reason>»` — «Оплаты +1:
  поздняя оплата»; the form's hint «Оплаты +1 = +10 баллов». The season names metrics by plural titles
  («Оплаты», «Разговоры от 20 минут») and has no singular forms for «+1 оплата».
- A warning when a minus takes an operator's day below zero points (a wrong day or person) — the spec is
  silent; a reasonable admin expects to be told (Review Focus 4).

## Global Constraints

- The admin chunk stays lazy (D-7a): nothing of this plan in the initial JS; `npm run size` unchanged.
- Commit messages are public — counts only, never names (D-51): `корректировки: 2 — шаги, 1 — показатели,
  1 — старт`; the name guard of `commitChange` stays.
- A commit of corrections changes only `adjustments.enc.json` (and `version.json`); every file passes the
  viewers' check before sealing (2a, `checkReadable`).
- No real names, exports or the real phrase in tests or the repository; tests use the demo
  (`tests/fixtures/demo-data`) and builders with fictional people.
- The live game's data change only when the author presses «Записать»; deploying this plan changes the
  admin's code only. The engine (`src/engine`) and the schemas are not touched.
- Dates are `YYYY-MM-DD` strings; «today» is the admin's local date (`localDate`), timestamps through
  `localTimestamp` (D-11); ids `adj-<YYYYMMDDHHmm>-<n>`, unique in the file.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved,
  the push only after the author's «да» (D-3). In the UI «оператор», in code `manager`.

## Review Focus

1. **Two corrections of one team in one batch** (a penalty to the start, then another; a bonus to the
   end, then another) — the second sees the first: «штрафовать нечего» / «уже в конце трека» — Task 1
   test «the batch's earlier corrections count».
2. **A sign typed any way** — the typographic minus «−3» (pasted from Word or a chat), «- 3», «+3» — read
   as the number; «3,5» and «три» refused, never read as 0 — Task 1 test «parseCount».
3. **Two batches written in the same minute** — the second batch's ids go on from the first's, never
   repeat — Task 1 test «ids continue the minute's numbers».
4. **A minus that takes an operator's day below zero** (−1 payment on a day with none) — written, with a
   warning naming the day and the operator — Task 2 test «a minus below zero is warned about».
5. **Corrections after the end of the game** (the final fix on 26.10) — the cells of the end, the last
   day allowed and offered by default — Task 2 test «after the end of the game».

---

### Task 1: Corrections as data — steps without debt, back to the start, reasons, ids

**Где смотреть:** спецификация 2б-2 §2; DECISIONS D-17 (`team_reset`), D-52 (пачка как список значений);
код `src/engine/progress.ts` (`adjustedPosition`, `computedPosition`), `src/engine/adjustments.ts`
(`activeAdjustments`), `src/engine/gameState.ts` (`computeGameState`, `TeamState`),
`src/data/schemas/records.ts` (`AdjustmentSchema`), `src/admin/roster.ts` (образец: `Refused`,
`teamLabel`), `tests/support/builders.ts` (`makeConfig`, `daily`, `teamSteps`, `at`); навигатор §1, §3.

**Files:**
- Create: `src/admin/corrections.ts`
- Test: `tests/unit/admin/corrections.test.ts`

**Interfaces:**
- Consumes: `computeGameState(input, now): GameState` (`teams[].position`, `teams[].computedPosition`,
  `track.maxPosition`); `teamLabel(team: Team): string` (`src/admin/roster.ts`); `dayMonth`
  (`src/import/grid.ts`); `dateOf` (`src/engine/dates.ts`); `IsoDateSchema`; `plural` (`src/text.ts`).
- Produces:
  ```ts
  // src/admin/corrections.ts
  export type Correction =
    | { kind: 'steps'; teamId: string; steps: number; reason: string }
    | { kind: 'metric'; managerId: string; date: string; metricId: string; count: number; reason: string }
    | { kind: 'reset'; teamId: string; reason: string };
  export type CorrectionsResult = {
    input: EngineInput; // the season with the corrections that apply appended to `adjustments`
    problems: { index: number; message: string }[];
    warnings: string[];
    lines: string[]; // one per correction, in words, for the screen (names inside: never public)
  };
  export function applyCorrections(
    input: EngineInput,
    corrections: Correction[],
    opts: { now: string; by: string },
  ): CorrectionsResult;
  export function parseCount(text: string): number; // NaN when not a whole number
  export function clampSteps(position: number, steps: number, max: number): number;
  export function stepsHint(position: number, steps: number, max: number): string;
  ```
  (`metric` corrections are refused as «ещё не умею» in this task: Task 2 adds them.)

- [ ] **Step 1: Failing tests** — `tests/unit/admin/corrections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyCorrections,
  clampSteps,
  parseCount,
  stepsHint,
  type Correction,
  type CorrectionsResult,
} from '../../../src/admin/corrections.ts';
import { computeGameState, type TeamState } from '../../../src/engine/gameState.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { at, daily, makeConfig, manager, team, teamSteps } from '../../support/builders.ts';

// A two-week game 05.10–18.10 (10 working days, 2 cells a day, overflow 50 %: the end is cell 30).
const NOW = '2026-10-12T14:05:00+03:00';
const OPTS = { now: NOW, by: 'admin' };
const input: EngineInput = {
  config: makeConfig({
    teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
    managers: [
      manager('op001', 't1', { fullName: 'Ершова Мария' }),
      manager('op002', 't2', { fullName: 'Федоров Иван', firedAt: '2026-10-09' }),
      manager('op003', 't2', { fullName: 'Белова Анна' }),
    ],
  }),
  records: [daily('op001', '2026-10-05', { inv6: 30 }), daily('op003', '2026-10-06', { pay: 1 })],
  adjustments: [],
  imports: [],
};
const place = (i: EngineInput, teamId: string, now = NOW) =>
  computeGameState(i, now).teams.find((t) => t.teamId === teamId) as TeamState;
const MAX = computeGameState(input, NOW).track.maxPosition;
const P = place(input, 't1').position;
const added = (r: CorrectionsResult) => r.input.adjustments.slice(input.adjustments.length);
const steps = (n: number, teamId = 't1', reason = 'конкурс'): Correction => ({
  kind: 'steps',
  teamId,
  steps: n,
  reason,
});

describe('steps to a team (ADM-STEPS, no debt — the author 11.10.2026)', () => {
  it('the fixture: team СР1 stands inside the track', () => {
    expect(P).toBeGreaterThan(2);
    expect(MAX - P).toBeGreaterThan(2);
  });

  it('a bonus as typed: the reason kept, the admin and the time, an id of the minute', () => {
    const r = applyCorrections(input, [steps(3)], OPTS);
    expect(r.problems).toEqual([]);
    expect(added(r)).toEqual([
      {
        id: 'adj-202610121405-1',
        type: 'team_steps',
        teamId: 't1',
        value: 3,
        reason: 'конкурс',
        by: 'admin',
        at: NOW,
      },
    ]);
    expect(place(r.input, 't1').position).toBe(P + 3);
    expect(r.lines).toEqual([`Шаги: СР1 +3 — клетка ${P} → ${P + 3} (конкурс)`]);
  });

  it('a penalty larger than the cell is written as what the figure really loses', () => {
    const r = applyCorrections(input, [steps(-(P + 5), 't1', 'штраф')], OPTS);
    expect(r.problems).toEqual([]);
    expect(added(r)).toMatchObject([{ type: 'team_steps', value: -P }]);
    expect(place(r.input, 't1').position).toBe(0);
    expect(r.lines).toEqual([
      `Шаги: СР1 −${P + 5} — клетка ${P} → 0: запишется −${P}, ниже старта нельзя (штраф)`,
    ]);
  });

  it('a bonus past the end of the overflow zone is cut to the end', () => {
    const r = applyCorrections(input, [steps(MAX - P + 4)], OPTS);
    expect(added(r)).toMatchObject([{ type: 'team_steps', value: MAX - P }]);
    expect(place(r.input, 't1').position).toBe(MAX);
    expect(r.lines[0]).toContain(`запишется +${MAX - P}, дальше конца трека нельзя`);
  });

  it("the batch's earlier corrections count: nothing to take at the start, nothing to give at the end", () => {
    const down = applyCorrections(input, [steps(-P), steps(-1)], OPTS);
    expect(down.problems).toEqual([
      { index: 1, message: 'команда уже на старте — штрафовать нечего' },
    ]);
    expect(added(down)).toHaveLength(1);
    const up = applyCorrections(input, [steps(MAX - P), steps(1)], OPTS);
    expect(up.problems).toEqual([{ index: 1, message: 'команда уже в конце трека' }]);
    expect(up.lines[1]).toBe('Шаги: СР1 +1 (конкурс)');
  });

  it('steps are a whole number, not 0; a team of the game; a reason for every kind', () => {
    const r = applyCorrections(
      input,
      [
        steps(0),
        steps(1.5),
        steps(Number.NaN),
        steps(2, 'нет'),
        steps(2, 't1', '   '),
        { kind: 'reset', teamId: 't1', reason: '' },
      ],
      OPTS,
    );
    expect(r.problems.map((p) => p.message)).toEqual([
      'шаги — целое число, не 0',
      'шаги — целое число, не 0',
      'шаги — целое число, не 0',
      'этой команды нет в игре',
      'укажите причину',
      'укажите причину',
    ]);
    expect(r.input).toBe(input);
    expect(r.lines[2]).toBe('Шаги: СР1 ? (конкурс)');
  });

  it('parseCount reads a sign typed any way and refuses what is not a whole number', () => {
    expect(['3', '+3', ' 3 ', '-3', '−3', '–3', '- 3'].map(parseCount)).toEqual([
      3, 3, 3, -3, -3, -3, -3,
    ]);
    for (const bad of ['', '3,5', '1.5', 'три', '+', '3+', '0x10', '1e3'])
      expect(parseCount(bad)).toBeNaN();
  });

  it('clampSteps and stepsHint: what the steps do to a figure, in words', () => {
    expect(clampSteps(5, -8, 30)).toBe(-5);
    expect(clampSteps(28, 4, 30)).toBe(2);
    expect(stepsHint(12, 2, 30)).toBe('клетка 12 → 14');
    expect(stepsHint(0, -1, 30)).toBe('команда уже на старте — штрафовать нечего');
    expect(stepsHint(30, 1, 30)).toBe('команда уже в конце трека');
  });

  it("ids continue the minute's numbers in the file; another minute starts at 1", () => {
    const earlier = teamSteps('adj-202610121405-2', 't2', 1, NOW);
    const same = applyCorrections({ ...input, adjustments: [earlier] }, [steps(1), steps(1)], OPTS);
    expect(same.input.adjustments.map((a) => a.id)).toEqual([
      'adj-202610121405-2',
      'adj-202610121405-3',
      'adj-202610121405-4',
    ]);
    const later = applyCorrections(
      { ...input, adjustments: [earlier] },
      [steps(1)],
      { now: '2026-10-12T14:06:10+03:00', by: 'admin' },
    );
    expect(later.input.adjustments.at(-1)?.id).toBe('adj-202610121406-1');
  });
});

describe('a team back to the start (ADM-RESET-TEAM, D-17)', () => {
  it('removes the computed cell and the steps; later data move the figure on from the start', () => {
    const stepped = { ...input, adjustments: [teamSteps('a1', 't1', 2, at('2026-10-07'))] };
    const before = place(stepped, 't1');
    const r = applyCorrections(stepped, [{ kind: 'reset', teamId: 't1', reason: 'ошибка в данных' }], OPTS);
    expect(r.problems).toEqual([]);
    // The earlier steps stay in the file; the reset is appended and outweighs them (D-17).
    expect(r.input.adjustments.map((a) => a.type)).toEqual(['team_steps', 'team_reset']);
    expect(r.input.adjustments.at(-1)).toMatchObject({
      type: 'team_reset',
      teamId: 't1',
      value: before.computedPosition,
      reason: 'ошибка в данных',
    });
    expect(place(r.input, 't1').position).toBe(0);
    expect(r.lines).toEqual([`На старт: СР1 — клетка ${before.position} → 0 (ошибка в данных)`]);
    const more = { ...r.input, records: [...r.input.records, daily('op001', '2026-10-12', { inv6: 15 })] };
    const after = place(more, 't1');
    expect(after.position).toBe(after.computedPosition - before.computedPosition);
    expect(after.position).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/corrections.test.ts` — Expected: FAIL (cannot
  resolve `src/admin/corrections.ts`).

- [ ] **Step 3: Implement** `src/admin/corrections.ts`:

```ts
import { IsoDateSchema } from '../data/schemas/common.ts';
import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import { dateOf } from '../engine/dates.ts';
import { computeGameState, type TeamState } from '../engine/gameState.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { dayMonth } from '../import/grid.ts';
import { teamLabel } from './roster.ts';

/**
 * Corrections while the game runs (ADM-STEPS, ADM-RESET-TEAM, plan 2b-2): a correction is a value, the
 * batch a list applied in order to the season's adjustments. One that does not apply is named in
 * `problems` and skipped; the rest still apply — so the same list can be applied again to a season
 * another admin changed meanwhile (ADM-2), every written value derived anew from that season. Pure:
 * «now» is a parameter (D-11).
 */

export type Correction =
  | { kind: 'steps'; teamId: string; steps: number; reason: string }
  | {
      kind: 'metric';
      managerId: string;
      date: string;
      metricId: string;
      count: number;
      reason: string;
    }
  | { kind: 'reset'; teamId: string; reason: string };

export type CorrectionsResult = {
  /** The season with the corrections that apply appended to its adjustments. */
  input: EngineInput;
  /** Corrections that did not apply, in words, by their index in the batch. */
  problems: { index: number; message: string }[];
  /** Allowed, but worth a look. */
  warnings: string[];
  /** One per correction, in words, for the screen — names inside: never public. */
  lines: string[];
};

/** One correction that does not apply, in words for the admin. */
class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused(message);
};

const NOTHING_TO_TAKE = 'команда уже на старте — штрафовать нечего';
const AT_THE_END = 'команда уже в конце трека';

const fmt = (n: number) => n.toLocaleString('ru-RU');
/** «+3», «−3» — with the typographic minus. */
const signed = (n: number) => (n < 0 ? `−${fmt(-n)}` : `+${fmt(n)}`);
const isDay = (date: string) => IsoDateSchema.safeParse(date).success;
const isCount = (n: number) => Number.isInteger(n) && n !== 0;

/** A whole number typed with its sign: «3», «+3», «-3», «−3», «- 3» → 3 or −3; anything else — NaN. */
export function parseCount(text: string): number {
  const t = text.replace(/\s+/g, '').replace(/^[−–]/, '-');
  return /^[+-]?\d+$/.test(t) ? Number(t) : Number.NaN;
}

/**
 * The steps a figure at `position` really takes on a track that ends at `max`: never below the start
 * nor past the end (no debt, the author 11.10.2026).
 */
export function clampSteps(position: number, steps: number, max: number): number {
  return Math.min(max, Math.max(0, position + steps)) - position;
}

/** What the steps do to the figure, in words: «клетка 8 → 0: запишется −8, ниже старта нельзя». */
export function stepsHint(position: number, steps: number, max: number): string {
  const value = clampSteps(position, steps, max);
  if (value === 0) return steps < 0 ? NOTHING_TO_TAKE : AT_THE_END;
  const cut =
    value === steps
      ? ''
      : `: запишется ${signed(value)}, ${steps < 0 ? 'ниже старта' : 'дальше конца трека'} нельзя`;
  return `клетка ${String(position)} → ${String(position + value)}${cut}`;
}

/** `adj-<YYYYMMDDHHmm>-`: the minute a batch is made in. */
const idPrefix = (now: string) => `adj-${now.slice(0, 16).replace(/[-T:]/g, '')}-`;

/** The largest number of the minute's ids in the file: a second batch of that minute goes on from it. */
function takenIds(adjustments: Adjustment[], prefix: string): number {
  return adjustments.reduce((max, a) => {
    const n = a.id.startsWith(prefix) ? Number(a.id.slice(prefix.length)) : 0;
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
}

function teamOf(input: EngineInput, id: string): Team {
  return input.config.teams.find((t) => t.id === id) ?? refuse('этой команды нет в игре');
}

/** Where a team stands at `now`, the batch's earlier corrections in: the figure, the data's place, the end. */
function placeOf(input: EngineInput, teamId: string, now: string) {
  const state = computeGameState(input, now);
  const team = state.teams.find((t) => t.teamId === teamId) as TeamState; // a team of the config
  return { position: team.position, computed: team.computedPosition, max: state.track.maxPosition };
}

type Made = { adjustment: Adjustment; line: string; warning?: string };
type Meta = { id: string; at: string; by: string; today: string };

function applyOne(input: EngineInput, c: Correction, meta: Meta): Made {
  const reason = c.reason.trim();
  if (reason === '') refuse('укажите причину');
  const base = { id: meta.id, at: meta.at, by: meta.by };
  switch (c.kind) {
    case 'steps': {
      const team = teamOf(input, c.teamId);
      if (!isCount(c.steps)) refuse('шаги — целое число, не 0');
      const { position, max } = placeOf(input, team.id, meta.at);
      const value = clampSteps(position, c.steps, max);
      if (value === 0) refuse(c.steps < 0 ? NOTHING_TO_TAKE : AT_THE_END);
      return {
        adjustment: { ...base, type: 'team_steps', teamId: team.id, value, reason },
        line: `Шаги: ${teamLabel(team)} ${signed(c.steps)} — ${stepsHint(position, c.steps, max)} (${reason})`,
      };
    }
    case 'metric':
      return refuse('ещё не умею'); // Task 2
    case 'reset': {
      const team = teamOf(input, c.teamId);
      const { position, computed } = placeOf(input, team.id, meta.at);
      return {
        // The data's own place before the track's limits (D-17). Below zero only when corrections took
        // more points than the data gave — the figure stands at the start then anyway.
        adjustment: {
          ...base,
          type: 'team_reset',
          teamId: team.id,
          value: Math.max(0, computed),
          reason,
        },
        line: `На старт: ${teamLabel(team)} — клетка ${String(position)} → 0 (${reason})`,
      };
    }
  }
}

/** A correction that did not apply, as it was typed. */
function plainLine(config: SeasonConfig, c: Correction): string {
  const team = (id: string) => {
    const t = config.teams.find((x) => x.id === id);
    return t ? teamLabel(t) : `команда ${id}`;
  };
  const n = (v: number) => (Number.isFinite(v) ? signed(v) : '?');
  const reason = c.reason.trim() === '' ? '' : ` (${c.reason.trim()})`;
  switch (c.kind) {
    case 'steps':
      return `Шаги: ${team(c.teamId)} ${n(c.steps)}${reason}`;
    case 'metric': {
      const who =
        config.managers.find((m) => m.id === c.managerId)?.fullName ?? `оператор ${c.managerId}`;
      const what = config.metrics.find((m) => m.id === c.metricId)?.title ?? c.metricId;
      const day = isDay(c.date) ? dayMonth(c.date) : 'без дня';
      return `Показатели: ${who}, ${day} — ${what} ${n(c.count)}${reason}`;
    }
    case 'reset':
      return `На старт: ${team(c.teamId)}${reason}`;
  }
}

export function applyCorrections(
  input: EngineInput,
  corrections: Correction[],
  opts: { now: string; by: string },
): CorrectionsResult {
  const prefix = idPrefix(opts.now);
  let taken = takenIds(input.adjustments, prefix);
  const today = dateOf(opts.now);
  let current = input;
  const problems: CorrectionsResult['problems'] = [];
  const warnings: string[] = [];
  const lines: string[] = [];
  corrections.forEach((c, index) => {
    try {
      const made = applyOne(current, c, {
        id: `${prefix}${String(taken + 1)}`,
        at: opts.now,
        by: opts.by,
        today,
      });
      taken += 1;
      current = { ...current, adjustments: [...current.adjustments, made.adjustment] };
      lines.push(made.line);
      if (made.warning !== undefined) warnings.push(made.warning);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      lines.push(plainLine(current.config, c));
      problems.push({ index, message: e.message });
    }
  });
  return { input: current, problems, warnings, lines };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/admin/corrections.test.ts` — Expected: PASS (9 tests).
  Then `npm run format && npm run typecheck && npm run lint` — Expected: exit 0 each (check the exit
  codes, never through `| tail`).

- [ ] **Step 5: Commit** «Admin: corrections as data — steps to a team without debt, a team back to the
  start, a reason always, ids of the minute (ADM-STEPS, ADM-RESET-TEAM, D-17, plan 2b-2 task 1)».

### Task 2: An operator's numbers for a day, the message, the default day, the step with its preview

**Где смотреть:** спецификация 2б-2 §1–§2; DECISIONS D-25 (`manager_points` за день), R-1 (команда того
дня); код `src/engine/adjustments.ts` (`managerPointsBetween`, `pointsDateOf`), `src/engine/scoring.ts`
(`pointsOf`, `weightsOf`), `src/engine/prepare.ts` (`prepare(...).series`), `src/engine/roster.ts`
(`teamOn`), `src/admin/rosterStep.ts` (образец `prepareRoster`), `src/admin/pipeline.ts`
(`previewChange`, `commitChange`); тест-образец `tests/unit/admin/rosterStep.test.ts` (демо через
`FakeGitHubRepo`); навигатор §1, §3.

**Files:**
- Modify: `src/admin/corrections.ts`
- Test: `tests/unit/admin/corrections.test.ts`

**Interfaces:**
- Consumes: Task 1's `applyCorrections`, `Correction`, `CorrectionsResult`; `previewChange(before,
  after, now): Preview`, `RepoState`, `commitChange`, `loadRepoState` (`src/admin/pipeline.ts`);
  `managerPointsBetween`; `prepare`; `pointsOf`, `weightsOf`; `teamOn`; `addDays`; `plural`.
- Produces:
  ```ts
  export function metricText(metric: Metric, count: number): string; // «Оплаты +1 = +10 баллов»
  export function metricDay(config: SeasonConfig, today: string): string; // yesterday, in the game
  export function correctionsCommitMessage(corrections: Correction[]): string;
  export type CorrectionsStep = {
    state: RepoState;
    result: CorrectionsResult;
    preview: Preview;
    positions: Map<string, number>; // each team's cell with the batch applied
    max: number; // the last cell of the track
    message: string; // counts of the corrections that apply
  };
  export function prepareCorrections(
    state: RepoState,
    corrections: Correction[],
    opts: { now: string; by: string },
  ): CorrectionsStep;
  ```

- [ ] **Step 1: Failing tests** — append to `tests/unit/admin/corrections.test.ts` (imports merged at the
  top of the file: `beforeAll` from vitest; `correctionsCommitMessage`, `metricDay`, `metricText`,
  `prepareCorrections` from corrections; `DEMO_DATA` from `scripts/lib/dataDirs.ts`; `commitChange`,
  `loadRepoState`, `RepoState` from `src/admin/pipeline.ts`; `FakeGitHubRepo` from
  `tests/support/fakeGitHub.ts`):

```ts
const metric = (
  managerId: string,
  date: string,
  metricId: string,
  count: number,
  reason = 'поздняя оплата',
): Correction => ({ kind: 'metric', managerId, date, metricId, count, reason });
const operator = (i: EngineInput, id: string, now = NOW) =>
  computeGameState(i, now).managers.find((m) => m.managerId === id);
const pay = input.config.metrics.find((m) => m.id === 'pay');

describe("an operator's numbers for a day (D-25, the author's choice A 11.10.2026)", () => {
  it('become points of that day by the weight, with the count in words in the reason', () => {
    const r = applyCorrections(input, [metric('op001', '2026-10-09', 'pay', 1)], OPTS);
    expect(r.problems).toEqual([]);
    expect(added(r)).toEqual([
      {
        id: 'adj-202610121405-1',
        type: 'manager_points',
        managerId: 'op001',
        date: '2026-10-09',
        value: 10,
        reason: 'Оплаты +1: поздняя оплата',
        by: 'admin',
        at: NOW,
      },
    ]);
    expect((operator(r.input, 'op001')?.points ?? 0) - (operator(input, 'op001')?.points ?? 0)).toBe(10);
    expect(r.lines).toEqual([
      'Показатели: Ершова Мария (СР1), 09.10 — Оплаты +1 = +10 баллов (поздняя оплата)',
    ]);
  });

  it("a minus takes points; the metric's counters stay as the exports gave them", () => {
    const r = applyCorrections(input, [metric('op001', '2026-10-05', 'inv20', -2, 'не тот')], OPTS);
    expect(added(r)).toMatchObject([{ value: -6, reason: 'Разговоры от 20 минут −2: не тот' }]);
    expect(operator(r.input, 'op001')?.totals).toEqual(operator(input, 'op001')?.totals);
  });

  it('the day is of the game and not after today', () => {
    const r = applyCorrections(
      input,
      [
        metric('op001', '2026-10-13', 'pay', 1),
        metric('op001', '2026-10-01', 'pay', 1),
        metric('op001', '', 'pay', 1),
      ],
      OPTS,
    );
    expect(r.problems.map((p) => p.message)).toEqual([
      '13.10 ещё не наступило',
      '01.10 — не день игры (05.10–18.10)',
      'укажите день',
    ]);
    expect(r.lines[2]).toBe('Показатели: Ершова Мария, без дня — Оплаты +1 (поздняя оплата)');
  });

  it('a fired operator may get a late payment: it counts for the team of that day (R-1)', () => {
    const r = applyCorrections(input, [metric('op002', '2026-10-08', 'pay', 1)], OPTS);
    expect(r.problems).toEqual([]);
    expect(place(r.input, 't2').points - place(input, 't2').points).toBe(10);
  });

  it('an unknown operator or metric, a count of 0 or a fraction are problems', () => {
    const r = applyCorrections(
      input,
      [
        metric('op999', '2026-10-09', 'pay', 1),
        metric('op001', '2026-10-09', 'xxx', 1),
        metric('op001', '2026-10-09', 'pay', 0),
        metric('op001', '2026-10-09', 'pay', 0.5),
      ],
      OPTS,
    );
    expect(r.problems.map((p) => p.message)).toEqual([
      'этого оператора нет в составе',
      'такого показателя нет в игре',
      'сколько — целое число, не 0',
      'сколько — целое число, не 0',
    ]);
  });

  it('a minus below zero for the day is warned about, never refused', () => {
    const none = applyCorrections(input, [metric('op003', '2026-10-05', 'pay', -1, 'ошибка')], OPTS);
    expect(none.problems).toEqual([]);
    expect(none.warnings).toEqual([
      'Белова Анна, 05.10: баллов за день станет меньше нуля (−10) — проверьте день и оператора',
    ]);
    const some = applyCorrections(input, [metric('op003', '2026-10-06', 'pay', -1, 'ошибка')], OPTS);
    expect(some.warnings).toEqual([]);
  });

  it('metricText: the count and its points in words', () => {
    if (!pay) throw new Error('нет метрики pay');
    expect(metricText(pay, 1)).toBe('Оплаты +1 = +10 баллов');
    expect(metricText(pay, -2)).toBe('Оплаты −2 = −20 баллов');
    expect(metricText({ ...pay, weight: 1 }, 1)).toBe('Оплаты +1 = +1 балл');
    expect(metricText({ ...pay, weight: 1.5 }, 1)).toBe('Оплаты +1 = +1,5 балла');
  });
});

describe('the batch as a whole (plan 2b-2)', () => {
  it('the default day: yesterday, inside the game, never after today', () => {
    expect(metricDay(input.config, '2026-10-12')).toBe('2026-10-11');
    expect(metricDay(input.config, '2026-10-05')).toBe('2026-10-05');
    expect(metricDay(input.config, '2026-10-25')).toBe('2026-10-18');
  });

  it('after the end of the game: the cells of the end, the last day allowed', () => {
    const late = { now: '2026-10-20T10:00:00+03:00', by: 'admin' };
    const end = place(input, 't1', late.now).position;
    const r = applyCorrections(
      input,
      [steps(1), metric('op001', '2026-10-18', 'pay', 1)],
      late,
    );
    expect(r.problems).toEqual([]);
    expect(place(r.input, 't1', late.now).position).toBeGreaterThan(end);
    expect(metricDay(input.config, '2026-10-20')).toBe('2026-10-18');
  });

  it('the same batch on a season changed meanwhile takes that season’s values (ADM-2)', () => {
    const batch = [steps(MAX)];
    const value = (r: CorrectionsResult) => (r.input.adjustments.at(-1) as { value: number }).value;
    expect(value(applyCorrections(input, batch, OPTS))).toBe(MAX - P);
    const moved = { ...input, adjustments: [teamSteps('other', 't1', 3, at('2026-10-12', '10:00'))] };
    expect(value(applyCorrections(moved, batch, OPTS))).toBe(MAX - P - 3);
  });

  it('the public message: counts only, zero counts left out (D-51)', () => {
    const all: Correction[] = [
      steps(1),
      steps(-1, 't2'),
      metric('op001', '2026-10-09', 'pay', 1),
      { kind: 'reset', teamId: 't2', reason: 'ошибка' },
    ];
    expect(correctionsCommitMessage(all)).toBe('корректировки: 2 — шаги, 1 — показатели, 1 — старт');
    expect(correctionsCommitMessage([all[2] as Correction])).toBe('корректировки: 1 — показатели');
  });
});

describe('a corrections batch from the screen to a commit (plan 2b-2)', () => {
  const DEMO = 'sales-quest-demo';
  const DEMO_NOW = '2026-10-14T12:00:00+03:00';
  let state: RepoState;
  beforeAll(async () => {
    state = await loadRepoState(FakeGitHubRepo.fromDir(DEMO_DATA), DEMO, new Map());
  });

  it('the step: the preview, the cells after the batch, the message of what applies', () => {
    const step = prepareCorrections(
      state,
      [steps(1), { kind: 'reset', teamId: 'нет', reason: 'тест' }],
      { now: DEMO_NOW, by: 'k' },
    );
    const row = step.preview.teams.find((t) => t.teamId === 't1');
    expect(row && row.after - row.before).toBe(1);
    expect(step.positions.get('t1')).toBe(row?.after);
    expect(step.max).toBe(computeGameState(state.input, DEMO_NOW).track.maxPosition);
    expect(step.result.problems).toEqual([{ index: 1, message: 'этой команды нет в игре' }]);
    expect(step.message).toBe('корректировки: 1 — шаги');
    expect(step.state).toBe(state);
  });

  it('a commit of the batch changes only the adjustments and the version', async () => {
    const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
    const s = await loadRepoState(fake, DEMO, new Map());
    const step = prepareCorrections(s, [steps(1, 't2', 'тест')], { now: DEMO_NOW, by: 'k' });
    await commitChange(fake, s, step.result.input, {
      phrase: DEMO,
      keys: new Map(),
      message: step.message,
      by: 'k',
      now: DEMO_NOW,
    });
    const first = fake.commits[0]?.files ?? new Map<string, string>();
    const changed = [...fake.last.files]
      .filter(([path, text]) => first.get(path) !== text)
      .map(([path]) => path)
      .sort();
    expect(changed).toEqual(['data/seasons/demo/adjustments.enc.json', 'data/version.json']);
    expect(fake.last.message).toBe('data(demo): корректировки: 1 — шаги [by k]');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/corrections.test.ts` — Expected: FAIL (the new
  exports missing; the metric tests refused «ещё не умею»).

- [ ] **Step 3: Implement** in `src/admin/corrections.ts`:
  - imports: `Metric` (with `SeasonConfig`, `Team`) from `season.ts`; `managerPointsBetween` from
    `../engine/adjustments.ts`; `addDays` (with `dateOf`); `prepare` (with the `EngineInput` type) from
    `../engine/prepare.ts`; `teamOn` from `../engine/roster.ts`; `pointsOf`, `weightsOf` from
    `../engine/scoring.ts`; `plural` from `../text.ts`; `previewChange`, `Preview`, `RepoState` from
    `./pipeline.ts`.
  - helpers and the `metric` case (replacing `refuse('ещё не умею')`):

```ts
/** count × weight, without the float's tails (3 × 0.1). */
const pointsOfCount = (metric: Metric, count: number) =>
  Math.round(count * metric.weight * 100) / 100;

/** A count of a metric and its points, in words: «Оплаты +1 = +10 баллов». */
export function metricText(metric: Metric, count: number): string {
  const value = pointsOfCount(metric, count);
  const word = Number.isInteger(value) ? plural(value, 'балл', 'балла', 'баллов') : 'балла';
  return `${metric.title} ${signed(count)} = ${signed(value)} ${word}`;
}

/** An operator's points for a day: the records by the weights and the point corrections of that day. */
function pointsOfDay(input: EngineInput, managerId: string, date: string): number {
  const values = prepare(input).series.get(managerId)?.get(date);
  const records = values ? pointsOf(values, weightsOf(input.config)) : 0;
  return managerPointsBetween(input.adjustments, date, date)
    .filter((e) => e.managerId === managerId)
    .reduce((sum, e) => sum + e.value, records);
}
```

```ts
    case 'metric': {
      const { config } = input;
      const m =
        config.managers.find((x) => x.id === c.managerId) ?? refuse('этого оператора нет в составе');
      const metric =
        config.metrics.find((x) => x.id === c.metricId) ?? refuse('такого показателя нет в игре');
      if (!isCount(c.count)) refuse('сколько — целое число, не 0');
      if (!isDay(c.date)) refuse('укажите день');
      const { start, end } = config.period;
      if (c.date < start || c.date > end)
        refuse(`${dayMonth(c.date)} — не день игры (${dayMonth(start)}–${dayMonth(end)})`);
      if (c.date > meta.today) refuse(`${dayMonth(c.date)} ещё не наступило`);
      const value = pointsOfCount(metric, c.count);
      if (value === 0) refuse(`у показателя «${metric.title}» вес 0 — баллов это не даст`);
      // The team of that day gets the points (R-1); a fired operator's late payment too.
      const team = teamOf(input, teamOn(m, c.date));
      const day = pointsOfDay(input, m.id, c.date) + value;
      return {
        adjustment: {
          ...base,
          type: 'manager_points',
          managerId: m.id,
          date: c.date,
          value,
          // The count in words for the journal (2b-3): the points alone do not say what was fixed.
          reason: `${metric.title} ${signed(c.count)}: ${reason}`,
        },
        line: `Показатели: ${m.fullName} (${teamLabel(team)}), ${dayMonth(c.date)} — ${metricText(metric, c.count)} (${reason})`,
        ...(day < 0
          ? {
              warning: `${m.fullName}, ${dayMonth(c.date)}: баллов за день станет меньше нуля (${signed(day)}) — проверьте день и оператора`,
            }
          : {}),
      };
    }
```

  - the default day, the message and the step:

```ts
/** The day an operator's numbers are fixed for by default: yesterday, inside the game. */
export function metricDay(config: SeasonConfig, today: string): string {
  const { start, end } = config.period;
  const day = addDays(today, -1);
  return day < start ? start : day > end ? end : day;
}

/** The public message of a batch (D-51): counts only, never a name. */
export function correctionsCommitMessage(corrections: Correction[]): string {
  const count = (kind: Correction['kind']) => corrections.filter((c) => c.kind === kind).length;
  const parts = (
    [
      [count('steps'), 'шаги'],
      [count('metric'), 'показатели'],
      [count('reset'), 'старт'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${String(n)} — ${what}`);
  return `корректировки: ${parts.join(', ')}`;
}

/**
 * A corrections batch as the screen runs it (plan 2b-2), pure: the batch applied to the season read
 * from GitHub, the preview «было → станет», the cells after it and the public message. «Записать»
 * commits `result.input` on `state` — the read the preview was made of (ADM-2).
 */
export type CorrectionsStep = {
  state: RepoState;
  result: CorrectionsResult;
  preview: Preview;
  /** Each team's cell with the batch applied — where the next correction starts from. */
  positions: Map<string, number>;
  /** The last cell of the track: the end of the overflow zone. */
  max: number;
  message: string;
};

export function prepareCorrections(
  state: RepoState,
  corrections: Correction[],
  opts: { now: string; by: string },
): CorrectionsStep {
  const result = applyCorrections(state.input, corrections, opts);
  const preview = previewChange(state.input, result.input, opts.now);
  const applied = corrections.filter((_, i) => !result.problems.some((p) => p.index === i));
  return {
    state,
    result,
    preview,
    positions: new Map(preview.teams.map((t) => [t.teamId, t.after])),
    max: computeGameState(state.input, opts.now).track.maxPosition,
    message: correctionsCommitMessage(applied),
  };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/admin/corrections.test.ts` — Expected: PASS (all); then
  `npm run format && npm run typecheck && npm run lint && npm test` — Expected: exit 0 each.

- [ ] **Step 5: Commit** «Admin: an operator's numbers for a day as points by the weight, the default
  day, the message of counts, the step with its preview (D-25, R-1, ADM-PREVIEW, plan 2b-2 task 2)».

### Task 3: The parts the two batch screens share — the draft and the form

**Где смотреть:** код `src/admin/RosterDraft.tsx` (черновик пачки, запись, «данные изменились»),
`src/admin/RosterForms.tsx` (`Form`, `Field`, `TeamSelect`), `src/admin/Roster.tsx`; e2e «Состав и
команды», «данные изменились», «Записываю…», «несохранённые», «открытая форма» в
`tests/e2e/admin.spec.ts` — сеть безопасности этого рефакторинга; навигатор §3.

**Files:**
- Create: `src/admin/BatchDraft.tsx`, `src/admin/FormParts.tsx`
- Modify: `src/admin/RosterDraft.tsx` (a thin wrapper), `src/admin/RosterForms.tsx` (imports the parts)

**Interfaces:**
- Produces:
  ```ts
  // src/admin/BatchDraft.tsx
  export type BatchView = {
    state: RepoState; // the read the batch was applied to: the commit's base (ADM-2)
    input: EngineInput; // the season after the batch: what «Записать» writes
    lines: string[];
    problems: { index: number; message: string }[];
    warnings: string[];
    preview: Preview;
    message: string; // public: counts only (D-51)
  };
  export function BatchDraft(props: {
    session: Session;
    name: string; // test ids `${name}-draft`, `${name}-preview`, `${name}-commit`
    title: string; // «Несохранённые изменения» → «Несохранённые изменения (N)»
    batch: readonly unknown[]; // a new batch hides the preview made for the old one
    view: BatchView;
    extra?: ReactNode; // more of the preview, before the moves
    onRemove: (index: number) => void;
    onWritten: () => void; // the batch is written: empty it
    onState: (state: RepoState) => void;
    onCommitted: (rev: string) => void;
    busy: boolean;
    setBusy: (busy: boolean) => void;
  }): ReactNode;
  // src/admin/FormParts.tsx
  export function Form(props: {
    title: string;
    children: ReactNode;
    onSubmit: () => void;
    onCancel?: () => void; // no «Отмена» without it
    submit?: string; // default «В изменения»
    submitDisabled?: boolean;
    named?: boolean; // aria-label = title: the form is a landmark of its own
  }): ReactNode;
  export function Field(props: { label: string; children: ReactNode }): ReactNode;
  export function TeamSelect(props: {
    teams: Team[];
    value: string;
    onChange: (teamId: string) => void;
  }): ReactNode;
  ```

- [ ] **Step 1: The safety net is green before the move** — `npx vitest run tests/unit/admin` and
  `npx playwright test tests/e2e/admin.spec.ts --project=e2e` — Expected: PASS (the 2b-1 state).

- [ ] **Step 2: `FormParts.tsx`** — `Form`, `Field`, `TeamSelect` moved verbatim out of `RosterForms.tsx`
  (which now imports them), `Form` extended:

```tsx
export function Form({
  title,
  children,
  onSubmit,
  onCancel,
  submit = 'В изменения',
  submitDisabled = false,
  named = false,
}: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel?: () => void;
  submit?: string;
  submitDisabled?: boolean;
  named?: boolean;
}) {
  const send = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form
      className="sq-parchment w-full space-y-2 px-3 py-2 text-sm"
      onSubmit={send}
      {...(named ? { 'aria-label': title } : {})}
    >
      <div className="sq-caps">{title}</div>
      {children}
      <div className="flex gap-2">
        <button className="sq-button" type="submit" disabled={submitDisabled}>
          {submit}
        </button>
        {onCancel && (
          <button className="sq-button" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
```

  (`named` stays off for the roster's forms: their «Команда» form would otherwise answer
  `getByLabel('Команда')` next to the select of the same name.)

- [ ] **Step 3: `BatchDraft.tsx`** — the body of today's `RosterDraft` with: `edits` → `batch` (the
  preview remembers the batch it was made for: `shown === batch`); `step.result.*` → `view.*`;
  `commitChange(session.repo, view.state, view.input, { message: view.message, … })`; done →
  `onWritten(); onCommitted(result.rev)`; «×» → `onRemove(i)`; the title `${title} (${batch.length})`;
  the test ids from `name`; in the preview: the «Уберите красные строки…» line, then `extra`, then
  `<PreviewMoves preview={view.preview} />`, then «Подпись в истории: …»; `if (batch.length === 0)
  return null`. The doc comment: «The unsaved batch of a screen (plans 2b-1, 2b-2): line by line with
  «×», the preview «было → станет», one commit on the read the preview was made of. After «данные
  изменились» the season is read again and the screen applies the same batch to it — lines that no
  longer fit turn red (ADM-2).»

- [ ] **Step 4: `RosterDraft.tsx`** becomes:

```tsx
import type { RosterEdit } from './roster.ts';
import { withoutEdit, type PeopleRow, type RosterStep } from './rosterStep.ts';
import { BatchDraft } from './BatchDraft.tsx';
import type { RepoState } from './pipeline.ts';
import type { Session } from './session.ts';

/** People per team «было → станет»: what a roster batch changes beyond the cells. */
function PeopleTable({ people }: { people: PeopleRow[] }) {
  return (
    <table className="sq-parchment w-full">
      <thead>
        <tr className="text-left">
          <th>Команда</th>
          <th>Людей сейчас: было → станет</th>
        </tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.teamId}>
            <td>{p.label}</td>
            <td className={p.before !== p.after ? 'font-bold' : ''}>
              {p.before === p.after ? p.after : `${p.before} → ${p.after}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** «Несохранённые изменения» of the roster (plan 2b-1): the shared batch draft with the people per team. */
export function RosterDraft({
  session,
  step,
  edits,
  onEdits,
  onState,
  onCommitted,
  busy,
  setBusy,
}: {
  session: Session;
  step: RosterStep;
  edits: RosterEdit[];
  onEdits: (edits: RosterEdit[]) => void;
  onState: (state: RepoState) => void;
  onCommitted: (rev: string) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  return (
    <BatchDraft
      session={session}
      name="roster"
      title="Несохранённые изменения"
      batch={edits}
      view={{
        state: step.state,
        input: step.input,
        lines: step.result.lines,
        problems: step.result.problems,
        warnings: step.result.warnings,
        preview: step.preview,
        message: step.message,
      }}
      extra={<PeopleTable people={step.people} />}
      onRemove={(i) => onEdits(withoutEdit(edits, i))}
      onWritten={() => onEdits([])}
      onState={onState}
      onCommitted={onCommitted}
      busy={busy}
      setBusy={setBusy}
    />
  );
}
```

- [ ] **Step 5: Run** `npm run format && npm run typecheck && npm run lint && npx vitest run
  tests/unit/admin` and `npx playwright test tests/e2e/admin.spec.ts --project=e2e` — Expected: exit 0;
  every admin e2e test PASS as in Step 1 (nothing visible changed).

- [ ] **Step 6: Commit** «Admin: the batch draft and the form parts shared by the batch screens —
  RosterDraft a thin wrapper, nothing visible changed (plan 2b-2 task 3)».

### Task 4: The screen «Корректировки» and its e2e test

**Где смотреть:** спецификация 2б-2 §1; DECISIONS D-46 (стиль `sq-*`); код `src/admin/Roster.tsx`
(образец экрана пачки: `fieldset disabled={busy}`, «Назад»), `src/admin/AdminPage.tsx` (виды, пачка,
`beforeunload`, `leaveBatch`), `src/admin/Home.tsx`, `src/admin/FormParts.tsx`, `src/admin/BatchDraft.tsx`,
`src/text.ts` (`plateName`); e2e-хелперы `login`, `changed` в `tests/e2e/admin.spec.ts`; Playwright
`page.clock.setFixedTime`; навигатор §3.

**Files:**
- Create: `src/admin/Corrections.tsx`, `src/admin/CorrectionForms.tsx`
- Modify: `src/admin/Home.tsx` (the button), `src/admin/AdminPage.tsx` (the view, the batch, the guards)
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`Correction`, `prepareCorrections`, `CorrectionsStep`, `parseCount`,
  `stepsHint`, `metricText`, `metricDay`, `BatchDraft`, `Form`, `Field`, `TeamSelect`).
- Produces: `Corrections({ session, corrections, onCorrections, onState, onCancel, onCommitted })`;
  `Home` gets `onCorrections`; test ids `corrections`, `corrections-draft`, `corrections-preview`,
  `corrections-commit`; the forms are named landmarks «Шаги команде», «Показатели оператора за день»,
  «Вернуть команду на старт».

- [ ] **Step 1: The e2e test** — add to `tests/e2e/admin.spec.ts` (imports: `computeGameState`,
  `GameState` from `../../src/engine/gameState.ts`; `teamOn` from `../../src/engine/roster.ts`):

```ts
test('«Корректировки»: a bonus to a team and +1 payment for yesterday are one commit of the adjustments only (ADM-STEPS, D-25)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The admin's today is pinned: the default day and the cells must not depend on when the test runs.
  const NOW = '2026-10-14T12:00:00+03:00';
  await page.clock.setFixedTime(new Date(NOW));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const before = (await loadRepoState(fake, DEMO, new Map())).input;
  const operator = before.config.managers.find(
    (m) => m.firedAt === undefined && teamOn(m, '2026-10-13') === 't3',
  );
  if (!operator) throw new Error('в демо нет оператора команды t3');
  await login(page, fake);
  await page.getByRole('button', { name: 'Корректировки' }).click();
  const screen = page.getByTestId('corrections');

  const steps = screen.getByRole('form', { name: 'Шаги команде' });
  await steps.getByLabel('Команда', { exact: true }).selectOption({ label: 'Егор Лебедев' });
  await steps.getByLabel('Шаги', { exact: true }).fill('+2');
  await steps.getByLabel('Причина', { exact: true }).fill('конкурс');
  await expect(steps.getByText(/^Егор Лебедев: клетка \d+ → \d+$/)).toBeVisible();
  await steps.getByRole('button', { name: 'В корректировки' }).click();

  const metric = screen.getByRole('form', { name: 'Показатели оператора за день' });
  await expect(metric.getByLabel('День', { exact: true })).toHaveValue('2026-10-13');
  await metric.getByLabel('Оператор', { exact: true }).selectOption(operator.id);
  await metric.getByLabel('Показатель', { exact: true }).selectOption({ label: 'Оплаты' });
  await metric.getByLabel('Сколько', { exact: true }).fill('1');
  await metric.getByLabel('Причина', { exact: true }).fill('поздняя оплата');
  await expect(metric.getByText('Оплаты +1 = +10 баллов')).toBeVisible();
  await expect(metric.getByText(/посчита\S* дважды/)).toBeVisible();
  await metric.getByRole('button', { name: 'В корректировки' }).click();

  const draft = page.getByTestId('corrections-draft');
  await expect(draft.getByRole('list', { name: 'Изменения' }).getByRole('listitem')).toHaveCount(2);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('corrections-preview')).toBeVisible();
  await page.getByTestId('corrections-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect(fake.last.message).toBe(
    'data(demo): корректировки: 1 — шаги, 1 — показатели [by koordinator]',
  );
  expect(changed(fake, 0, 1)).toEqual([
    'data/seasons/demo/adjustments.enc.json',
    'data/version.json',
  ]);
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  expect(after.adjustments.slice(before.adjustments.length)).toMatchObject([
    { type: 'team_steps', teamId: 't6', value: 2, reason: 'конкурс', by: 'koordinator' },
    {
      type: 'manager_points',
      managerId: operator.id,
      date: '2026-10-13',
      value: 10,
      reason: 'Оплаты +1: поздняя оплата',
    },
  ]);
  const was = computeGameState(before, NOW);
  const now = computeGameState(after, NOW);
  const cell = (s: GameState) => s.teams.find((t) => t.teamId === 't6')?.position ?? -1;
  const points = (s: GameState) => s.managers.find((m) => m.managerId === operator.id)?.points ?? 0;
  expect(cell(now)).toBe(cell(was) + 2);
  expect(points(now) - points(was)).toBeCloseTo(10);
});
```

- [ ] **Step 2: Run** `npx playwright test tests/e2e/admin.spec.ts --project=e2e -g "Корректировки"` —
  Expected: FAIL (no «Корректировки» button).

- [ ] **Step 3: Implement.**
  - `Home.tsx`: `onCorrections: () => void`; a button «Корректировки» right after «Состав и команды».
  - `AdminPage.tsx`:
    - `type View = 'home' | 'import' | 'new' | 'roster' | 'corrections'` for `view` and `setView`;
    - `const [corrections, setCorrections] = useState<Correction[]>([]);` beside the roster batch (it
      survives a visit to another screen);
    - `const unsaved = rosterEdits.length + corrections.length;` (the `beforeunload` effect as is);
      `leaveBatch` asks
      `` `Есть несохранённые изменения (${parts}) — они пропадут. Уйти без записи?` `` with `parts` =
      `[rosterEdits.length > 0 ? `состав — ${n}` : null, corrections.length > 0 ? `корректировки — ${m}`
      : null]` joined by `', '`;
    - «Выйти» and `launched` empty both batches;
    - `view === 'corrections'` renders `<Corrections session={session} corrections={corrections}
      onCorrections={setCorrections} onState={(state) => setSession({ ...session, state })} onCancel={()
      => setView('home')} onCommitted={committed} />`; `Home` gets `onCorrections={() =>
      setView('corrections')}`.
  - `CorrectionForms.tsx` — the three forms; each `named`, `submit="В корректировки"`, no «Отмена» (they
    stay open); after a submit the count and the reason are cleared (the team, the operator and the day
    stay — the next correction is often the same person):

```tsx
import { useState } from 'react';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import { teamOn } from '../engine/roster.ts';
import { dayMonth } from '../import/grid.ts';
import { plateName } from '../text.ts';
import {
  metricDay,
  metricText,
  parseCount,
  stepsHint,
  type Correction,
} from './corrections.ts';
import { Field, Form, TeamSelect } from './FormParts.tsx';
import { teamLabel } from './roster.ts';

/**
 * The forms of «Корректировки» (ADM-STEPS, ADM-RESET-TEAM, plan 2b-2): each turns what the admin typed
 * into a correction for the batch — nothing is written until «Записать». Whether it applies is the
 * batch's to say (a red line); the forms only show what it will do.
 */

type Add = (c: Correction) => void;
const isCount = (n: number) => Number.isInteger(n) && n !== 0;

function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Причина">
      <input
        className="sq-input flex-1"
        aria-label="Причина"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function Count({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="sq-input w-20"
      inputMode="numeric"
      aria-label={label}
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** «Шаги команде»: a bonus (+N) or a penalty (−N), never past the start or the end (no debt). */
export function StepsForm({
  teams,
  positions,
  max,
  onAdd,
}: {
  teams: Team[];
  /** Each team's cell with the batch applied. */
  positions: Map<string, number>;
  max: number;
  onAdd: Add;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [steps, setSteps] = useState('');
  const [reason, setReason] = useState('');
  const n = parseCount(steps);
  const team = teams.find((t) => t.id === teamId);
  const hint =
    steps.trim() === ''
      ? 'Например, +3 или −2'
      : isCount(n)
        ? `${team ? teamLabel(team) : ''}: ${stepsHint(positions.get(teamId) ?? 0, n, max)}`
        : 'шаги — целое число, не 0';
  return (
    <Form
      title="Шаги команде"
      named
      submit="В корректировки"
      onSubmit={() => {
        onAdd({ kind: 'steps', teamId, steps: n, reason });
        setSteps('');
        setReason('');
      }}
    >
      <Field label="Команда">
        <TeamSelect teams={teams} value={teamId} onChange={setTeamId} />
      </Field>
      <Field label="Шаги (+ бонус, − штраф)">
        <Count label="Шаги" value={steps} onChange={setSteps} />
      </Field>
      <Reason value={reason} onChange={setReason} />
      <p className="sq-dim">{hint}</p>
    </Form>
  );
}

/** «Показатели оператора за день»: a count of a metric for a day, written as its points (D-25). */
export function MetricForm({
  config,
  teams,
  today,
  onAdd,
}: {
  config: SeasonConfig;
  teams: Team[];
  today: string;
  onAdd: Add;
}) {
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const last = today < config.period.end ? today : config.period.end;
  const [managerId, setManagerId] = useState('');
  const [date, setDate] = useState(() => metricDay(config, today));
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? '');
  const [count, setCount] = useState('');
  const [reason, setReason] = useState('');
  const metric = metrics.find((m) => m.id === metricId);
  const n = parseCount(count);
  // People by the team of the chosen day (R-1), the fired too: a late payment is theirs.
  const groups = teams.map((t) => ({
    team: t,
    people: config.managers
      .filter((m) => teamOn(m, date) === t.id)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
  }));
  return (
    <Form
      title="Показатели оператора за день"
      named
      submit="В корректировки"
      onSubmit={() => {
        onAdd({ kind: 'metric', managerId, date, metricId, count: n, reason });
        setCount('');
        setReason('');
      }}
    >
      <Field label="Оператор">
        <select
          className="sq-input w-auto"
          aria-label="Оператор"
          required
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
        >
          <option value="">— выберите —</option>
          {groups.map(({ team, people }) => (
            <optgroup key={team.id} label={plateName(team.leaderName, team.sourceCode)}>
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                  {m.firedAt ? ` · увольнение с ${dayMonth(m.firedAt)}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="День">
        <input
          type="date"
          required
          className="sq-input w-auto"
          aria-label="День"
          min={config.period.start}
          max={last}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field label="Показатель">
        <select
          className="sq-input w-auto"
          aria-label="Показатель"
          value={metricId}
          onChange={(e) => setMetricId(e.target.value)}
        >
          {metrics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Сколько (+ или −)">
        <Count label="Сколько" value={count} onChange={setCount} />
      </Field>
      <Reason value={reason} onChange={setReason} />
      <p className="sq-dim">
        {count.trim() === ''
          ? 'Например, +1 или −1'
          : isCount(n) && metric
            ? metricText(metric, n)
            : 'сколько — целое число, не 0'}
      </p>
      {n > 0 && (
        <p className="sq-plate px-3 py-1">
          Если это потом придёт в выгрузке, оно посчитается дважды — тогда корректировку нужно будет
          убрать.
        </p>
      )}
    </Form>
  );
}

/** «Вернуть команду на старт» (D-17): rare, so behind «Редкое» and a checkbox. */
export function ResetForm({
  teams,
  positions,
  onAdd,
}: {
  teams: Team[];
  positions: Map<string, number>;
  onAdd: Add;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  return (
    <Form
      title="Вернуть команду на старт"
      named
      submit="В корректировки"
      submitDisabled={!sure}
      onSubmit={() => {
        onAdd({ kind: 'reset', teamId, reason });
        setReason('');
        setSure(false);
      }}
    >
      <Field label="Команда">
        <TeamSelect teams={teams} value={teamId} onChange={setTeamId} />
      </Field>
      <Reason value={reason} onChange={setReason} />
      <p className="sq-dim">
        клетка {positions.get(teamId) ?? 0} → 0; дальше фигурка пойдёт от старта по новым данным.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        Понимаю: фигурка встанет на старт; отменить можно будет только после части 2б-3
      </label>
    </Form>
  );
}
```

  - `Corrections.tsx` (`data-testid="corrections"`):

```tsx
import { useState } from 'react';
import { localDate, localTimestamp } from '../data/time.ts';
import { dayMonth } from '../import/grid.ts';
import { plateName } from '../text.ts';
import { BatchDraft } from './BatchDraft.tsx';
import { MetricForm, ResetForm, StepsForm } from './CorrectionForms.tsx';
import { prepareCorrections, type Correction } from './corrections.ts';
import type { RepoState } from './pipeline.ts';
import type { Session } from './session.ts';

/**
 * «Корректировки» (ADM-STEPS, ADM-RESET-TEAM, plan 2b-2): the teams' cells as they will be after the
 * batch, three forms that add corrections to it, the batch written once (`BatchDraft`). The batch
 * lives in the admin page, so it survives a visit elsewhere.
 */
export function Corrections({
  session,
  corrections,
  onCorrections,
  onState,
  onCancel,
  onCommitted,
}: {
  session: Session;
  corrections: Correction[];
  onCorrections: (corrections: Correction[]) => void;
  onState: (state: RepoState) => void;
  onCancel: () => void;
  onCommitted: (rev: string) => void;
}) {
  // A commit runs: no correction may join the batch being written, nor the screen be left.
  const [busy, setBusy] = useState(false);
  const today = localDate(new Date());
  const step = prepareCorrections(session.state, corrections, {
    now: localTimestamp(new Date()),
    by: session.login,
  });
  const config = session.state.input.config;
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  const add = (c: Correction) => onCorrections([...corrections, c]);
  const cells = new Map(step.preview.teams.map((t) => [t.teamId, t]));

  return (
    <div className="space-y-3" data-testid="corrections">
      <section className="sq-panel space-y-2 px-4 py-3">
        <div className="sq-title sq-caps">Корректировки</div>
        <p className="sq-dim text-sm">
          Клетки команд на {dayMonth(today)} — с учётом несохранённых корректировок. Ничего не
          записывается, пока вы не нажмёте «Записать» внизу.
        </p>
        <table className="sq-parchment w-full text-sm">
          <tbody>
            {teams.map((t) => {
              const c = cells.get(t.id);
              return (
                <tr key={t.id}>
                  <td>{plateName(t.leaderName, t.sourceCode)}</td>
                  <td className={c && c.before !== c.after ? 'font-bold' : ''}>
                    клетка{' '}
                    {c ? (c.before === c.after ? c.after : `${c.before} → ${c.after}`) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <fieldset disabled={busy} className="m-0 min-w-0 space-y-3 border-0 p-0">
        <section className="sq-panel px-4 py-3">
          <StepsForm teams={teams} positions={step.positions} max={step.max} onAdd={add} />
        </section>
        <section className="sq-panel px-4 py-3">
          <MetricForm config={config} teams={teams} today={today} onAdd={add} />
        </section>
        <details className="sq-panel px-4 py-3">
          <summary className="cursor-pointer text-sm">Редкое</summary>
          <ResetForm teams={teams} positions={step.positions} onAdd={add} />
        </details>
      </fieldset>

      <BatchDraft
        session={session}
        name="corrections"
        title="Несохранённые корректировки"
        batch={corrections}
        view={{
          state: step.state,
          input: step.result.input,
          lines: step.result.lines,
          problems: step.result.problems,
          warnings: step.result.warnings,
          preview: step.preview,
          message: step.message,
        }}
        onRemove={(i) => onCorrections(corrections.filter((_, j) => j !== i))}
        onWritten={() => onCorrections([])}
        onState={onState}
        onCommitted={onCommitted}
        busy={busy}
        setBusy={setBusy}
      />
      <button className="sq-button" disabled={busy} onClick={onCancel}>
        Назад
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx playwright test tests/e2e/admin.spec.ts --project=e2e` — Expected: every
  admin test PASS (the new one included); `npm run format && npm run typecheck && npm run lint && npm
  test` — Expected: exit 0 each.

- [ ] **Step 5: Commit** «Admin: the screen «Корректировки» — steps to a team, an operator's numbers for a
  day, a team back to the start, one batch with a preview and one commit (ADM-STEPS, ADM-RESET-TEAM,
  ADM-PREVIEW, D-25, plan 2b-2 task 4)».

### Task 5: A conflict re-applies the corrections; the whole suite; screenshots for the author

**Где смотреть:** спецификация 2б-2 §3; SPEC ADM-2; код `tests/support/fakeGitHub.ts` (`beforeMove`,
`advance`), e2e «данные изменились» роста 2б-1 в `tests/e2e/admin.spec.ts`; CLAUDE.md «Проверка»;
навигатор §14.

**Files:**
- Test: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: The e2e test** (it must pass on the code of Task 4; a mutation check proves it bites —
  in `BatchDraft` skip `onState(fresh)` after a `ConflictError`, see it fail, restore):

```ts
test('«данные изменились» while correcting: the batch is applied to the fresh season and written (ADM-2)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  let other = true;
  // Another admin commits once, right before our first attempt moves `main`.
  await login(page, fake, {
    beforeMove: () => {
      if (other) fake.advance();
      other = false;
    },
  });
  await page.getByRole('button', { name: 'Корректировки' }).click();
  const steps = page.getByTestId('corrections').getByRole('form', { name: 'Шаги команде' });
  await steps.getByLabel('Команда', { exact: true }).selectOption({ label: 'Егор Лебедев' });
  await steps.getByLabel('Шаги', { exact: true }).fill('−1');
  await steps.getByLabel('Причина', { exact: true }).fill('штраф');
  await steps.getByRole('button', { name: 'В корректировки' }).click();
  const draft = page.getByTestId('corrections-draft');
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('corrections-commit').click();
  await expect(page.getByRole('status').filter({ hasText: 'данные изменились' })).toBeVisible();
  expect(fake.commits.map((c) => c.message)).toEqual(['начало', 'другой админ']);
  await expect(draft.getByRole('list', { name: 'Изменения' }).getByRole('listitem')).toHaveCount(1);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('corrections-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
  expect(fake.commits).toHaveLength(3);
  expect(fake.last.parent).toBe('c1');
  expect(fake.last.message).toBe('data(demo): корректировки: 1 — шаги [by koordinator]');
});
```

- [ ] **Step 2: Run** `npx playwright test tests/e2e/admin.spec.ts --project=e2e` — Expected: PASS; the
  mutation — FAIL; restored — PASS.

- [ ] **Step 3: The whole suite** — `npm run typecheck && npm run lint && npm test && npm run test:e2e`
  (QA-4 unchanged: the admin is not in the viewer's chunk); `npm run build && npm run size` — the initial
  JS unchanged (383 KB gzip after 2b-1).

- [ ] **Step 4: Screenshots** with a temporary spec `tests/e2e/zz-corrections.spec.ts` (never committed;
  the clock pinned to 14.10): the screen with the cells and the three forms filled (the hints visible,
  «Редкое» open), the batch with a red line (a penalty beyond the start after a first one that took the
  team to 0) and the preview — sent to the author.

- [ ] **Step 5: Commit** «e2e: the corrections batch re-applied after «данные изменились» (ADM-2, plan
  2b-2 task 5)».

### Task 6: Docs, the review, the report, the push

**Где смотреть:** CLAUDE.md (текущий этап), `docs/NAVIGATOR.md` §3 и §16, `docs/BACKLOG.md` «Этап 2»,
`docs/DECISIONS.md` D-17, D-25, D-51, D-52.

- [ ] DECISIONS (in Russian, as the file is): **D-53** — corrections as a batch re-applied after a
  conflict; steps without debt (the written value is what the figure really moves, 0 refused); an
  operator's numbers for a day as `manager_points` of `count × weight` for that day, the reason
  «<показатель> ±N: <причина>», the day of the game and not after today, a fired operator allowed, the
  counters untouched, a later change of weights does not rescale them, the double-count caveat; a reset
  stores the computed cell (≥ 0); ids `adj-<YYYYMMDDHHmm>-<n>`; the message of counts; a minus below
  zero for a day is a warning. NAVIGATOR §3 (the corrections: where to look; `BatchDraft`, `FormParts`),
  §16 (2b-2 done, 2b-3 next). BACKLOG «Этап 2»: 2b-2 out of «Дальше»; a note for 2b-3 — the journal
  should show corrections with their reasons, the undo should be offered for a doubled payment. CLAUDE.md:
  the current stage line names the plan of 2b-2.
- [ ] An independent review of the plan's range (a subagent on the most capable model; it never opens
  the root `*.xlsx`, `refs/` or `assets-src/` and never decrypts `data/`), with this plan's Review Focus;
  Critical/Important fixed by TDD; minors to BACKLOG.
- [ ] A short report to the author in Russian (what is new, how to use it, what was decided); the push
  only after «да». The game's data are not touched by the push.
