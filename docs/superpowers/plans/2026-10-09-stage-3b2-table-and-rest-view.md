# Stage 3b-2 — The Table and the Rest View Implementation Plan

> **For agentic workers:** executed inline in the authoring session (stage process, 06.10.2026); an
> independent review subagent checks the result. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** The author's answers of 09.10.2026 (OQ-23 and a reference of a board game on a wooden
table): at rest the camera shows the part of the track where the teams are, not the thin whole strip;
teams more than 4 cells apart are shown group by group, the next group once a minute; the board lies
on a wooden table with props around it, the room's floor beyond; the "snake" 2×2 board stays a
switch away.

**Architecture:** Pure modules: `restView.ts` (groups of teams, the window of cells a group needs,
the cycle), `layout.ts` (panel placement as an arrangement — `row` now, `snake` in reserve —, the
rest derived from each panel's transform), `table.ts` (table, floor and props placement from the
board's bounds). Thin components: `CameraRig` (the rest pose and flights between groups),
`Table.tsx` (table, board slab, floor, props). Procedural textures until the author's art.

**Spec:** `docs/SPEC.md` FR-MOVE-3, GFX-2, GFX-3, PERF-1…PERF-5, §12.1; `docs/DECISIONS.md` D-23, D-37,
D-40, D-41; `docs/OPEN_QUESTIONS.md` OQ-23.

## Decisions taken with this plan (D-42, D-43)

- **D-42, the rest view:** teams sorted by position split into groups where the gap between
  neighbours is more than 4 cells. One group — the camera frames its cells (at least 6 cells wide, a
  cell of margin each side) and stays: 0 frames. Several groups — the camera shows the leaders'
  group, then every 60 s flies to the next one (behind), round and round; a flight is ~1.2 s of
  frames a minute. The cycle waits while moves play, while the tab is hidden or frozen (PERF-3,
  PERF-4), and for 2 minutes after the viewer touched the camera or a button. After moves the camera
  returns to the group of the leader. «Весь трек» still shows the whole strip.
- **D-42, the snake in reserve:** `layout.ts` places panels by an arrangement; `snake` puts panels
  3–4 in a second row, mirrored, travelling right to left; switching is one constant
  (`BOARD_ARRANGEMENT`). Not shown to viewers until the author chooses it.
- **D-43, the table:** the board is a slab in the panels' mist colour, a little larger than the
  panels (start and overflow on it); it lies on a large wooden table; beyond the table, a dark floor
  fading to the background. Wood and floor are procedural canvas textures (no download) until the
  author paints them (`docs/ART_BRIEF.md`, a new section). Props of the KayKit pack already downloaded
  (CC0, D-41): mugs, books, shields, a sword, arrows — table-sized, around the board, never over it;
  static, merged by texture (≤ 4 draw calls).

## Global Constraints

- Everything of 3a/3b stays: render on demand, ≤ 30 FPS only with a reason, 0 frames at rest and
  hidden, budgets of §12.1 (now ~53 draw calls with the whole board in view).
- No new downloads; textures ≤ 1024²; assets via `npm run assets`, checked by `check:assets`.

---

### Task 1: Layout arrangements

- [x] `Panel` gets `z0` and `mirrored`; path points, cells, start, overflow (in the travel direction),
  bounds derive from the panel transforms; `row` keeps today's geometry exactly.
- [x] `snake`: panels 1–2 in the first row, 3–4 below, mirrored, right to left.
- [x] Board, Ambient and the camera's pan clamp use the transforms / bounds.
- [x] Tests: `row` unchanged; `snake` — cells inside their panels, path ends joined within a row,
  bounds near 16:9.

### Task 2: Rest view

- [x] `restView.ts`: `teamGroups(positions, gap)`, `groupBounds(layout, group, minCells)`,
  `nextGroup(i, count)`; tests.
- [x] `CameraRig`: the rest pose (the current group) for the start, resizes and the plan's last shot;
  the whole-strip pose for «Весь трек»; a group change flies.
- [x] `GameScene`: the 60-s cycle with its pauses; `ScenePlayer.flyTo(…, byViewer)`.
- [x] e2e: the loading test frames the whole strip first (at rest only a group is in view); the
  60-s tick's decision is a pure function (`cycleStep`) with tests (an e2e would wait a minute).

### Task 3: Table, floor, props

- [x] `table.ts`: the slab, table and floor rectangles from the bounds; prop spots around the board.
- [x] Procedural wood and floor textures (canvas, made once).
- [x] Pipeline: `src/assets/props/*.glb` from the pack's accessories (128² textures), manifest, budget.
- [x] `Table.tsx`; draw calls and triangles within budget; QA-4 locally ×4 and ×8.

### Task 4: Docs, review

- [x] DECISIONS D-42, D-43; OQ-23 closed; ART_BRIEF: table and floor prompts; CLAUDE.md; BACKLOG.
- [ ] Full checks; independent review; fixes; screenshots; report; push after "yes".

## Results before review (10.10.2026)

- QA-4 locally ×4: 30 FPS with the table and props (22.5 with the first table: its planes lay under
  the board and under each other — every board pixel shaded twice in software WebGL; rebuilt as
  frames with holes, walls without lids, unlit), 44 draw calls on the close-up of a move.
- The rest view frames the leaders' group (cells 22–23 in the demo) instead of the whole strip.
- Props: one file of 167 KB, 2 259 triangles, four 128² textures.

## Independent review (10.10.2026)

One major finding, fixed: new data made the rest view start its own flight before the new plan
landed (a child's effects run before its parent's), the flight covered the first shot and the
camera then cut to the team — now `load()` drops a scene's flight when the plan has shots (a
button's flight stays), with a test. Minor, fixed: the cycle key holds every position, so after any
moves the leaders come first; a click that moved nothing brings no flight later (the camera is
already there); a resize during the rest flight retargets it; the tick's decision is `cycleStep`
with tests; the whole-strip e2e checks ≤ 80 000 triangles; props are centred on their spots
whatever their offsets in the file, missing models and failed merges warn; baked meshes are freed
only after they have left the scene; the floor is gone (all but invisible, a draw call and its
fill); docs say a 1-s flight and a 2–3-minute pause.

## Addendum: volume on the panels (D-44, the author's request of 10.10.2026)

KayKit Medieval Hexagon and Dungeon Remastered (CC0, pinned commits, the author's "yes") — models
stand on the painted features of each location, ≥ 1 unit off the path (tested): pillars on the ruins'
painted column tops, snowy peaks and boulders on the ice, basalt cones and torches on the volcano,
trees and 3D clouds in the heavens; tints move a model's colour keeping its shading. One file,
`src/assets/decor/decor.glb`, two draw calls for all four locations; up to ~3 500 triangles per
location of 15 000. The table got coins and a candle from the same pack.
