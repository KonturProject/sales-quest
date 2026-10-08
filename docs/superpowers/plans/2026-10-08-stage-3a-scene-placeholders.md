# Stage 3a — The Scene on Placeholders Implementation Plan

> **For agentic workers:** executed inline in the authoring session (stage process, 06.10.2026); an
> independent review subagent checks the result. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The map shows the game: a strip of four location panels with cells, six placeholder figures
on their positions with pace flags, moves played cell by cell with camera flights when new data comes,
a HUD with team cards and the rotating rating — drawing 0 frames at rest and ≥ 28 FPS during moves on
a CPU slowed ×4 (QA-4).

**Architecture:** Pure modules carry the logic and are unit-tested in Node: `src/scene/layout.ts`
(world geometry from the engine's `Track`), `src/scene/choreography.ts` (moves → a timed plan),
`src/scene/runtime/*` (ticker, render policy, quality). Thin R3F components play them back:
`GameScene`, `Board`, `Figures`, `CameraRig`. The HUD is DOM (`src/hud/`). The engine adds operator
contributions per team and current headcount.

**Tech Stack:** React 19, @react-three/fiber 9, three 0.186 (`OrbitControls` from `three/examples`),
Tailwind 4, Vitest 5, Playwright 1.63 (CDP for CPU throttling). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-stage-3-scene-design.md`; `docs/SPEC.md` §5.3–5.5, §11, §12,
QA-4; `docs/DECISIONS.md` D-23, D-24, D-26, D-37, D-38.

## Global Constraints

- `frameloop="demand"`; frames only from the ticker (≤ 30 FPS) while something animates; 0 at rest,
  none in a hidden tab (PERF-1…4). No endless `requestAnimationFrame`.
- Low quality by default: DPR ≤ 1, `antialias: false`, no shadow maps, Lambert materials, no
  post-processing (PERF-9, PERF-10).
- Budgets (§12.1): draw calls ≤ 120, triangles ≤ 80 000 in frame, figure ≤ 3 000 triangles.
- Game numbers from the config/engine only; the scene never computes points or positions itself.
- Placeholders are marked as placeholders; 3b replaces panels and figures.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved,
  push only after "yes" (D-3); commit messages end with the Co-Authored-By line.

## File map

| File | Responsibility |
|---|---|
| `src/engine/progress.ts`, `gameState.ts`, `roster.ts` | `contributions` per team and operator; `members` (current headcount) |
| `src/scene/themes.ts` | theme panels of 3a: placeholder colours and default S-paths (normalised) |
| `src/scene/layout.ts` | `buildLayout(track, themes)` → panels, cell spots 0…maxPosition, pads, bounds; `slotOffsets`; `pathPoint` |
| `src/scene/choreography.ts` | `planMoves(before, after, timing)` → hops, popups, camera shots; `poseAt(plan, t)` |
| `src/scene/runtime/ticker.ts` | 30-FPS ticker with reasons to run; stops when none |
| `src/scene/runtime/policy.ts` | render mode from visibility / focus / idle / TV |
| `src/scene/runtime/quality.ts` | tiers, DPR steps from measured FPS, storage |
| `src/scene/runtime/stats.ts` | real renders, draw calls, triangles → `window.__sqFrames`, `window.__sqStats` |
| `src/scene/GameScene.tsx` | canvas, lights, wiring of the parts below; replaces `MapScene.tsx` |
| `src/scene/Board.tsx`, `Figures.tsx`, `CameraRig.tsx`, `labels.ts` | panels, cells, markers; figures, plates, flags, popups; camera; canvas-text textures |
| `src/hud/Hud.tsx`, `TeamCards.tsx`, `Rating.tsx`, `rating.ts` | top bar, cards, rotating rating; slide builder |
| `src/app/App.tsx` | map route with scene + HUD; `?date=` and `?cells=` (OQ-18 preview) on the map |
| `tests/e2e/scene.spec.ts`, `tests/e2e/perf.spec.ts` | scene behaviour; QA-4 |

---

### Task 1: Engine — contributions and current headcount

- [ ] `teamDayPoints` keeps `managerId`; `teamContributions(input)` → per team, per operator, the points
  earned for that team up to `asOf` (records, corrections, step-moving bonuses), summing to team points.
- [ ] `GameState.contributions: { teamId, managerId, points }[]`; `TeamState.members` — operators in the
  team today by membership, not fired (BACKLOG «Численность в таблице команд»).
- [ ] Tests: a transfer splits an operator's points between teams; contributions sum to team points;
  members ignore the fired and later newcomers.

### Task 2: World layout

- [ ] `themes.ts`: four placeholder panels (colours of ruins / ice / volcano / heaven) with a default
  S-path `[(0,.5),(.25,.32),(.5,.5),(.75,.68),(1,.5)]`.
- [ ] `layout.ts`: panel size 12, gap 0.6; path sampled (Catmull-Rom) and measured by arc length; cells of
  location k at fractions `(i − 0.5) / cellsPerLocation`; START pad before panel 1; overflow cells on a
  platform after panel 4 at the mean cell spacing; kinds start / cell / checkpoint / finish / overflow;
  heading of each spot; bounds. `slotOffsets(n)` for 1…6 figures; `figureSpots(layout, positions)`.
- [ ] Tests: 20 cells → 5 per panel inside its panel, in increasing x on the strip; checkpoints at
  `k × cpl`; finish = `trackLength`; overflow spots past panel 4; slots distinct and within the cell.

### Task 3: Choreography

- [ ] `planMoves(before, after, timing)`: teams in order, only changed ones; per team a fly shot, hops
  cell by cell (300 ms each, the walk capped at 3 s), a popup «+N» / «−N», a pause; an overview shot at
  the end; empty plan for no change or no `before` (first open, FR-MOVE-4).
- [ ] `poseAt(plan, t)`: per team `{ from, to, f }` and the active shot with its progress.
- [ ] Tests: timings, cap, backward walk, skipped teams, poses before / during / after.

### Task 4: Render runtime

- [ ] `ticker.ts`: `want(reason)` / `release(reason)`; runs rAF only while some reason holds; calls
  `onFrame(dtMs)` at most every 1000/30 ms; `stop()` on hidden tab.
- [ ] `policy.ts`: `renderMode({ hidden, blurredMs, blurFreezeMs, idleMs, tv })` → `stopped | frozen |
  active | slow`.
- [ ] `quality.ts`: Low/Medium/High; `nextDpr(current, fps)` steps 1 → 0.85 → 0.75 → 0.6 below 24 FPS;
  stored as `sq.quality` (try/catch).
- [ ] `stats.ts`: counts real renders (`gl.info.render.frame`) into `__sqFrames`, last frame's calls and
  triangles into `__sqStats`; replaces `src/perf/FrameCounter.tsx`.
- [ ] Tests: ticker with fake rAF/clock; policy table; DPR steps.

### Task 5: Scene

- [ ] `GameScene` (perspective camera, demand loop, Low settings), `Board` (panels, frames, paths,
  instanced cells, start pad, gates, overflow platform), `Figures` (placeholder body, ring, blob shadow,
  name plate, slots; pace flags; popups), `CameraRig` (OrbitControls with pitch/yaw/zoom limits around
  `ui.camera`, pan clamped to the strip, shots from the plan, user input takes over), plan player on
  the ticker; plan clock advances only on rendered ticks (a hidden tab pauses it).
- [ ] App: map route renders the scene from the viewer's game; a new game state plans moves from the
  previous positions; `?date=` and `?cells=N` (preview of OQ-18, map only) via the viewer.
- [ ] Demo config: `ui.camera` = pitch 50°, yaw 0° (the strip faces the viewer); reseed.
- [ ] Browser check: screenshot, draw calls / triangles, moves on a date switch, 0 frames after.

### Task 6: HUD

- [ ] Top bar (title, «данные от», «Обновить», notices); team cards (FR-PACE-3, location, members);
  rating (`rating.ts` builds slides: each team's operators with points and share, then overall top 10;
  15 s per slide; fired operators out, R-5); «Весь трек» / «К лидеру».
- [ ] Tests: slides order, shares, fired operators hidden.

### Task 7: Tests, docs, review

- [ ] e2e `scene.spec.ts`: canvas and HUD; 0 frames at rest; 0 frames with the tab hidden; a date switch
  plays moves then rests. `perf.spec.ts` (QA-4): CPU ×4, 1366×768: FPS during moves ≥ 28, draw calls
  ≤ 120, triangles ≤ 80 000.
- [ ] Show the author the scene at 2 and 3 cells per day (OQ-18).
- [ ] CLAUDE.md, BACKLOG (close the stage-3 items done), DECISIONS if behaviour changed; full checks;
  independent review; fixes; report; push after "yes".
