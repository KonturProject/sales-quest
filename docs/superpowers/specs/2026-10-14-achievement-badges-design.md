# Achievements always on view: badges by the name and «Доска почёта» — design

Agreed with the author section by section on 14.10.2026. The real game runs 12.10–25.10.2026 (D-51).

The author's request (14.10.2026): «нужно, чтобы ачивки были видны менеджерам на постоянной основе и выделяли
их из других менеджеров… придумать место, куда мы положим эти ачивки и как они будут проигрываться… как не
перегрузить интерфейс». Today an achievement lives only in its banner (ACH-5, D-56): four seconds on the map,
then it is gone.

## The author's answers (14.10.2026)

- **What a manager gets:** a badge next to the name and a board of honour («Значок рядом с именем, Доска
  почёта») — not a personal collection, not an achievement count.
- **The approach:** everything inside the rotating rating (D-38) — badges in its rows and one more slide; no
  new panel on the screen. Rejected: a permanent «strip of honour» along the screen's edge (one more element on
  a dense screen) and badges on the heroes' plates in 3D (the figures are the team leaders, not the managers).
- **The badge:** variant А — a small round «gem» in the rarity's colour, no letter, no icon (variant Б, a
  medallion with the title's first letter, was rejected: the letter is tiny at a distance and repeats —
  «С» is «Стабильность», «Сотня» and «Спасатель»). Round, so it is not taken for the team's diamond already in
  the row. Icons replace both at stage 4.
- **Part 1 (badges by the name)** and **part 2 («Доска почёта»)** accepted as below; **part 3 (code and
  checks)** accepted.

