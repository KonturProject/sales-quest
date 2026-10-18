# The finale of the game — design

Agreed with the author on 18.10.2026. The real game runs 12.10–25.10.2026 (D-51); its last working day is Friday
23.10, whose data the author uploads on Monday 26.10 (the funnel ~10:00, the payments ~12:00). The finale must be on
the site before 26.10.

## Intent

Today the game has no end: after 25.10 the map just stays as on the last day — no «game over», no results, no
winners. The author wants the department to finish the game **inspired and feeling part of a common cause**
(«люди должны почувствовать вдохновение и причастность к общему делу»), on **every screen** — the office's wall
screen and the staff's laptops.

The author asked for, in this order: **fireworks**; **the best of the best** (the strongest operators of the
game); **significant achievements**; **the best manager of each team**; and a **podium of the top 3 teams «by
speed»** — like any competition, ranked by the cells they passed. The author accepted these guesses of ours as
theirs: the department's common result comes first (so even the last team sees its part in what was done
together), every team gets its own hero, a ceremony plays once and then a results screen stays.

## Goals

- **A ceremony** of about a minute, played once on each screen, building up to the winner:
  1. **«Игра завершена»** — the first fireworks; the department's common result counts up: the totals of every
     metric of the game (by the config's metric titles: payments, quality invoices, 20-minute talks), the
     achievements taken, and the department's share of its common plan.
  2. **The best in each team** — six cards, one per team: the operator who brought the team the most points.
  3. **Significant achievements** — the legendary and epic achievements of the game (operators' and teams') and
     who took them.
  4. **The best of the best** — the top 3 operators of the game, shown from the third to the first.
  5. **The podium** — the top 3 teams by the cells they passed: third, second, first; a big firework over the
     winner — over its hero in 3D, over its token on the 2D scheme.
- **A results screen** after the ceremony, on all screens until the next game starts: the podium, the
  department's common result, the best of the best, the significant achievements, and «лучший в команде» for all
  six teams — over the map with its figures (the map stays visible behind it; the finale is part of the game).
- **The start — the author's button «Подвести итоги»** in the admin. Not by date: on the morning of 26.10 the
  data are still incomplete. The author uploads the last data, checks them, presses the button; every open
  screen picks the finale up at its next data check, as it picks up new steps today. A screen opened later plays
  the ceremony once, at its first visit; after that it shows the results screen at once.

## Non-goals

- Archive, «Зал славы» of past games, a new game cloned from the old one, an XLSX export (stage 5).
- Sound; photos of the leaders; a 3D podium the figures climb onto.
- Changing the pace lines: the author decided on 18.10 to keep each team's own pace line (D-26).

## Anti-goals (a finale that works but fails)

- **Shaming the last teams.** No «last place», no bottom of a ranking; the podium shows only the top 3, every
  team gets its best operator, and the common result leads.
- **Results on incomplete data:** the finale never starts by itself.
- **Real names in public places:** the admin's commit message is public — «итоги игры 12.10–25.10», dates and
  counts only (D-51).
- **A weak laptop that stutters through the ceremony** (SPEC §12, PERF-1): no endless animation loop; the
  fireworks reuse the scene's pool (≤ 200 points, D-57); the overlay is plain DOM with CSS animations played once.

## Constraints

- The engine stays pure (D-11); the finale's numbers are derived from `GameState` and the config by pure functions
  and stay live: a correction after the closing changes the results screen.
- `config.status = 'closed'` already exists in the schema (`draft | active | closed`) and in `seasons/index.json`;
  the site loads the season named by `version.json`, not by the status, so a closed season still loads.
- **Old open pages:** a page opened before the deploy keeps its old code until reloaded. Any new config field must
  be optional — zod strips unknown keys, so old code reads the closed season as before. The office screen and
  the laptops must be reloaded once after this work is deployed (a line in the author's report).
- A new browser memory (the ceremony seen) follows `sq.seen.v1` (D-56): `localStorage`, every access in
  `try/catch`; without storage the ceremony plays on every visit.
- `prefers-reduced-motion`: no fireworks, numbers at once, steps without slide-ins.
- A hidden tab plays nothing; the ceremony waits for the tab to be shown (PERF-3, the run clocks of D-56).
- The HUD's rules (D-46): the `sq-*` classes, no `backdrop-filter`, blurred shadows or glow; Russian UI text,
  English code comments.
- The initial JS of viewers stays ≤ 600 KB gzip; the admin's part stays in its lazy chunk (D-7a).

## Decided with the author

- Two parts: the ceremony (once per screen) and the results screen (stays).
- The ceremony's order and contents as in «Goals»; the winner last.
- The podium: top 3 teams by the cells passed («самый быстрый отдел… или по количеству клеток, которые они прошли»).
- The best in each team, the best of the best (top 3), the significant achievements (legendary and epic).
- The start: the admin's button «Подвести итоги» after the last upload.
- The pace lines stay as they are.

## Our calls (the builder may revisit them, the author may correct them)

- **The closing commit** sets the season's `status: 'closed'` in its config and in the index, with the moment of
  closing (an optional `closedAt` local timestamp, D-11); the button is available from the game's last day
  (`period.end`) on. Before writing it shows the podium and the top 3 for a check.
- **«Вернуть игру»** — the admin can undo a closing pressed by mistake (`status` back to `active`). A browser
  remembers the ceremony by the closing's `closedAt`, so a new closing plays it again.
- **Imports and corrections stay allowed** after the closing; the finale's numbers follow them.
- **The podium's order** (builder check): by the cell the figure stands on (`position` — what everyone sees on
  the map, with the admin's steps and resets, D-17, D-53), then by the share of the plan (`progress`), so two teams
  on one cell — or both at the end of the overflow zone — are told apart by the share. Only an exact tie of both
  shares a place: then two teams stand on that step, and a shared first gets the firework over each of them, the
  camera on the overview. A place prints «клетка N · X % плана».
- **«Лучший в команде»** (builder check) — among the team's members on the game's last day (as the team's rating
  slide lists them, D-38), by the points they brought that team (`contributions`); not fired (R-5), vacationers
  kept. An operator moved mid-game is the hero only of the team they ended in.
- **The best of the best** — the leaderboard's top 3 (fired operators have no rank, R-5).
- **Ties:** equal progress shares a podium place; equal points of operators follow FR-LB-5.
- **The department's plan share** — the teams' points over the teams' plans, summed.
- **The department's metric totals** (builder check) — the imported records of every operator (fired included)
  plus the admin's «показатели за день» corrections (D-53): those are points only, but their reason starts with
  the code-written «<показатель> ±N:», so the count is read from that prefix (and must agree with value ÷ weight;
  a correction that does not parse is left out of the counts, never guessed).
- **During the finale** the rotating rating, the team cards and the moments (toasts, banners) are hidden — the
  results screen replaces them; the top bar stays (data time, 3D/2D switch).
- **On laptops** the results screen has a button «Посмотреть церемонию ещё раз»; the wall screen (`?mode=tv`)
  has no buttons and plays the ceremony once like any screen.
- **The camera** in 3D goes to its overview for the ceremony and to the winner for the last firework.

## Left to the builder

- The exact timings of the steps (about a minute in all), the layout of the results screen at 1280×720 and on a
  laptop, the look of the podium in the `sq-*` style, how the fireworks are triggered outside a tour.
- How the admin's closing reuses the existing commit path (`pipeline.ts`) and its preview.
- Tests: pure functions of the results (podium, best per team, top 3, significant achievements, the common
  result, ties, fired and vacationers), the admin's closing and undo (fake GitHub), e2e of the ceremony on the
  demo with a closed season, a QA-6 baseline of the results screen, QA-4 not worse during the ceremony.
- DECISIONS (a new D-59), NAVIGATOR, BACKLOG.
