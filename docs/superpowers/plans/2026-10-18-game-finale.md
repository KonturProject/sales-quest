# The finale of the game — Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process: executing-plans
> with a ledger and TDD), an independent review subagent (opus) checks the whole plan at the end (Task 8).
> Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md`.

**Goal:** the author's «Подвести итоги» closes the game; every screen then plays a one-minute ceremony once
(the department's result, the best in each team, significant achievements, the top 3 operators, the podium
with fireworks over the winner) and keeps a results screen over the map until the next game.

**Architecture:** pure `src/finale/` — `results.ts` (everything shown, from `GameState`, the config and the
adjustments), `ceremony.ts` (the steps on a clock), `seen.ts` (the ceremony this browser played). The admin
writes `status: 'closed'` and `closedAt` into the season's config through the existing batch screen
(`BatchDraft`, `commitChange`). The HUD swaps the rating, the cards and the moments for `src/hud/Finale.tsx`
while the live view's config is closed; fireworks come through a new command `requestCelebration` that the scene's
player and the 2D scheme draw with the D-57 pool.

**Tech Stack:** React 19, TypeScript 6 strict, zod 4, Tailwind 4 + `src/hud/theme.css`, three.js / R3F,
Vitest, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-10-18-game-finale-design.md` (approved 18.10.2026); SPEC FR-LB-5,
PERF-1, PERF-3, §12; DECISIONS D-11, D-26, D-38, D-46, D-51, D-53, D-56, D-57, D-58, R-5.

**Refinements of the spec made here:**
- `seasons/index.json` is not touched by the closing: only the new-game wizard reads it, and it closes the
  active season itself (`launchChange`). One commit path (`commitChange`), one file changed (the config).
- The finale shows only on the live view: `?date=` and `?cells=` looks show the map as before.
- The celebration's fireworks are not a walk: `moving()` stays false, so the ceremony's clock and the moments do
  not stop for them (D-56 run clocks stop while figures walk).
- A team whose members brought it no points gets no «лучший в команде» card (no «0» hero).

## Global Constraints

- The engine (`src/engine`) does not change; the only schema change is an optional `closedAt` (a local timestamp,
  D-11) on the season config — old open pages read the closed season as before (zod strips unknown keys).
- Public commit messages: «итоги игры 12.10–25.10» and «игра снова идёт: 12.10–25.10» — dates only (D-51).
- PERF-1: no endless loops; the ceremony's clock is the D-56 run clock (ticks 10/s only while it runs); the
  overlay redraws only when the step or a reveal changes; fireworks use the D-57 pool (≤ 200 points) and the
  scene draws frames only while sparks live.
- PERF-3: a hidden tab plays nothing; the ceremony waits for the tab to be shown.
- `prefers-reduced-motion: reduce`: no fireworks, numbers at once, no slide-ins.
- Browser memory `sq.finale.v1`, every access in `try/catch`; without storage the ceremony plays on every visit.
- HUD style D-46: `sq-*` classes, no `backdrop-filter`, blurred shadows or glow; Russian UI text, English comments;
  the HUD does not import from `src/scheme` (lazy chunk).
- No real names in the repo; tests use builders and the demo; e2e tokens `test-token`.
- The viewers' initial JS ≤ 600 KB gzip; the admin's code stays in its lazy chunk.
- Must be on the site before 26.10.2026; push only after the author's «да» (D-3).

## Review Focus

1. **A tie on the podium** (same cell and same share; a tie for first) — both teams share the place, the podium
   still reads 1-2-3 steps, fireworks over each first — Task 1 test «an exact tie shares a place».
2. **A closed season opened on a page that has already seen this closing** — no ceremony, the results screen at
   once; a new closing (`closedAt` changed) plays it again — Task 3 test «a new closing plays again».
3. **A correction or import after the closing** — the results screen follows the new numbers, no moments over
   it — Task 6 e2e «the results follow the data».
