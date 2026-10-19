# The admin's journal, corrections in the import preview, undo — design

Agreed with the author on 19.10.2026 (stage 2b-3, part 1; weights and the phrase change are part 2, after the
game). The real game runs 12.10–25.10.2026; its last data are uploaded on Monday 26.10, then «Подвести итоги»
(D-59). This work is most useful in the game's last week — the sooner it is on the site, the better.

## Intent

The author runs the game alone from the admin: a funnel export every morning for yesterday (it finalises the day
after the intraday «Промежуточные итоги», D-55; never two funnels for one day), payments around noon, intraday
files during the day, and corrections by hand when an export misses something (today: one quality invoice the
funnel did not have, added as a correction «Качественные счета +1»).

Two things hurt today:

1. **After an upload there is no way to see what it changed per operator.** This week the author uploaded a
   funnel over several days they had skipped; it rewrote those days, and they wanted to see whose 20-minute talks
   and quality invoices went up or down, and by how much. The import's preview shows only the teams' cells and the
   top 10 (`PreviewMoves`), and nothing at all after «Записать».
2. **A mistake cannot be undone**: a correction that turns out double (added by hand, then the same payment came in
   an export), a wrong file or a wrong day uploaded.

## Goals

- **The import preview shows per operator what the file changes** — «было → по выгрузке» for every metric the file
  writes, only the operators whose numbers change, summed over the file's days (a day-by-day view on demand).
- **Corrections right in that preview.** Seeing a row, the author adds a correction for that operator — the same
  «показатели за день» correction as on the «Корректировки» screen (D-53: `manager_points`, the reason starts with
  the code-written «<показатель> ±N:» and the author's words) — and it is written in the same commit as the
  import. The row then shows three numbers: **было → по выгрузке → с правкой**.
- **The journal** (ADM-LOG): every action of the game in time order — imports, corrections, roster batches,
  «Подвести итоги» / «Вернуть игру», rollbacks — with when, who and what (as in the commit's public line), a filter
  by type. Opening an import shows the same per-operator table «было → стало» it had in its preview; opening a
  correction batch shows each correction with its reason. **Past actions too** — everything since the launch on
  11.10.2026, not only what is done after this work ships.
- **Undo** (ADM-UNDO):
  - **cancel a correction** — a button at the correction in the journal, with a reason («оплата пришла в
    выгрузке»): the correction stays in the journal struck through and leaves the points (`revoked`, which the
    engine already honours: `src/engine/adjustments.ts`);
  - **put the game back as it was before a chosen action** — for a wrong file or a wrong day: a preview «было →
    станет» first, and a plain warning that every action after the chosen one goes back too (they are listed).

## Non-goals

- Weights (ADM-WEIGHTS) and the phrase change (SEC-8) — part 2, after the game.
- Granting or revoking achievements in the admin, their statistics — stage 4.
- Editing an export's own numbers: a fix is always a correction on top (it survives a later re-upload of the day,
  shows in the journal with its reason and can be cancelled).
- Undoing a single import while keeping what came after it (only the rollback of everything after a point).
- Anything on the viewers' map: the journal and undo are admin-only (the admin's lazy chunk, D-7a) — with one
  exception: the finale's department totals (`manualCount`, D-59) must stop counting cancelled corrections, or a
  cancel would not reach the finale's numbers.

## Anti-goals (works, but fails)

- **A correction counted twice without notice** — the reason this part exists.
- **Names in public places**: commit messages stay counts and dates only (D-51; `commitChange` refuses a name).
- **A rollback that silently drops later work**: the actions going back are listed before «Записать».
- **A journal that lies about the past**: «было → стало» of an old import comes from the data as they were at
  that commit, not recomputed from today's data.
- **A slow or broken admin on a long history**: the list must open quickly; details load on demand.

## Constraints

- Every change goes the existing one way: read at the head of `main` → change → preview → one commit on the commit
  that was read (`src/admin/pipeline.ts`, SEC-4, ADM-2; `ConflictError` re-reads). Note: `commitChange` refuses an
  `after` whose import log does not start with the read one (review 2a) — a rollback needs its own path.
