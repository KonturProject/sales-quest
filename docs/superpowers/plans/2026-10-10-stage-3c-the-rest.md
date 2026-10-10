# Stage 3c — The Rest of the Scene Implementation Plan

> **For agentic workers:** executed inline in the authoring session (stage process, 06.10.2026); an
> independent review subagent checks the result. Steps use checkbox (`- [ ]`) syntax for tracking.
> Before each task: its «Где смотреть» block and the matching topic of `docs/NAVIGATOR.md`.

**Goal:** Stage 3 complete and acceptable: a weak machine simplifies the scene step by step until moves
are smooth (D-45), and can switch to a 2D scheme that keeps every function (GFX-6); the HUD gains a
mini-map (GFX-5); an office screen runs in a TV mode (PERF-5); screenshot tests guard the look (QA-6);
QA-4 passes on the author's throttled PC within the §12.1 budgets — then the author's «ок» for stage 3.

**Architecture:** pure modules decide (quality ladder, TV cycle, 2D geometry from the same `layout`),
thin components apply. The 2D scheme and the TV mode reuse the engine state, the HUD and the layout —
no second source of positions.

**Spec:** `docs/SPEC.md` GFX-5, GFX-6, PERF-4, PERF-5, PERF-7, PERF-8, §12.3, QA-4, QA-6, §18 (stage 3
acceptance); `docs/DECISIONS.md` D-23, D-38…D-45; `docs/BACKLOG.md` «Этап 3».

## Global Constraints

- Everything of 3a/3b/3b-2 stays: render on demand, ≤ 30 FPS only with a reason, 0 frames at rest and
  hidden, §12.1 budgets, assets via the pipeline. No new downloads without the author's «да».
- Speed acceptance: `QA4_RATE=4` ≥ 28 FPS on the author's PC; ×6 and ×8 recorded (D-45).
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved,
  push only after «да» (D-3).

---

### Task 1: The quality ladder (D-45, PERF-8)

**Где смотреть:** ТЗ §12.3 (PERF-8 — лестница), PERF-2, PERF-7; решения D-40 (окна замера, неделя), D-45
(шаги); код `src/scene/runtime/quality.ts` (ступени DPR, `createDprGovernor`, хранение), `GameScene.tsx`
(где губернатор меряет ходы), `Board.tsx` (`ANISOTROPY`), `Ambient.tsx`, `Scenery.tsx`; тесты
`tests/unit/scene/runtime.test.ts`; навигатор §10.

- [ ] `quality.ts`: a level 0…7 instead of a bare DPR: DPR 1 → 0.85 → 0.75 → 0.6 → anisotropy off →
  ambient off → props and decor off → offer 2D; the governor steps one level after two slow windows
  of moves; stored with its date, re-measured after a week; the old stored DPR maps onto a level.
- [ ] The scene reads the level: DPR, the panels' anisotropy, `Ambient` and `Scenery` mounted or not;
  at the last level the HUD offers «Включить простую схему» (Task 2).
- [ ] `#/debug`: the measured FPS of the last moves and the level, a «Сбросить качество» button
  (OQ-24: figures from a real laptop).
- [ ] Tests: the ladder's order, one step per two slow windows, the week, the mapping of a stored DPR.

### Task 2: The 2D scheme (GFX-6)

**Где смотреть:** ТЗ GFX-6, §19.2 R-4; решения D-45 (когда предлагать), D-38 (рейтинг остаётся); код
`src/scene/layout.ts` (те же клетки и порядок), `restView.ts` (группы), `src/hud/Hud.tsx`, `src/app/App.tsx`
(маршрут карты), `player.ts` / `choreography.ts` (план ходов — для анимации фишек); навигатор §4, §8, §11.

- [ ] `src/scheme/` (lazy chunk): an SVG strip of the four locations (their colours, small art
  thumbnails), cells as circles along the traced paths, gates and finish marked, each team a token in
  its colour with the leader's name, pace flags; moves animate the tokens with CSS transitions (no
  frame loop).
- [ ] When: no WebGL (context fails) → the scheme at once; the last quality level → an offer;
  `?view=2d` / `?view=3d` force it; the choice is remembered (try/catch).
- [ ] The same HUD (cards, rating, «данные от»); «Весь трек» / «К лидеру» scroll the scheme.
- [ ] Tests: unit for the 2D geometry (same order as `layout`), e2e with `?view=2d` and with WebGL
  disabled.

### Task 3: The mini-map (GFX-5)

**Где смотреть:** ТЗ GFX-5, GFX-3 («клик по фигурке»), FR-PACE; решения D-38 (место рейтинга справа),
D-42 (камера в покое); код `src/hud/Hud.tsx`, `src/scene/commands.ts` (запросы камеры), `GameScene.tsx`
(обработчик команд), `layout.ts` (доли пути); навигатор §9, §11.

- [ ] A thin strip in the HUD: four location bands, six team markers, six pace ticks, the current
  rest-view window as a frame; a click on a marker flies the camera to the team (a viewer action:
  pauses the cycle as a button does).
- [ ] Tests: marker positions from positions and track length; the click sends the command.

### Task 4: The TV mode (PERF-5)

**Где смотреть:** ТЗ PERF-5, PERF-4, PERF-7; решения D-40, D-42 (цикл групп), D-45; код
`src/scene/runtime/policy.ts` (флаг `tv`), `useRenderMode.ts`, `restView.ts` (`cycleStep`), `GameScene.tsx`,
`src/hud/Hud.tsx`, `src/app/router.ts` (параметры); навигатор §9, §10.

- [ ] `?mode=tv`: no freeze on blur, no idle slow-down; the rest view walks the teams one by one (not
  only groups) every 20 s; the cursor hides after a few seconds without movement; no buttons that a
  wall screen cannot use.
- [ ] Tests: `cycleStep` with TV; policy table with TV.

### Task 5: Leftovers of 3b that belong here

**Где смотреть:** `docs/BACKLOG.md` «Этап 3»; код `heroes.ts` (`heroYaw`), `Figures.tsx`, `Board.tsx` (ворота),
`labels.ts` (кэш, PERF-12); навигатор §5, §7.

- [ ] A hero turns from the way ahead to the viewer over ~0.3 s instead of snapping.
- [ ] Gates in the board's style (two pillars and a lintel from the Dungeon pack already downloaded).
- [ ] The label cache and baked scenery freed on a season change (PERF-12).

### Task 6: Screenshot tests (QA-6)

**Где смотреть:** ТЗ §17 QA-6; решения D-39 (e2e в CI не держит деплой); код `tests/e2e/`,
`playwright.config.ts`; навигатор §10, §14.

- [ ] Deterministic shots on the demo (fixed `?date=`, rest view, whole strip, a 2D scheme): Playwright
  `toHaveScreenshot` with a tolerance; baselines for this PC (win32) committed; on CI's Linux they are
  skipped until a Linux baseline exists (a different renderer — differences are not bugs).

### Task 7: Stage 3 acceptance

**Где смотреть:** ТЗ §18 (этап 3: «QA-4 пройден; бюджеты 12.1 соблюдены»), §17; решения D-45; CLAUDE.md
«Проверка»; навигатор §0, §10.

- [ ] QA-4 at ×4, ×6, ×8; the §12.1 budgets (draw calls, triangles, textures, assets, initial JS);
  screenshots for the author; DECISIONS / BACKLOG / CLAUDE.md / NAVIGATOR current; independent review;
  fixes; report; push after «да»; the author's «ок» closes stage 3.