Requirements touched: SPEC ACH-1 (unlocks), ACH-5 (banners), FR-LB-1 (achievement icons in the leaderboard —
done in part here, see D-58), PERF-1 (no per-frame work), §12 budgets; DECISIONS D-27 (the starter set), D-38
(the rotating rating), D-46 (the HUD style), D-54 (vacation), D-56 (moments, «Герои дня», the show's clock).
Where to look: `docs/NAVIGATOR.md` — the HUD and moments sections.

New decision: **D-58** (achievements always on view).

---

## 1. Badges by the name

- **Which achievements give a badge:** enabled achievements of scope `manager` with rarity `rare`, `epic` or
  `legendary`. `common` ones («Открыл счёт», «Разогрев») give none — they would be next to almost every name and
  single nobody out; they keep their banner.
- **Order:** legendary, then epic, then rare; within a rarity — the order of `config.achievements`.
- **How many:** at most **3** gems by a name; more — «+N» after them (N = the badges not shown).
- **Repeatable achievements** («Лидер недели», «Долгий разговор», «Звонок недели»): one gem however many times
  taken. The count shows on the board (part 3).
- **Where:** every row of the rating with an operator's name — the team slides, «Топ-10 операторов», «Герои
  дня». Not the toasts «кто принёс баллы» (they flash for seconds) and not the team cards at the bottom.
- **The same everywhere:** the wall screen (`?mode=tv`), laptops, the 3D scene and the 2D scheme share the one
  HUD.
- **The look:** a 9 px circle with a dark edge in the rarity's colours of the banners' emblems (`.sq-rarity-*`,
  D-56): rare — blue, epic — violet, legendary — gold. After the name, before the points. A screen reader gets
  the titles in text («ачивки: Стабильность, Хет-трик»); the gems themselves are `aria-hidden`.

## 2. Team achievements on the team's slide

- A line under the team slide's heading: a gem and the title for each team achievement the team holds (`scope:
  'team'`, any rarity but `common`, the same order as part 1).
- **The same title folds into one:** the three «Первопроходец» (`pioneer_l2…l4`) show as «Первопроходец ×3»;
  a count of 1 shows no «×».
- No line when the team holds none. The team cards at the bottom stay as they are.

## 3. The slide «Доска почёта»

- **What it lists:** achievements of scope `manager`, rarity `rare`, `epic` or `legendary`, that at least one
  operator still in the game holds. Team achievements stay on the team slides (part 2).
- **A row:** a gem and the title; under them, the holders. A holder's name is short — «Фамилия И.» (the
  scheme's `shortName`); full names do not fit a comma-separated line of a 300 px panel.
- **Holders:** in the order they took it — the earliest `unlockedAt` first, then by name (`ru`). A repeatable
  one taken more than once — «×2». At most **3** names, then «и ещё N».
- **Who is left out:** fired operators (`fired`, R-5) — their unlocks stay in the engine but not on the board;
  operators on vacation (D-54) show as usual. Manual grants (`source: 'manual'`) follow the same rules.
- **Order and size:** legendary, then epic, then rare; within a rarity — the order of `config.achievements`.
  At most **6** achievements on a slide (about the height of the top 10); more — the board takes several slides
  in a row, headed «Доска почёта 1/2», «2/2».
- **The legend** at the bottom: the three gems with «легендарная», «эпическая», «редкая» — a manager learns there
  what the gem by their name means.
- **Its place in the rotation:** after «Топ-10 операторов», before «Герои дня»; one slide every 15 s like the
  others (`SLIDE_MS`). No board while nobody holds such an achievement. No jump to the board on a new
  achievement: its banner already plays, and the rating keeps jumping to «Герои дня» (D-56).
- **Not on the slide:** the conditions of the achievements — they double a row's height. The author has the
  table of conditions to send round.

## 4. A fresh badge: after its banner, one glint

- **Hidden until its show is over:** the unlocks among the events of the latest batch of moments (`Moments`,
  D-56) give no gem until that batch's show — the toasts, then the banners — has played out. The figures walk
  first, then the story (D-56), then the gem: no gem spoils the banner.
- The show's clock is read, never started, by the rating: a read-only accessor of the run clocks
  (`src/hud/clock.ts`). A run not yet started (the batch waits in the queue) reads as «not over».
- **One glint:** a fresh gem glints once (a short CSS animation, about a second) the first time its slide shows
  after the show; then it just stands. «Glinted» is remembered outside the components for the page's life, as
  the run clocks are — a remounted HUD does not glint it again.
- **Less motion** (`prefers-reduced-motion`): the gem appears without a glint.
- **Known simplification:** only the latest batch hides its unlocks. When a second batch arrives while the first
  still plays, the first's gems show at once, without a glint — rare (a batch is a new portion of data) and
  harmless.

## 5. The code

The engine, the data, the import and the admin do not change: `game.unlocks` and `config.achievements` already
hold everything.

- **`src/hud/badges.ts`** — pure functions, no DOM:
  - `managerBadges(game, config): Map<string, Badge[]>` — every operator's badges by part 1's rules, in order,
    one per achievement (`count` — times taken);
  - `badgeLine(badges, max = BADGES): { shown: Badge[]; more: number }` — the 3 gems and «+N»;
  - `teamBadges(game, config): Map<string, Badge[]>` — part 2, folded by title (`count` — how many);
  - `honorBoard(game, config): HonorRow[]` — part 3's rows (title, rarity, the first holders with their
    counts, `more`); `honorPages(rows)` — the slides of 6;
  - `Badge = { achievementId; title; rarity; count }`; constants `BADGES = 3`, `HONOR_PER_SLIDE = 6`,
    `HONOR_NAMES = 3`.
- **`src/text.ts`** — `shortName` moves here from `src/scheme/geometry.ts` (the scheme is a lazy chunk; the HUD
  must not pull it), the scheme imports it from here.
- **`src/hud/rating.ts`** — the rows of the team, top and heroes slides carry their badges; the team slide — its
  team badges; a new slide `{ kind: 'honor'; page; pages; rows }` after the top 10.
- **`src/hud/Hud.tsx`** — the gems in the rows, the team's line, the board's view with the legend; the slide
  dots keyed per board page; the fresh gems of part 4.
- **`src/hud/clock.ts`** — the read-only accessor of a run's state.
- **`src/hud/theme.css`** — `.sq-badge` with the rarity modifiers and the glint, `animation: none` under
  `prefers-reduced-motion`.
- **Speed:** plain DOM redrawn with the data and the 15-second slides, one CSS animation per fresh gem — no
  per-frame work (PERF-1); the scene is untouched, so QA-4 is not re-measured.

## 6. Verification and delivery

- **Unit tests** of `badges.ts`: `common` and disabled achievements give no badge; the order by rarity and by
  the set; a repeatable one gives one badge with its count; «+N» after 3; team titles folded («×3»); the board
  leaves out fired operators and keeps vacationers; holders by date, then name; «×2»; «и ещё N» after 3 names;
  6 per page and a second page; no board without such achievements; `shortName` on one- and two-word names.
- **Rating tests** (`tests/unit/hud.test.ts`): the rows carry badges; the board's place after the top 10 and
  before «Герои дня»; no board slide without holders.
- **The fresh gem:** unit tests of the hidden set and the read-only clock; e2e — a remembered snapshot before an
  achievement, the page opened: no gem while the banner plays, the gem after the show.
- **Screenshot tests QA-6:** new baselines with gems in the rating, a baseline of the board slide; the new
  baselines looked at before the commit.
- `npm run typecheck && npm run lint && npm test`, `npm run test:e2e`.
- **Docs:** DECISIONS **D-58** (with FR-LB-1: the 3 rarest instead of «иконки 3 последних», the rarity's colour
  instead of an icon until stage 4), NAVIGATOR (HUD), BACKLOG (what is left of FR-LB-1/FR-LB-7).
- One plan, inline execution, an independent review, a short report in Russian, the push after «да» (D-3).

## Not in this work

Own achievement icons (stage 4); the leaderboard page and the manager's card (FR-LB-1, FR-LB-7, stage 4);
hover tooltips (the HUD takes no pointer — `pointer-events-none`); badges on the team cards, the toasts or the
heroes' plates; the conditions on the board; sounds.