4. **«Вернуть игру» after a closing** — every screen goes back to the map, rating and cards — Task 5 test «reopen
   restores active» and Task 6 e2e «a reopened game shows the map».
5. **A manual «Оплаты +1» correction whose reason does not parse** (edited by hand, other metric title) — left out
   of the counts, the rest counted — Task 2 test «an unreadable correction is not guessed».

---

### Task 1: The config's closing, the podium, the best in each team, the top 3 (pure)

**Где смотреть:** спецификация («Goals», «Our calls»); скилл `.claude/skills/engine-rules` (правка схемы);
`src/data/schemas/season.ts` (`status`), `src/data/schemas/common.ts` (тип локального времени, если есть);
`src/engine/gameState.ts` (`TeamState.position`, `progress`, `points`, `targetPoints`; `contributions`;
`managers[].rank`), `src/engine/roster.ts` (`membersOn`), `src/hud/rating.ts` (как слайд команды берёт состав),
`src/hud/badges.ts` (`managerBadges`, `Badge`), `src/text.ts` (`plateName`, `shortName`); построители
`tests/support/builders.ts`.

**Files:**
- Modify: `src/data/schemas/season.ts` (optional `closedAt`)
- Create: `src/finale/results.ts`
- Test: `tests/unit/finale/results.test.ts`, the schema test that covers `SeasonConfig` (`tests/unit/schemas/*`)

**Interfaces:**
- Produces (`src/finale/results.ts`):
  - `type PodiumPlace = { place: number; teamId: string; title: string; color: string; position: number; progress: number }`
    — `title` = `plateName(team.leaderName, team.sourceCode)`;
  - `podiumOf(game: GameState, config: SeasonConfig): PodiumPlace[]` — teams by `position` desc, then `progress`
    desc; standard competition ranking (1, 2, 2, 4); every team with `place ≤ 3`;
  - `type TeamBest = { teamId: string; teamTitle: string; color: string; managerId: string; name: string; points: number }`;
  - `bestInTeams(game: GameState, config: SeasonConfig): TeamBest[]` — in team order; per team, among
    `membersOn(config.managers, team.id, game.today)` not fired, the most `contributions` points for that team
    (ties by name `ru`); no card when the best has `< 0.5` points;
  - `type TopOperator = { rank: number; managerId: string; name: string; teamId: string; points: number; badges: Badge[] }`;
  - `topOperators(game: GameState, config: SeasonConfig, n = 3): TopOperator[]` — the leaderboard's ranks
    (`rank !== null`), at most `n`, ties as the leaderboard ranks them (FR-LB-5);
  - schema: `closedAt?: string` on the season config.

- [ ] **Step 1: Write the failing tests** — `tests/unit/finale/results.test.ts`, on `computeGameState` with
  `makeConfig`, `team`, `manager`, `daily`, `teamSteps`, `at`:
  - `the podium: by cells, then by the share of the plan` — three teams; t2 one cell ahead of t1 by an admin's
    `teamSteps` though t1 has the larger share → order t2, t1, t3; `place` 1, 2, 3; `title` uses `sourceCode`.
  - `two teams on one cell are told apart by the share` — same `position`, different `progress` → places 1, 2.
  - `an exact tie shares a place` — two teams with identical records (same plans) → both `place: 1`, the next
    `place: 3`; four teams → the podium lists three entries (1, 1, 3).
  - `the best in each team: today's members, by what they brought the team` — an operator moved t1 → t2 mid-game
    with more points brought to t1 than anyone in t1 → is t2's best only (if best there), not t1's; a fired
    operator is never the best; a vacationer can be.
  - `a team without points has no card` — t3 with no records → no `TeamBest` for t3.
  - `the top 3 of the game, the fired left out, with badges` — four operators, one fired with the most points →
    ranks 1–3 without the fired; `badges` from a granted rare achievement.
  - schema test: a config with `closedAt: at('2026-10-26', '13:00')` parses; without it still parses.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/finale/results.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/finale/results.ts"`.

