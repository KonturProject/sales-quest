# Moments of delight during the day: design

Agreed with the author section by section on 13.10.2026. The real game runs 12.10–25.10.2026 (D-51). Today
the figures move twice a day — after the funnel for yesterday (about 10:00) and after the paid invoices for
yesterday (about 12:00) — and nothing happens on the map in between.

The author's request (13.10.2026): «не хватает каких-то промежуточных активностей в течение дня, наборы
баллов, салюты или что-то ещё по анимациям, которые будут лучше вовлекать менеджеров». Constraints: (1) simple
to build — no rewrite of the engine's logic; (2) show the progress within the day; (3) delight and engage —
dynamics.

## The author's answers (13.10.2026)

- **Data within the day.** The author can upload the funnel's two numbers for **today** during the day as
  running totals: at 13:00 an operator has 3, in the evening 5 — the numbers are not added, they grow.
  Payments come only for past days (yesterday).
- **The intraday file** («пром итоги»): one sheet, columns A–C, no header row. Column A: a group's row (its
  full name with the code `СР<n>` inside, as in the funnel; B and C empty), then its operators (full names),
  then the next group. **B — `inv6`, C — `inv20`.** An empty cell is 0. No dates in the file.
- **The animation wanted:** the figure jumps up and the points are credited with a number that **grows to the
  target** («не просто +10 баллов, а число прирастает до целевого»), not a plain «+10».
- **Moments chosen (all four):** points gained, who brought the points, fireworks, achievements on the map.
- **Where they watch:** both the office screen and their own laptops — so a manager who opens the game later
  sees what happened since their last visit.
- **The approach:** events from comparing «было» and «стало» on the viewer's screen (not written by the admin,
  not from the engine's day history); the engine, the data format and the admin's write path stay as they are.
- **Order:** part 0 (the intraday file), then part A (panels), then part B (scene). One spec, three plans,
  each with its own review, report and push after «да».

Requirements touched: SPEC FR-MOVE-1…4, ACH-5, §4 (a firework at the finish), PERF-1…9, §12.1; DECISIONS
D-19…D-22 (profiles, own metrics, `sourceCode`), OQ-12 (a day without numbers is 0), D-23 (choreography),
D-35 (`inputsAsOf`), D-38 (the rotating rating), D-45 (the quality ladder), D-46 (the HUD style), D-47 (the
2D scheme), D-51 (public commit messages). Where to look: `docs/NAVIGATOR.md` §1 (engine), §3 (admin and
import), the HUD and scene sections.

New decisions: **D-55** (the intraday file), **D-56** (moments on the panels; «what's new»; FR-MOVE-4
changed), **D-57** (the scene: the jump, the counter over the figure, fireworks).

---

## Part 0. The intraday file «Промежуточные итоги» (D-55)

A third kind of export in the admin's import. Only `src/import` and the import screen change; the engine does
not.

### The profile

- New profile kind `list` in `ImportProfileSchema`:
  ```ts
  {
    id: 'intraday', kind: 'list', title: 'Промежуточные итоги',
    sheet: 0,                 // a sheet's name or index
    nameColumn: 'A',
    groupCode: 'СР\\d+',      // a group's row: column A has the code (D-21)
    metrics: [{ column: 'B', metricId: 'inv6' }, { column: 'C', metricId: 'inv20' }],
  }
  ```
  `DEFAULT_INTRADAY` joins `DEFAULT_PROFILES`.
- **Not written into the running game's config.** The import takes the config's profiles and adds every
  default profile whose `id` the config does not have. Viewers with older code parse the config with the
  two known kinds only; a config with an unknown `kind` would break them. The import log's `profileId` is a
  plain string — older code reads it.
