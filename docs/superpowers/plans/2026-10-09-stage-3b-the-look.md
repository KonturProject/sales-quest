# Stage 3b — The Look Implementation Plan

> **For agentic workers:** executed inline in the authoring session (stage process, 06.10.2026); an
> independent review subagent checks the result. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** The board wears the author's painted art and the teams are animated heroes: four painted panels
joined into one strip, cells on the painted paths, six KayKit heroes in team colours that hop cell by
cell and cheer at a gate, and a little life in each location while moves play — still 0 frames at rest
and within the §12.1 budgets; QA-4 on CI's runner gets back to ≥ 28 FPS.

**Architecture:** An asset pipeline (`scripts/assets.ts`, Node) turns the sources into optimized files in
`src/assets/` with a manifest; Vite imports them with `?url`, so they get hashed names (DEP-4). Pure
modules keep the logic testable in Node: `themes.ts` (panel art, traced paths, colours), `layout.ts`
(panels in the art's aspect), `heroes.ts` (catalog, merging a hero into one skinned mesh, poses from
the plan), `ambient.ts` (particle seeds). Thin R3F components draw them.

**Tech Stack:** as in 3a; new dev dependencies for the pipeline only: `sharp` (images),
`@gltf-transform/core`, `@gltf-transform/functions`, `meshoptimizer` (glTF trimming and
simplification). Runtime: `GLTFLoader` and `SkeletonUtils` from `three/examples`.

**Spec:** `docs/superpowers/specs/2026-10-08-stage-3-scene-design.md` (3b); `docs/SPEC.md` §11.3–11.5,
§12; `docs/ART_BRIEF.md`; `docs/DECISIONS.md` D-37, D-40, D-41.

## Decisions taken with this plan (D-41)

- **Art:** of the author's variants the scene uses `ruins1`, `ice1`, `volcano1`, `heaven1` — one
  cartoon manner, the path enters and leaves at the middle of the side edges, the side edges sink into
  dark mist; `ice2` has a paper frame, `heaven` a parchment border, `volcano` brown smoke and a broken
  path, `ruins` is square and has no mist. The author can swap a variant: one line in the pipeline.
- **Panels keep the art's aspect** (1408×768 ≈ 11:6) instead of squares: depth 12 as in 3a, width
  22. No gaps: the mist edges meet; the pipeline also fades the outer 6 % of the width and 8 % of
  the height into one background colour, which the scene uses as its background, so seams and the strip's border vanish.