- [ ] **Step 3: Implement** the schema field (`closedAt` optional, the project's local-timestamp type if one
  exists, else a string) and the three functions with the signatures above.

- [ ] **Step 4: Run to see them pass; the engine's suite**

Run: `npx vitest run tests/unit/finale/results.test.ts tests/unit/schemas && npm run test:engine`
Expected: PASS; engine coverage ≥ 90 %.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/data/schemas/season.ts src/finale/results.ts tests/unit/finale/results.test.ts tests/unit/schemas
git commit -m "Finale: the season's closedAt; the podium by cells then share, the best in each team, the top 3 — pure (D-59)"
```

---

### Task 2: Significant achievements and the department's result (pure)

**Где смотреть:** спецификация («Goals» 1, 3; «Our calls» — итог отдела); `src/hud/badges.ts`
(`knownOf`-подобный отбор, `honorBoard`, `HONOR_NAMES`), `src/admin/corrections.ts:57,94,205` (`signed` с «−»
U+2212, причина «<показатель> ±N: …», значение = число × вес), DECISIONS D-53; `src/data/schemas/records.ts`
(`manager_points`).

**Files:**
- Modify: `src/finale/results.ts`
- Test: `tests/unit/finale/results.test.ts`

**Interfaces:**
- Consumes: Task 1's types; `shortName`, `plateName`; `RARITY_TEXT`/`BadgeRarity` from `src/hud/badges.ts`.
- Produces:
  - `type Significant = { achievementId: string; title: string; rarity: 'legendary' | 'epic'; holders: string[]; more: number }`
    — holders: operators' short names (not fired) or teams' `plateName`, by the day taken, then name; at most
    `HONOR_NAMES`, the rest in `more`;
  - `SIGNIFICANT_ROWS = 6`; `significantOf(game: GameState, config: SeasonConfig): Significant[]` — enabled
    legendary, then epic, achievements of both scopes that somebody holds; within a rarity the config's order;
    at most `SIGNIFICANT_ROWS`;
  - `type DepartmentTotals = { metrics: { id: string; title: string; total: number }[]; achievements: number; planShare: number }`;
  - `manualCount(adjustment: Adjustment, config: SeasonConfig): { metricId: string; count: number } | null` — a
    `manager_points` whose reason starts with `<title> <+|−>N:` and whose `value` equals `N × weight` (±1e-6);
    anything else → null;
  - `departmentTotals(game: GameState, config: SeasonConfig, adjustments: Adjustment[]): DepartmentTotals` —
    metrics in `config.metrics` order: Σ `managers[].totals` (fired included) + Σ `manualCount`; `achievements` =
    `game.unlocks.length`; `planShare` = Σ teams' `points` ÷ Σ teams' `targetPoints` (0 when no plan);
  - `type Finale = { closedAt: string; podium: PodiumPlace[]; best: TeamBest[]; top: TopOperator[]; significant: Significant[]; totals: DepartmentTotals }`;
  - `finaleOf(game: GameState, config: SeasonConfig, adjustments: Adjustment[]): Finale | null` — null unless
    `config.status === 'closed'` with a `closedAt`.

- [ ] **Step 1: Write the failing tests** (same file):
  - `significant: legendary, then epic, of operators and teams; rare and common left out` — grants of a
    legendary operator's, an epic team's, a rare and a common achievement → two rows, legendary first; the team row
    holds the team's `plateName`; a fired holder is left out; four holders → three names, `more: 1`.
  - `the department's totals: every operator's metrics, the fired included` — two operators' `daily` records, one
    fired → totals per metric in `config.metrics` order with the config's titles.
  - `a manual «Оплаты +1» is counted from its reason` — a `manager_points` adjustment with reason `«Оплаты +1: поздняя
    оплата»` and value `1 × 10` → `pay` total + 1; a `«Оплаты −1: …»` (U+2212) → − 1.
  - `an unreadable correction is not guessed` — reason `«поздняя оплата»`, or `«Оплаты +2: …»` with value 10, or a
    `team_steps` → `manualCount` null, totals unchanged.
  - `the plan share and the achievements` — `planShare` = Σ points ÷ Σ targets; `achievements` = unlock count.
  - `no finale while the game runs` — `finaleOf` of an active config → null; closed with `closedAt` → all parts.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/finale/results.test.ts`