- **Detection** (`detectProfile`), after the funnel (its sheet's name) and the payments (their header row):
  the profile's sheet has, in its first 30 rows, at least one row whose name column matches `groupCode` with
  the metric columns empty, followed by a row with a name and a number in a metric column. A file that is
  none of the three — refused as now.

### Parsing

- Rows from the top; a row whose name column matches `groupCode` opens a group (the code is the match, e.g.
  `СР5`); a row with a name below it is an operator of that group. Rows before the first group — refused
  «строка N: оператор до первой группы». An empty row is skipped.
- Each metric column: an empty cell is 0; an integer ≥ 0 is the value; a negative number or text that is not
  a number stops the import «строка N, столбец B: …», as the funnel does.
- `Parsed`: `metrics: ['inv6', 'inv20']`, `period` and `days` — the **chosen day** (one day), `groups` —
  the codes in order, `people` — everyone listed (also those with empty cells).

### The day

- The import screen shows a field «День» for this kind, by default the admin's day of the game (`gameDay`),
  limited to the game's days. Changing it re-dates the parsed rows (a pure function), so the preview
  follows.
- A file loaded the next morning for the evening before — the admin picks yesterday.

### What is written (unchanged rules of `applyImport`)

- The file's metrics (`inv6`, `inv20`) of that day are replaced (D-20): 3 then 5 — 5 is stored, not 8.
- Operators of the file's groups without a row get 0 for that day (OQ-12, as the payments do).
- Groups not in the file, other days and `pay` are untouched.
- The next morning the full funnel covers that day and replaces the intraday numbers with the official ones.
- The import log: `dateRange: [day, day]`, `profileId: 'intraday'`. `inputsAsOf` sees the records from the
  import's day on (D-35).
- The preview «было → станет» and the self-checks of matching (DATA-9) as for the other kinds; there is no
  total to check against (group rows are empty).
- The public commit message — counts only: «Импорт: промежуточные итоги за 13.10 — N операторов».

### Tools

- `check-exports` recognises the intraday file and prints counts only (groups, operators, rows with numbers).
- `make-fixtures` writes a synthetic intraday xlsx with the demo's invented names (`tests/fixtures/import`).
- `docs/IMPORT_FORMATS.md` gets a section «3. Промежуточные итоги» (structure and rules, no names, no
  numbers). The author's sample stays in their Downloads; it never enters the repo.

---

## Part A. Moments on the panels (D-56)

Everything here is the HUD shared by the 3D scene, the 2D scheme and the TV mode. Pure logic lives in a new
`src/moments/`; the HUD parts in `src/hud/`.

### A1. «Было» and «стало»: the snapshot

- **The snapshot** (`snapshotOf(game, config)`, pure) — what a screen showed:
  - `teams`: `teamId`, `position`, `points`, `locationIndex`;
  - `managers`: `managerId`, `teamId`, `points`, `achievementPoints`, `totals` (per metric);
  - `unlocks`: count per key `achievementId|managerId|teamId`;
  - `key`: the season's id, `trackLength`, `maxPosition` and the metric weights;
  - `dataAsOf` (the latest import's time the screen showed).
- **Live:** the viewer keeps the snapshot of the state it shows; a new state (new data, a new day) gives
  `moments = diffMoments(before, after, config)`, then the new snapshot replaces the old one.
- **«Что нового с вашего прошлого визита».** The last snapshot is also kept in the browser's storage
  (`sq.seen.v1`, one entry per season, in try/catch — without storage the game works as now). On opening,
  the first computed state is compared with the stored snapshot: a laptop opened at 15:00 replays everything
  since its last data.
- **No moments** (and the snapshot is not saved) when: a view of another day (`?date=`) or another number of
  cells (`?cells=`). **No moments** (the snapshot is replaced) when the `key` differs: another season, track
  length or weights — a recompute by new weights must not look like «everyone brought points».
- **The very first visit** (no snapshot): nothing replays — FR-MOVE-4 as now.
- The snapshot is saved as soon as the moments are taken (not after they are shown): simple; a tab closed
  mid-show loses that show.

### A2. The events (`diffMoments`, pure)

1. **Team points** — every team whose `points` changed: points «было → стало», cells «было → стало».
2. **Who brought points** — every operator whose `points` grew: the gain, the gains per metric that grew,
   the gain of achievement points. A correction by points (D-53) shows only the points. Ordered by the gain,
   largest first; ties — by name.
3. **A gate** — a team moved forward into a later location (`locationIndex` grew): the location's title.
4. **An overtake** — a team moved forward and is now strictly ahead of a team that was strictly ahead of
   it. Reaching the same cell is not an overtake; a team pushed back by a correction does not «overtake».
5. **A new leader** — one team alone in first place by position that was not alone in first place before.
   A tie at the top is no event.
6. **The finish** — a team reached `trackLength` (was below it).
7. **An achievement** — for a key `achievementId|managerId|teamId` the count of unlocks grew: the newest
   unlocks of that key. By count, not by the date — a recompute that moves an old unlock's date does not show
   it again. Ordered by `unlockedAt`, then by rarity (legendary first).

Decreases are not celebrated: a team's counter goes down quietly, a step back shows «−N шагов» as now, no
toasts, no fireworks.

### A3. «Герои дня»

- «Who brought most points today»: everything uploaded today counts — the intraday funnel, yesterday's
  funnel in the morning, yesterday's payments at noon.
- The viewer runs the engine a second time as of the end of yesterday — `computeGameState(input,
  <yesterday>T23:59)`, the same path as `?date=` (D-35) — and takes each operator's points now minus then.
  Yesterday before the game's start — «then» is 0 for everyone, no second run.
- Cost: two engine runs per new data (< 50 ms each on this PC, ≈ 3× on an i3), a few times a day.
- Known limit: an upload today that rewrites an older day already uploaded may not show in the difference —
  the older values are not kept in the data. Rare; the main flow is unaffected.

### A4. What the screen shows

**The team card:**
- a new line «1 234 балла · до шага ещё 14»;
- a thin «до шага» bar under the plan's bar: the share of the way to the next cell from the data (relative
  mode: the fractional part of `progress × trackLength`; absolute mode: of `points / pointsPerStep`); hidden
  at the end of the overflow zone (no next cell);
- when the points grew: the number runs from the old to the new value in about 1.5 s; a green «+12» next to
  it for a few seconds; a short flash of the card's frame in the team's colour.

**«Кто принёс баллы» — toasts:**
- on the left under the top bar (the rating is on the right); one by one, about 2.5 s each, at most three
  on screen;
- a toast: the team's gem, the full name, a large «+7 баллов» (the number runs), a line below «Качественные
  счета +2 · Разговоры от 20 минут +1» (metric titles from the config), achievement points if any;
- the top 5 by gain, then one toast «и ещё 12 операторов — +40 баллов».

**The plate over them** (top centre, under the top bar):
- «Новые данные от 15:02» — a portion arrived while the screen was open (the time of its data);
- «Что нового с 18:40 12.10» — opened after a break (the time of the data last seen);
- it stays while the toasts and the banners play.

**Achievement banners** (ACH-5):
- top centre, one at a time, 4 s each, after the toasts — the finale;
- a banner: an emblem in a frame of the rarity's colour (common, rare, epic, legendary — own icons come with
  stage 4), the title («Хет-трик»), who («<ФИО>» with the team's gem, or the team's leader for a team
  achievement), the short description;
