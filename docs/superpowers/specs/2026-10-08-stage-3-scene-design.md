# Stage 3 — the scene: design

Approved by the author on 08.10.2026. Requirements: SPEC §5.3–5.5 (FR-TRACK, FR-PACE, FR-MOVE), §11
(GFX), §12 (PERF), §17 QA-4/QA-6, §18 stage 3; `docs/DECISIONS.md` D-23, D-24, D-26, D-37…D-39 (override
the spec: perspective camera instead of the orthographic GFX-1, painted board instead of GFX-LOC kits).
Stage 3 acceptance: QA-4 passes and the §12.1 budgets hold.

## Sub-plans

- **3a — the scene on placeholders** (no third-party assets): world layout, cells, placeholder figures,
  moves and camera flights, HUD with the rotating rating, render runtime (30 FPS ticker, 0 frames idle,
  visibility / blur / idle policies, quality tiers), QA-4 test. The number of cells per working day
  (OQ-18) is chosen by the author on this scene.
- **3b — the look**: the four location panels from the author's new art (`docs/ART_BRIEF.md`), a CC0
  fantasy-hero pack (download only after the author's "yes", D-3) with walk / jump / cheer, asset
  pipeline and manifest with budgets, ambient life during moves (sparks, snow, fireflies, light motes).
- **3c — the rest of the stage**: 2D fallback (GFX-6), TV mode (PERF-5), mini-map (GFX-5), screenshot
  tests (QA-6), final QA-4 with real assets.

## 1. World

- Four square panels left to right in a strip (OQ-17 order: ruins → ice → volcano → heaven), with a thin
  frame between them; a START pad before the first panel; an "over the horizon" platform after the last
  one for the overflow cells.
- Each panel has a path: a polyline in panel coordinates (0…1) from the middle of its left edge to the
  middle of its right edge — in 3a a gentle S-curve, in 3b traced on the painted path. Cells of a location
  are spread evenly along its path (`cellsPerLocation`); the last one is the checkpoint gate (FR-TRACK-1).
  Panels join where one path ends and the next begins.
- Cells are low slabs drawn as one instanced mesh; START, checkpoints, finish and overflow cells are marked.
- All of it is computed by a pure `layout` module from the engine's `Track` and a theme manifest.

## 2. Figures and markers

- 3a: a placeholder figure per team (body + head) in the team colour, a coloured ring under it, a name
  plate above (canvas texture made once, GFX-4). 3b swaps in the heroes.
- Several figures on a cell stand in slots around its centre, up to six (FR-MOVE-2).
- The team's pace line (D-26): a small flag in the team colour on its pace cell (FR-PACE-1).

## 3. Moves and camera (FR-MOVE, D-23)

- A new game state with changed positions starts a choreography: for each team that moved, in team order —
  the camera flies to the figure, the figure hops cell by cell (≈300 ms per cell), "+N" (or "−N") rises
  above it, a short pause; then the next team; finally the camera returns to the overview. Moves back
  (resets) walk back.
- First open: figures stand on their cells at once, no replay (FR-MOVE-4).
- The camera is perspective: orbit within limits (pitch 30–70°, yaw ±35° around `ui.camera`), zoom between
  limits, pan along the track; buttons «Весь трек» and «К лидеру». User input during a flight hands the
  camera to the user; figures finish their moves.
- The choreography is a pure plan (`choreography` module) — the renderer only plays it back.

## 4. Render runtime (§12)

- `frameloop="demand"`; an own ticker capped at 30 FPS runs only while something animates (choreography,
  camera tween, ambient of 3b). Idle: 0 frames.
- Hidden tab: no frames. Visible but unfocused for `ui.blurFreezeSec`: frozen (PERF-4). No input for 2 min
  (not TV): ambient at 15 FPS (PERF-7, matters from 3b).
- Quality tiers (PERF-QUALITY): Low by default — DPR ≤ 1, no antialias, no shadows (blob shadows under
  figures); during moves the FPS is measured and, below 24, DPR steps down to 0.6 (PERF-8). The choice is
  kept in localStorage.
- Real WebGL renders are counted (`gl.info.render.frame`, BACKLOG); draw calls and triangles of the last
  frame are exposed for tests.

## 5. HUD (DOM over the scene)

- Bottom: six team cards — leader and colour, cell and % of plan, «впереди темпа на N клеток / отстаёт на
  N» (FR-PACE-3), location, current headcount (non-fired members today, BACKLOG).
- Top: game title, «данные от», «Обновить», notices «нет связи» / «сайт обновляется».
- Side: the rotating rating (D-38): every 15 s the next slide — each team's operators by points with
  their share of the team's points, then the overall top 10, and round again.
- The engine adds each operator's points earned for each team (R-1) so the shares add up to the team.

## 6. Verification

- Unit tests for the pure modules: layout, slots, choreography, ticker / visibility policy, quality
  steps, rating slides, contributions.
- e2e: the scene draws; idle and hidden tab draw no frames; switching `?date=` to the next day plays the
  moves and then returns to 0 frames.
- QA-4: CPU throttled ×4 (CDP), 1366×768, Low: FPS during moves ≥ 28, draw calls ≤ 120, triangles
  ≤ 80 000; idle hidden tab: frame counter flat for 10 s.