Expected: FAIL — `significantOf is not a function` (and the rest not exported).

- [ ] **Step 3: Implement** the functions with the signatures above (read the U+2212 minus as negative; digits may
  carry the `ru-RU` group space).

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/finale/results.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/finale/results.ts tests/unit/finale/results.test.ts
git commit -m "Finale: significant achievements and the department's result, manual metric corrections read from their reasons — pure (D-59)"
```

---

### Task 3: The ceremony's steps and the browser's memory (pure)

**Где смотреть:** спецификация («Goals», «Constraints»); `src/hud/moments.ts` (`timeline`, `showPhase` — образец
чистого расписания), `src/hud/clock.ts` (`RunClocks`, `useRunClock`), `src/moments/seen.ts` (образец памяти
браузера); тесты `tests/unit/hudMoments.test.ts`, `tests/unit/moments/*`.

**Files:**
- Create: `src/finale/ceremony.ts`, `src/finale/seen.ts`
- Test: `tests/unit/finale/ceremony.test.ts`

**Interfaces:**
- Produces:
  - `type Step = 'end' | 'best' | 'achievements' | 'top' | 'podium'`;
  - `STEPS: readonly { step: Step; ms: number }[]` = end 10 000, best 12 000, achievements 10 000, top 10 000,
    podium 14 000; `CEREMONY_MS` = their sum (56 000);
  - `type Phase = { step: Step; index: number; shown: number }` — `shown`: how many items of the step are on view
    (cards one by one; the top 3 from the third; the podium third, second, first);
  - `phaseAt(ms: number, counts: Record<Step, number>): Phase | null` — null at and after `CEREMONY_MS`; items of a
    step appear evenly over its first 60 %; `shown` never exceeds `counts[step]`;
  - `REVEAL_ORDER`: `top` and `podium` reveal the last place first — the view maps `shown` to places;
  - `readFinaleSeen(seasonId: string, store?): string | null`, `writeFinaleSeen(seasonId: string, closedAt: string, store?): void`
    — key `sq.finale.v1`, `{ [seasonId]: closedAt }`, one season kept, every access in `try/catch`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/finale/ceremony.test.ts`:
  - `the steps follow in order and end at a minute` — `phaseAt(0)` → `end`, `phaseAt(10_000)` → `best`,
    `phaseAt(55_999)` → `podium`, `phaseAt(56_000)` → null; `CEREMONY_MS === 56_000`.
  - `items appear one by one and stop at the count` — `best` with 6 cards: `shown` 1 at its start, 6 by 60 % of
    the step, never 7; a step with 0 items → `shown: 0`.
  - `the memory: a played closing is remembered` — `writeFinaleSeen('s', at1)` then `readFinaleSeen('s')` → `at1`;
    another season replaces it.
  - `a new closing plays again` — remembered `at1`, the config's `closedAt` `at2` → `readFinaleSeen` ≠ `closedAt`.
  - `no storage — nothing remembered, no exception` — a store whose `getItem`/`setItem` throw → `null`, no throw.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/finale/ceremony.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `ceremony.ts` and `seen.ts` with the signatures above.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/finale/ceremony.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/finale/ceremony.ts src/finale/seen.ts tests/unit/finale/ceremony.test.ts
git commit -m "Finale: the ceremony's five steps on a minute's clock and the closing this browser played (D-59)"
```

---

### Task 4: Fireworks on request — the scene and the scheme

**Где смотреть:** `src/scene/commands.ts` (`requestCamera` — образец шины), `src/scene/player.ts` (`advance`,
`animating`, `moving`, `bursts`), `src/scene/choreography.ts` (`Burst`, `BurstKind`, `BURST_MS`, `burstsAt`),
`src/scene/Fireworks.tsx`, `src/scene/GameScene.tsx:264-290` (подписка на команды, `publishMoving`),
`src/scheme/Scheme.tsx:410-520` (`burstsAt`, `sparkOffsets`, `.sq-spark`); DECISIONS D-57; тесты
`tests/unit/scene/player*.test.ts`, `tests/unit/scheme/*`.

**Files:**
- Modify: `src/scene/commands.ts`, `src/scene/player.ts`, `src/scene/GameScene.tsx`, `src/scheme/Scheme.tsx`
  (and `src/scheme/geometry.ts` if the scheme keeps its bursts there)
- Test: `tests/unit/scene/player.test.ts` (or the existing player test file), `tests/unit/scheme/geometry.test.ts`

**Interfaces:**
- Produces:
  - `requestCelebration(teamIds: string[], kind: BurstKind): void`, `onCelebrationRequest(listener): () => void`
    in `src/scene/commands.ts`;
  - `ScenePlayer.celebrate(teamIds: string[], kind: BurstKind): void` — bursts at the player's own celebration
    clock, waves staggered by 250 ms per team; `bursts()` returns the plan's and the celebration's;
    `animating()` true while a celebration spark lives; `moving()` unchanged (walk only);
  - the scheme's equivalent: celebration bursts drawn with the same `sparkOffsets`, a CSS animation once.

- [ ] **Step 1: Write the failing tests**
  - `a celebration is fireworks, not a walk` — a player at rest: `celebrate(['t1','t2'], 'gate')` → `bursts()`
    has two bursts (ages 0 and −250 not yet live → one live at 0, two after 250 ms of `advance`); `moving()` false;
    `animating()` true until `BURST_MS.gate + 250`, then false.
  - `a celebration during a walk adds to it` — a loaded plan with its own bursts → `bursts()` holds both.
  - the scheme's pure part (if any is added to `geometry.ts`): the celebration's bursts at its time `t`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/scene tests/unit/scheme`
Expected: FAIL — `player.celebrate is not a function`.

- [ ] **Step 3: Implement** the command bus, `ScenePlayer.celebrate`, the subscriptions in `GameScene` (frames
  requested while `animating()`) and in `Scheme`; reduced motion draws nothing (as D-57).

- [ ] **Step 4: Run to see them pass; the whole unit suite**

Run: `npx vitest run tests/unit/scene tests/unit/scheme && npm test`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/scene src/scheme tests/unit/scene tests/unit/scheme
git commit -m "Scene: fireworks on request — requestCelebration over given teams, in 3D and on the scheme, not a walk (D-59)"
```

---

### Task 5: The admin — «Подвести итоги» and «Вернуть игру»

**Где смотреть:** `src/admin/Home.tsx` (кнопки), `src/admin/AdminPage.tsx` (экраны, `committed`),
`src/admin/BatchDraft.tsx` (черновик, превью, «Записать», `BatchView`), `src/admin/Corrections.tsx` (образец экрана
на `BatchDraft`), `src/admin/pipeline.ts` (`previewChange`, `commitChange`, `nameIn`), `src/data/time.ts`
(`localTimestamp`); тесты `tests/unit/admin/corrections.test.ts`, e2e «Корректировки» в
`tests/e2e/admin.spec.ts` (подменённый GitHub, `page.clock`).

**Files:**
- Create: `src/admin/finale.ts`, `src/admin/FinaleAdmin.tsx`
- Modify: `src/admin/Home.tsx`, `src/admin/AdminPage.tsx`
- Test: `tests/unit/admin/finale.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `finaleOf`, `podiumOf`, `topOperators` (Tasks 1–2).
- Produces (`src/admin/finale.ts`):
  - `canClose(config: SeasonConfig, today: string): boolean` — `status === 'active'` and `today ≥ period.end`;
  - `closeGame(input: EngineInput, now: string): EngineInput` — config `status: 'closed'`, `closedAt: now`;
  - `reopenGame(input: EngineInput): EngineInput` — `status: 'active'`, no `closedAt`;
  - `finaleMessage(config: SeasonConfig, closing: boolean): string` — «итоги игры 12.10–25.10» / «игра снова идёт:
    12.10–25.10» (`dayMonth`).
- Screen: Home gets «Подвести итоги» (enabled when `canClose`) or «Вернуть игру» (when closed); `FinaleAdmin`
  shows one line of the batch, the podium and the top 3 as the preview's `extra`, «Записать» commits.

- [ ] **Step 1: Write the failing tests** — `tests/unit/admin/finale.test.ts`:
  - `closing is possible from the game's last day` — `canClose(active, '2026-10-24')` false, `'2026-10-25'` true,
    `'2026-10-26'` true; closed → false.
  - `close writes the status and the moment; reopen undoes it` — `closeGame` → `status: 'closed'`, `closedAt` = now;
    `reopenGame(closeGame(x))` config deep-equals `x`'s (`reopen restores active`).
  - `the message is public: dates only` — «итоги игры 12.10–25.10», «игра снова идёт: 12.10–25.10».
  - e2e in `admin.spec.ts`: `«Подвести итоги»: the podium for a check, one commit, the config closed` — clock pinned
    to 2026-10-26 on a fake repo of a game ending 25.10 → the button, the preview lists «1 место», «Записать» → the
    fake repo's commit message «итоги игры …», its config decrypts with `status: 'closed'`; then «Вернуть игру» →
    `status: 'active'`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/admin/finale.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `finale.ts`, `FinaleAdmin.tsx` on `BatchDraft` (name `finale`, test ids
  `finale-draft`, `finale-preview`, `finale-commit`), the Home buttons and the view in `AdminPage`.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/unit/admin/finale.test.ts && npx playwright test tests/e2e/admin.spec.ts --project=e2e -g "Подвести итоги"`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add src/admin tests/unit/admin/finale.test.ts tests/e2e/admin.spec.ts
git commit -m "Admin: «Подвести итоги» from the game's last day — the podium for a check, one public commit; «Вернуть игру» (D-59)"
```

---

### Task 6: The finale on the screen — the ceremony and the results screen

**Где смотреть:** спецификация целиком; макет из обсуждения (итоговый экран: пьедестал слева, «Лучшие из
лучших» и «Значимые достижения» справа, шесть карточек «лучший в СР…» внизу, «Игра завершена» сверху);
`src/app/App.tsx:120-165` (live view, `sync.loaded.input`), `src/app/viewer.ts` (`date`, `cells`), `src/hud/Hud.tsx`
(`Hud`, `TopBar`, `Rating`, `TeamCards`, `MomentsLayer`), `src/hud/Badges.tsx` (`Gems`), `src/hud/clock.ts`
(`useRunClock`, `reducedMotion`), `src/hud/cards.ts` (`countAt` — числа набегают), `src/hud/theme.css`
(`sq-panel`, `sq-parchment`, `sq-moment-in`); e2e `tests/e2e/moments.spec.ts` (демо, `page.clock`,
`addInitScript`), `tests/e2e/visual.spec.ts`; `src/data/seal.ts` (`sealSeason`); NAVIGATOR §11, §15.

**Files:**
- Create: `src/hud/Finale.tsx`, `tests/support/closedDemo.ts`, `tests/e2e/finale.spec.ts`
- Modify: `src/app/App.tsx`, `src/hud/Hud.tsx`, `src/hud/theme.css`, `tests/e2e/visual.spec.ts` (+ baseline)

**Interfaces:**
- Consumes: `finaleOf`, `Finale` (Tasks 1–2); `phaseAt`, `CEREMONY_MS`, `STEPS`, `readFinaleSeen`,
  `writeFinaleSeen` (Task 3); `requestCelebration`, `requestCamera` (Task 4).
- Produces:
  - `Hud` prop `finale: Finale | null` — App passes `finaleOf(game, config, input.adjustments)` on the live view
    only (`state.date === null && state.cells === null`), else null;
  - with a finale the HUD shows `TopBar` and `<FinaleLayer>`; `Rating`, `TeamCards`, `MomentsLayer` are not mounted;
  - `FinaleLayer({ finale, seasonId, tv })`: if `readFinaleSeen(seasonId) !== finale.closedAt` — the ceremony on
    the run clock `finale:<closedAt>:<n>` (`useRunClock`, the selected value = `phaseAt(...)`'s step and `shown`),
    then `writeFinaleSeen` and the results screen; else the results screen at once; laptops (not `tv`) get
    «Посмотреть церемонию ещё раз» (n + 1);
  - at the ceremony's start: `requestCamera('overview')`, `requestCelebration(all team ids, 'gate')`; at the
    podium's first place: `requestCelebration(first-place ids, 'finish')` and, with one winner,
    `requestCamera({ team })`;
  - texts: «Игра завершена», «вместе за две недели», «Лучшие в командах» / «лучший в <title>», «Значимые
    достижения», «Лучшие из лучших», «Пьедестал», «клетка N · X % плана»; regions labelled «Итоги игры» (the
    results screen) and «Церемония»;
  - `tests/support/closedDemo.ts`: `sealedDemo(edit: (input: EngineInput) => EngineInput): Promise<Map<string, string>>`
    — the demo read as in `moments.spec.ts`, edited, sealed with the demo phrase (`sealSeason`); `closing(at)` —
    the edit that closes it; `serveData(page, files)` routes `**/data/**` to those files (re-callable: the next
    «Обновить» reads the new ones).

- [ ] **Step 1: Write the failing e2e** — `tests/e2e/finale.spec.ts` on the closed demo, the clock pinned
  (`page.clock.setFixedTime`), 2D view:
  - `a closed game plays the ceremony once, then the results stay` — the region «Церемония» with «Игра завершена»;
    within ~60 s the region «Итоги игры» with the podium's three places, «Лучшие из лучших», six (or fewer) «лучший
    в …» cards; reload → «Итоги игры» at once, no «Церемония»; the rating «Рейтинг операторов» absent.
  - `«Посмотреть церемонию ещё раз» on a laptop; none on the wall screen` — the button replays; `?mode=tv` has no
    button.
  - `a look at another day shows the map` — `?date=` → the rating is there, no finale.
  - `the results follow the data` — after the ceremony, the closed demo with an extra `pay` record served and
    «Обновить» pressed → the payments total grows; no «Кто принёс баллы» toasts.
  - `a reopened game shows the map` — the demo served active again + «Обновить» → rating and cards back.
  - `the scene rests after the ceremony` (3D) — `__sqFrames` stops growing after the last firework (PERF-1).

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test tests/e2e/finale.spec.ts --project=e2e`
Expected: FAIL — no region «Церемония».

- [ ] **Step 3: Implement** `Finale.tsx` (the five steps and the results screen in `sq-*` style; numbers of step 1
  count up with `countAt`, at once under reduced motion), the wiring in `App.tsx` and `Hud.tsx`, the styles in
  `theme.css` (podium steps, cards; slide-ins once, none under reduced motion), and `tests/support/closedDemo.ts`.

- [ ] **Step 4: Run the e2e to see it pass**

Run: `npx playwright test tests/e2e/finale.spec.ts --project=e2e`
Expected: PASS.

- [ ] **Step 5: The results screen's baseline** — add `finale — the results screen (QA-6, D-59)` to
  `visual.spec.ts`: the closed demo, a remembered closing (no ceremony), the 2D view, the whole page; mask
  `проверено ЧЧ:ММ`. Run `npx playwright test visual --project=e2e --update-snapshots`; look at the new and changed
  pictures before committing.

- [ ] **Step 6: Look at it live and on a laptop's width** — a scratch Playwright script against the dev server with
  the closed demo: screenshots of each ceremony step and the results screen at 1280×720 and 1024×640 (the HUD's
  smallest laptop width); nothing clipped, the six cards readable.

- [ ] **Step 7: The whole check, commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run size && npm run test:e2e`, then
`npx playwright test --project=perf --no-deps` once (paired, D-45).
Expected: green; size ≤ 600 KB; QA-4 as before (27–29 «with moments» is this PC's noise).

```bash
git add src/hud/Finale.tsx src/hud/Hud.tsx src/hud/theme.css src/app/App.tsx tests/support/closedDemo.ts tests/e2e/finale.spec.ts tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "HUD: the finale — a ceremony once per screen and the results screen over the map; fireworks over all, then over the winner (D-59)"
```

---

### Task 7: Docs

**Где смотреть:** `docs/DECISIONS.md` (после D-58), `docs/NAVIGATOR.md` (§3 админка, §11 HUD, §16 ближайшие
пункты), `docs/BACKLOG.md`, `CLAUDE.md` («Архитектура», «Этапы»), `docs/OPEN_QUESTIONS.md`.

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/NAVIGATOR.md`, `docs/BACKLOG.md`, `CLAUDE.md`

- [ ] **Step 1:** DECISIONS **D-59. Финал игры** (ответы автора 18.10.2026, «вдохновение и причастность к общему
  делу»): церемония один раз на экран (порядок и состав), итоговый экран до следующей игры, кнопка «Подвести итоги»
  с последнего дня игры и «Вернуть игру», пьедестал по клеткам, затем по проценту плана, ничьи; «лучший в команде» —
  по вкладу в команду, состав последнего дня; итог отдела с ручными «показателями за день» по их причине; только
  живой просмотр; индекс сезонов не меняется; открытые экраны — перезагрузить после выкладки.
- [ ] **Step 2:** NAVIGATOR — §3 «Финал (D-59)» (`src/admin/finale.ts`, `FinaleAdmin.tsx`), §11 (`src/finale/*`,
  `src/hud/Finale.tsx`, `requestCelebration`, `sq.finale.v1`, e2e `finale.spec.ts`, `tests/support/closedDemo.ts`),
  §16 (финал на сайте; дальше 2б-3); грабли, найденные по ходу.
- [ ] **Step 3:** BACKLOG — «Сделано: финал (D-59)»; этап 5 — архив и «Зал славы» поверх итогов; CLAUDE.md —
  `src/finale/` в «Архитектуре», строка о финале в «Этапах».
- [ ] **Step 4:** `npx prettier --check docs CLAUDE.md`, the docs audit's `navcheck.py` on NAVIGATOR, CLAUDE.md;
  commit «Docs: D-59 — the finale …».

---

### Task 8: Independent review, fixes, report

- [ ] **Step 1:** the review package and an **opus** review subagent (`code-reviewer.md`, the plan, the spec, this
  Review Focus verbatim, the ledger's rulings); it must not open root `*.xlsx`, `refs/`, `assets-src/` or decrypt
  `data/`.
- [ ] **Step 2:** Critical and Important — one fix pass, each RED → GREEN and the whole suite; Minor — ledger and
  BACKLOG.
- [ ] **Step 3:** the spec's «As built (date)»; commit.
- [ ] **Step 4:** a short report in Russian with screenshots of the ceremony and the results screen, the rulings,
  the deferred minors, and the launch note: after the deploy, reload the office screen and ask the staff to reload
  their tabs; on 26.10 — upload, check, «Подвести итоги». The push only after a fresh «да» (D-3), before 26.10.