- **Heroes:** KayKit Character Pack: Adventurers 1.0 (Kay Lousberg, CC0), fetched at a pinned commit
  into the git-ignored `assets-src/`. Five heroes and their weapons give ten variants (GFX-CHAR-1);
  the season's `characterId` picks one, an unknown id falls back by team order. Kept clips: `Idle`,
  `Running_A`, `Jump_Full_Short`, `Cheer`; texture 128² (the pack's gradient atlas).
  The budget of 3 000 triangles per figure (§12.1) holds after simplification.
- **One draw call per hero:** at load the body parts and the rigid pieces (helmet, cape, weapons —
  attached to bones) are merged into one skinned mesh; rigid pieces get weight 1 on their bone.
- **Team colour (GFX-CHAR-3):** the cape is recoloured in the shader (a per-vertex mask, the team
  colour keeps the cape's shading), plus the ring and the name plate of 3a.
- **Poses come from the plan, not from a clock:** a hop plays `Jump_Full_Short` scaled to the hop
  (hops shorter than 250 ms run `Running_A` instead); a team that passed a gate or the finish cheers
  during its pause; at rest every hero stands in the first frame of `Idle` facing the viewer —
  0 frames at rest stays true (PERF-1).
- **Ambient life:** one point cloud per location (runes' motes, snow, embers, golden motes) moved in
  the vertex shader by one time uniform; time advances only on ticks of a plan (PERF-1, PERF-2).
- **Optimized assets live in `src/assets/`** (not `public/assets/`, GFX-SRC-3): imported with `?url`
  they get hashed names (DEP-4); the manifest is checked in CI (`npm run check:assets`, GFX-PIPE-3).

## Global Constraints

- Everything of 3a stays: render on demand, ≤ 30 FPS only with a reason, 0 frames at rest and hidden,
  Low quality by default, no shadows (blob shadows), no post-processing.
- Budgets (§12.1): ≤ 120 draw calls, ≤ 80 000 triangles in frame, ≤ 3 000 per figure, textures ≤ 1024²
  and ≤ 64 MB in GPU, assets ≤ 20 MB in total.
- Assets only CC0/CC-BY with a line in `ASSETS_CREDITS.md`; sources and `refs/` never in git.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved,
  push only after "yes" (D-3).

## File map

| File | Responsibility |
|---|---|
| `scripts/fetch-assets.ts` | downloads the hero pack at the pinned commit into `assets-src/` |
| `scripts/assets.ts`, `scripts/lib/assets.ts` | panels: resize ≤ 1024, edge fade, WebP; heroes: trim clips and weapons, simplify, 128² texture; `src/assets/manifest.json` |
| `scripts/check-assets.ts` | budgets from the manifest and the files (CI) |
| `src/scene/themes.ts` | per theme: art URL, aspect, traced path, background, ambient kind |
| `src/scene/layout.ts` | panels in the art's aspect, no gaps; the rest as in 3a |
| `src/scene/heroes.ts` | catalog and variants; `mergeHero` (one skinned mesh); clip and time for a pose |
| `src/scene/Board.tsx`, `Figures.tsx`, `Ambient.tsx` | textured panels; heroes; point clouds |
| `src/scene/choreography.ts` | a move knows whether the team passed a gate (`cheer`) |
| `tests/e2e/*.spec.ts` | the scene with assets; QA-4 |

---

### Task 1: Pipeline and assets

- [x] `fetch-assets.ts`: file list of the pack at commit `672074b…`, download with retries, keep LICENSE.
- [x] `assets.ts`: panels from `refs/board/<variant>.jfif` → `src/assets/board/<theme>.webp` (1024 wide,
  edge fade into the background colour); heroes → `src/assets/heroes/<hero>.glb` with the kept clips
  and weapons, simplified, texture 128²; manifest with triangles per variant, sizes, clips, licence.
- [x] `check-assets.ts` + CI step; `ASSETS_CREDITS.md`.
- [x] Tests: the manifest's budget rules (pure function) on a synthetic manifest.

### Task 2: Painted board

- [x] Trace each panel's path (control points on a grid overlay, checked by drawing the polyline on the
  art); `themes.ts` carries the URL, aspect, path, background colour.
- [x] `layout.ts`: panel width × depth from the aspect, no gap; tests updated (cells inside their panel,
  checkpoints, bounds).
- [x] `Board.tsx`: one textured unlit plane per panel (loaded lazily, placeholder colour until then);
  cells, gates, start and overflow restyled to sit on the art; scene background = the art's mist colour.

### Task 3: Heroes

- [x] `heroes.ts`: catalog of ten variants; `heroFor(characterId, order)`; `mergeHero(root)` → one
  skinned mesh with a cape mask; `heroPose(move, t)` → clip and time (jump / run / cheer / idle).
- [x] `choreography.ts`: `cheer` on moves that pass a checkpoint or the finish; tests.
- [x] `Figures.tsx`: load the heroes (`GLTFLoader`), clone per team (`SkeletonUtils`), team colour,
  facing, poses from the player every frame; placeholder figures until loaded; demo config gets
  catalog `characterId`s; reseed.

### Task 4: Ambient life

- [x] `Ambient.tsx`: a point cloud per panel by theme, shader-animated, time from the ticker's frames;
  frustum-culled by its bounds.

### Task 5: Performance, tests, docs, review

- [x] e2e: the scene loads its assets without errors; moves play and rest at 0 frames; QA-4 locally at
  CPU ×4 and ×8 (the CI runner's proxy) — profile and trim until ×8 ≥ 28.
- [x] Screenshots for the author: overview, a close-up, a move.
- [x] CLAUDE.md, BACKLOG, DECISIONS (D-41); full checks; review (self, see below); fixes; report; push after "yes".

## Results before review (09.10.2026)

- QA-4 locally: CPU ×4 — 29.9 FPS, CPU ×8 (the CI runner's proxy) — 30.1 (was 26.2 on the
  placeholders); 37 draw calls on the close-up of a move (was 53; 53 with the whole board in view),
  15 266 triangles; initial JS 372 KB of 600.
- Assets: panels 360 KB, heroes 1.67 MB (after the review: four clips); every variant 2 583–2 829
  triangles.
- Changed on the way: cells about the painted path's width (≤ 1.4) and heroes 1.55 high, so the
  figures read over the art; name plates on a shared cell stack; the overview fit became a true
  projection for any camera angle (a diagonal view was tried and dropped — the straight one reads
  best); the strip's overview stays thin — OQ-23 for the author.

## Review (09.10.2026)

The independent review subagent could not run: three launches (two models) failed with an API
authentication error (403) before reading anything. The authoring session reviewed the diff itself
instead and fixed: name plates stacked by the raw position (figures past the end share the last cell, their
plates overlapped); a failed hero download stayed cached until a reload; a body part bound to a bone
the body lacks went silently to bone 0 (now an error, with tests for reordered skeletons); the overview
box ignored the name plates and an inset over half the screen could never fit; the heroes' effect
parsed a key built with `:` and `|`; the docs put the panels' GPU memory at 6 MB instead of ~12. The
independent review followed (below).

## Independent review (09.10.2026, after a restart of the session)

No critical or major findings. Fixed: the pipeline disposed of a dropped node's mesh, which a kept
node might share (now the nodes only, and every kept part must keep its triangles); one failed hero
or a missing clip put every team on placeholders (now each team on its own; a missing clip stands
the hero and the figure hops by itself, GFX-CHAR-2; the budget check wants every clip); a panel kept
another location's art when its theme changed; disposed rigs kept their bone textures; the cheer ran
past the pause, mostly off camera (the pause after a gate now lasts the cheer, `TIMING.cheerMs`);
the licence check let CC BY-NC/-SA/-ND through (an exact allowlist now); `check:assets` missed files
not in the manifest; `mergeHero` now refuses a part with another texture or other inverse bind
matrices, and turns a mirrored piece's triangles back; the overview fits the distance after the last
centring and reaches the plates; `Walking_A` was kept but never played (dropped: the heroes weigh
1.67 MB instead of 1.85). New tests: the overview's corners in the free part of the screen at any yaw
and the inset cap, rig posing and the clip fallback, the cape shader hooks, plate stacks, a reordered
skeleton moving with its bone, the mirrored piece, licences and clips. Left for later (BACKLOG): the
hero's turn from the way ahead to the viewer is a snap.