- at most 6 per portion, then «и ещё N ачивок».

**«Герои дня» slide** in the rotating rating (D-38): the 10 who brought most points today, each with
«+N». Only when someone brought points today. When a portion arrives, the rating switches to this slide.

### A5. The queue and the weak laptops

- One queue per screen: the plate, the toasts, the banners. A portion arriving while a show plays is added
  to its end.
- **A hidden tab** (`visibilityState === 'hidden'`): the queue waits and plays when the tab is shown —
  nothing is lost; the scene pauses its moves the same way (PERF-3).
- Plain DOM and CSS animations. The number counters run on a short timer only while counting (≈ 20 updates
  a second for 1.5 s) — no endless loops (PERF-1).
- `prefers-reduced-motion`: numbers jump to the result; no flashes, no slide-in.
- Everything is `pointer-events: none` (no buttons; the TV mode is the same).

### A6. FR-MOVE-4 and the moves since the last visit

FR-MOVE-4 («при первом открытии … без проигрывания истории») changes: with a stored snapshot of the same
`key`, the first show plays the moves from the snapshot's positions — the scene's player and the scheme take
these positions as «before» instead of none. Without a snapshot — as now.

---

## Part B. The scene: the jump, the counter, fireworks (D-57)

### B1. The tour

The choreography (`planMoves`, D-23) gets the teams' points before and after, and a beat for every team
whose points grew or whose position changed:

1. the camera flies to the figure (3D; none in 2D);
2. the figure jumps up; over it «+12 баллов», the number running from +0 to +12 in about 1.2 s;
3. if it has steps — the walk with «+2 шага» as now;
4. at a gate — the cheer as now, with a firework;
5. a pause, the next team; at the end — the overview.

Teams with no change are skipped. A beat without steps takes about 2.5 s (≈ 15 s for six teams). The viewer
taking the camera stops the shots, as now. The cards (part A) count at once; they do not wait for the tour.

### B2. Fireworks

| Event | Firework |
|---|---|
| A gate | a burst in the team's colour |
| An overtake | a small burst over the overtaking figure at the end of its walk |
| A new leader | larger, with gold |
| The finish | the largest — several bursts in a row |

The rules for these events are part A's (`src/moments`); the choreography reuses them.

- **3D:** one pool of at most 200 point particles (one draw call), alive only while the tour plays; no
  post-processing, no shadows, no physics (PERF-9). On the lower steps of the quality ladder (D-45) — half the
  particles.
- **The counter over the figure** — the same label as «+N шагов» (`labels.ts`); while counting its texture
  is redrawn at most 15 times a second.
- **2D scheme:** the same beats without the camera; the token's jump and the running number in SVG; the
  firework — a couple of dozen dots flying apart by a CSS animation.
- `prefers-reduced-motion`: no fireworks; the counter shows the result.

---

## Verification and delivery

**Plan 0 — the intraday file:**
- unit tests on a synthetic file: groups and operators under them, an empty cell as 0, a stop on a negative
  number and on text, an operator before the first group, the chosen day and the replacement of the day
  (3 → 5), 0 for listed groups' operators without a row, `pay` untouched, detection against the other two
  kinds, the default profile added to a config without it;
- e2e: the import through the admin — one commit, the figure moves;
- `check-exports` on the fixture; IMPORT_FORMATS §3, DECISIONS D-55, NAVIGATOR.

**Plan A — the panels:**
- unit tests of `src/moments`: the snapshot; every event of A2; no celebration of decreases; another `key`
  gives no events; achievements by count; «Герои дня», also on the game's first day; storage unavailable —
  the game as now; the «до шага» share in both progress modes and at the end of the overflow zone;
- e2e: «Что нового» — an old snapshot put into storage, the page opened: the plate, the toasts, the running
  numbers, an achievement banner, the figures' walk; the first visit — nothing replays; a hidden tab — the
  queue waits;
- the screenshot tests QA-6: the cards with the «до шага» bar, a toast, a banner, the «Герои дня» slide;
- DECISIONS D-56 (with FR-MOVE-4), NAVIGATOR.

**Plan B — the scene:**
- unit tests of the choreography: beats for teams with points only, fireworks at a gate, an overtake, a new
  leader, the finish; the timing of a tour;
- the perf test QA-4 plays a move with a firework: ≥ 28 fps at ×4 on this PC (D-45); new QA-6 baselines;
- DECISIONS D-57, NAVIGATOR.

Each plan: an independent review, a short report in Russian, the push after «да» (D-3). The game runs until
25.10: plan 0 first — the intraday steps work at once with today's animation of moves.

## Not in this work

Sound; the cards counting in step with the tour; own achievement icons (stage 4); a journal of moments;
«Реплей недели» (FR-MOVE-4's option); clicks on toasts or banners.