- The history of the data is the repository's commit history (SEC-5: «История коммитов = аудит-журнал и основа для
  ADM-UNDO»): each data commit has the public line `data(<seasonId>): <action> — <counts> [by <login>]`, and the
  season's files at that commit can be read (`GitHubRepo.read(path, commit)`) and decrypted with the game's phrase
  (the salt and iterations of the season's envelope; the admin's `KeyCache`). Listing the commits needs a new
  GitHub call; the token goes to `https://api.github.com` only.
- The engine stays pure (D-11); «now» is a parameter; timestamps through `localTimestamp` (D-11, BACKLOG 2b).
- Only the current season's actions (since its launch); the demo and earlier games are not listed.
- Corrections already in the data keep working: `reason` «<показатель> ±N: …» is parsed by the finale's
  `manualCount` (D-59) — the new corrections must keep that form.
- Russian UI text, English code comments; the `sq-*` style (D-46); admin tests with GitHub faked in the browser
  (`tests/support/fakeGitHub.ts`, QA-3).

## Decided with the author

- The journal's main question is «what did this upload change, per operator»: up and down, by metric.
- Corrections can be made in the import preview, as corrections (not edits of the export's numbers), in one commit
  with the import; the row shows было → по выгрузке → с правкой.
- Undo = cancel a correction (struck through, with a reason) + put the game back to before a chosen action, with a
  preview and a warning that later actions go back too.
- **Three releases, each pushed on its own «да»** (19.10): (1) the per-operator table in the import preview, the
  corrections in it and the double-count hint; (2) the journal with the cancel of a correction and the check of past
  double counts; (3) the rollback — last, with its own review, on the site before Monday 26.10.

## Our calls (the builder may revisit them, the author may correct them)

- **The day of a correction made in the preview** is the file's day; for a file over several days — the last day
  by default, any day of the file to choose (the day-by-day view of the row).
- **Intraday files** («Промежуточные итоги»): the per-operator table yes; corrections in their preview no — the
  next morning's funnel rewrites the day, and a correction made on intraday numbers would then count twice. The
  funnel and payments previews have them.
- **A double-count hint**: when an import raises an operator's metric on a day that has an active manual
  correction of the same metric (the funnel or the payments brought what was added by hand), the preview says so at
  the row and offers to cancel that correction in the same commit. Never cancelled silently. The hint works on the
  **net** manual count per operator, day and metric (a «+1» already offset by a «−1», as D-53 advised before undo
  existed, is no hint).
- **Past double counts too**: the journal runs the same check over the history — each active «показатели»
  correction against the imports committed after it — and marks the correction («похоже, пришло в выгрузке
  ДД.ММ»), with its «Отменить» right there. Corrections made before this work (three by 19.10) are covered.
- **A rollback never touches the closing**: «Подвести итоги» and «Вернуть игру» alone change `status` and
  `closedAt`. Putting the game back past the closing keeps it closed (D-59: uploads and corrections after the closing
  are allowed and the finale stays live) — a wrong file uploaded on 26.10 after «Подвести итоги» is rolled back
  without reopening the game or replaying the ceremony.
- **The journal's list** is built from the commits' public lines and times (no decryption to open it); the details
  of one action are read and decrypted when it is opened (its commit and the one before). Roster batches and the
  finale show their public line; their details are at the builder's discretion (at least the line).
- **Public commit lines** of the new actions: «отмена корректировок: N», «возврат к версии ДД.ММ ЧЧ:ММ — отменено
  действий: N»; an import with corrections keeps the import's line and adds «, корректировок: N».
- **Where it lives**: «Журнал» — a button on the admin's home; the «Последние загрузки» list there stays.

## Left to the builder

- The GitHub call for the list (commits of `data/` on `main`), paging, and how far back to read; caching the
  decrypted versions within the session.
- How the per-operator numbers are taken (records are per operator-day, `kind: 'daily' | 'snapshot'`, DATA-6 —
  the same counting the engine does), and the layout of the table on the admin's ~900 px column.
- How a rollback is committed (the season's files as they were at the chosen commit's parent, as a new commit on
  the head; `version.json` anew), and refusing a rollback across a new game's launch.
- Tests: pure diffs (an import's per-operator change, a correction in the preview, the double-count hint, revoke,
  rollback's list of undone actions); admin e2e with the fake GitHub (an import with a correction in one commit,
  cancel a correction, a rollback with its warning, the journal of past commits).
- DECISIONS (a new D-61), NAVIGATOR §3, BACKLOG.
