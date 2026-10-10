# Stage 2a — launching the real game: design

Agreed with the author section by section on 10.10.2026. The author's goal for stage 2: **run the real
game of the department as soon as possible** — so stage 2 is built around the way «the author's export →
figures move on the site of the whole department»; the rest follows while the game runs.

Requirements: SPEC §8 (admin), §9 (import), §13.5–13.7 (writing, privacy, sync), §17 QA-2 / QA-3, §18
stage 2 (acceptance: QA-2 and QA-3 pass, a repeated import does not move the figures);
`docs/DECISIONS.md` D-7a, D-12, D-13, D-19…D-22, D-24, D-31…D-36, ADM-ROSTER-1…6;
`docs/IMPORT_FORMATS.md` (the two real exports); `docs/OPEN_QUESTIONS.md` OQ-12, OQ-13, OQ-14;
`docs/BACKLOG.md` «Этап 2». Where to look per topic: `docs/NAVIGATOR.md` §2, §3.

## Sub-plans

- **2a — the launch** (this design): admin access and the write path, the import of the two real
  exports with operator matching, the «Новая игра» wizard with the secret phrase, the demo moved out of
  the published data, the launch checklist.
- **2b — while the game runs**: the «Состав» screen (ADM-ROSTER-1…6), extra steps and a reset of a
  figure (ADM-STEPS, ADM-RESET-TEAM), a points correction for a day (D-25), weights with a preview
  (ADM-WEIGHTS), the journal with filters (ADM-LOG), undo of an adjustment (ADM-UNDO), a change of the
  phrase (SEC-8).
- **Deferred** (BACKLOG): the generic column-mapping wizard for unknown files (DATA-4) and the
  `daily` / `mtd_snapshot` forms (DATA-3) — both real exports are known (OQ-1 closed), two ready parsers
  serve them; new seasons by cloning, archive, template XLSX and export — stage 5; the achievements
  editor, grant and revoke — stage 4.

## 1. Admin access and the write path

- **Route `#/admin`**, a lazy chunk (D-7a): the admin UI, SheetJS and the GitHub client never reach the
  initial JS — `npm run size` does not grow.
- **The token** (SEC-1…3): a fine-grained personal access token of GitHub — this repository only,
  «Contents: read and write» (with «Metadata: read»). The login screen gives step-by-step instructions
  and a link to GitHub's token page. Checked on entry: the repository answers with push rights, `/user`
  gives the login for commit messages. Kept in this browser's `localStorage` (in try/catch), sent only to
  `api.github.com`, never in the repository or logs; «Выйти» removes it; a warning 14 days before the
  expiry from the header `github-authentication-token-expiration`.
- **The phrase**: the admin needs the access phrase to read and write the season (the secret one for the
  real game, §3); the same storage as viewers (`src/app/access.ts`).
- **Reading**: straight from the GitHub API at the head of `main` — not from Pages, which lags 1–2 min.
- **One path for every action** (§8: preview → confirm → one commit → journal):
  1. read the season at the head commit of `main`;
  2. the action is a pure function: (engine input, its arguments) → new engine input, a summary for the
     journal and the commit message;
  3. the preview: `computeGameState` before and after — the teams' positions «было → станет» and the
     top 10 operators;
  4. «Подтвердить»;
  5. `sealSeason` with the season's salt, unchanged files reused byte for byte (viewers fetch only what
     changed; an input equal to the current one → «нечего записывать», no commit);
  6. one commit through the Git Data API (blobs → tree → commit → move `main`, never forced) on the base
     commit read in step 1; if `main` moved (another admin) — read again, apply the action again, show
     the new preview (ADM-2, SEC-4);
  7. the result is shown at once; the banner «Публикуется… ~2 мин» goes out when the site's
     `version.json` has the new revision (SYNC-4).
- **Commit messages are public** (the repository is public): `data(<season>): <action> — <counts>
  [by <login>]`, never names or sales figures. Names live only in the encrypted files.
- **CI** checks the published data after every commit (`check:data`, D-34) — the git hook does not see
  commits made through the API — and rebuilds the site.
- **Units**: `GitHubRepo` (read a file at a commit, the head commit, commit several files) with an
  in-memory fake for tests; `AdminAction` (pure); the pipeline (read → apply → preview → seal → commit →
  retry on a moved `main`).

## 2. Import of the exports

- **Two ready kinds of file**, recognised by their sheets and headers; each supplies only its metrics
  (D-20). Their names live in the season config (`importProfiles`, which replaces today's
  `z.unknown()`), so a renamed block or sheet is fixed in the settings, not in code (OQ-13):
  - **funnel** (the matrix of D-19): the sheet «ВОРОНКА Первичная кампания» only (SheetJS reads just
    it — the other sheet declares a million rows); block names in row 4, sub-block names in row 5, dates in
    row 6 (week-total columns skipped), data from row 9; the group flag in B, the employee flag in C, the
    name in G, an employee belongs to the nearest group above; `inv6` ← «Качественные счета» /
    «Качественные счета, шт.», `inv20` ← «Разговоры от 20 минут» / «Разговоры от 20 минут, шт.»; the
    group code — `СР\d+` in the group's name;
  - **payments** (events): headers in row 1, «Дата оплаты», «Автор», «Группа», «№ счета», «Тип
    головного продукта»; «Академия» not counted; one invoice number = one payment, the date and the
    author from its first line; `pay` = unique invoices per author and day. Clients, INN, sums,
    products and invoice numbers are never stored.
- **Parsing in a Web Worker** in the admin's browser (the 16 MB funnel must not freeze the page);
  dates as Excel serial numbers or as text.
- **Self-check of the funnel**: per day, the sum over a group's employees against the group's row, and
  the sum over groups against «Общий итог» (row 7) → a warning on any mismatch (a format surprise does
  not pass silently).
- **Operator matching** (DATA-9, DATA-10): trim, single spaces, `ё → е`, case; the full name and the
  aliases. The unknown ones go to a resolution screen: «это существующий оператор» (adds an alias),
  «новый оператор в команде X» (the team suggested by the group code through `teams[].sourceCode`; in
  the team from the first date of the file or the game's start; the default norms), «игнорировать всегда»
  (`config.importIgnore`, normalised names). Remembered — not asked twice. A new operator gets the
  season's `defaultDailyNorms` (§3). An operator listed in another
  group than in the roster → a warning «возможно, перевод».
- **Records**: upsert by (operator, day, metric) — only the file's metrics change (D-20). The file is
  complete for its period (OQ-12): the funnel — its date columns; payments — from the first to the last
  payment date (editable in the import screen); the operators of the groups present in the file get 0 on
  days of that period without values, so a cancelled payment disappears with the next export. Days
  outside the game are dropped with a warning (DATA-7).
- **The import log** (DATA-8): file name, SHA-256 of the file's bytes, kind, period, rows, matched and
  unmatched operators, warnings, who, when; a hash seen before → «этот файл уже загружался» (allowed).
  A repeated import adds only its log entry: the records come out the same, so the records file is
  reused byte for byte and no figure moves (§18 stage 2). The file itself never leaves the browser.
- **The preview**: period, operators matched / unknown, warnings, teams «было → станет», top 10.
- **SheetJS**: from `cdn.sheetjs.com` (§13.2: the npm registry's copy is outdated), Apache-2.0 —
  installing it is a download: the author's «да» first (D-3).

## 3. The «Новая игра» wizard, the secret phrase, the launch

- **The wizard** (one screen per step):
  1. dates — by default two weeks from the next Monday; holidays; the track from the working days (D-24,
     3 cells a day);
  2. the latest funnel → the groups `СР<n>` become the teams (six); operators with activity are ticked,
     the rest — a list «проверьте» (left people, not operators: they would inflate the plan — BACKLOG);
  3. each team: the leader's name for the figure, the colour, the hero (10 variants), the order; the
     group code is kept as `sourceCode` (OQ-14 is answered here by the author);
  4. daily norms per metric — one set for everyone: written to each operator's `dailyNorms` and kept as
     the season's `defaultDailyNorms` (a new optional config field) for operators added later by the
     import; personal norms come with «Состав» in 2b;
  5. weights 1 / 3 / 10, the 21 starting achievements (D-27), the locations ruins → ice → volcano → heaven
     — as in the demo, editable;
  6. **the secret phrase**: a random one (several words and digits) or the author's own; the demo phrase
     is refused (it is public, D-32); the viewers' link and the TV link (`&mode=tv`) shown ready to copy;
     «Сохраните фразу: без неё данные не прочитать — восстановить её нельзя»;
  7. preview → «Создать игру» → one commit: the season's files encrypted with the secret phrase,
     `version.json` and `seasons/index.json` pointing at it, the demo files removed from `data/`.
  Then the ordinary import of the funnel and the payments.
- **Season id**: the start date, `YYYY-MM-DD`.
- **The demo leaves the published site but stays for development**: before the wizard's first commit
  the demo moves to `tests/fixtures/demo-data/` (`seed-demo` writes there); `dataPlugin` takes the
  directory — the deploy build uses `data/`, the dev server and the e2e build use the demo directory;
  CI's e2e job builds with the demo, the deploy job with `data/`; `check:data` checks both. All tests,
  screenshots and QA-4 keep running on the fictional people. The old demo link answers «Код не подходит».
  Neither the real data nor the phrase are ever on the developer's side.
- **The launch checklist** (on the admin's start screen): create the token → «Новая игра» → import the
  funnel and the payments → open the site with the new link and check → send the link to the department,
  open the TV link on the wall screen.

## 4. Verification and safety

- **QA-2**: a script generates synthetic exports of both forms with fictional people into
  `tests/fixtures/import/` (allowed by the hook): blocks, dates and week totals, groups and employees,
  totals rows; invoices of several lines, «Академия», the final «Сумма заказа» row; «ё», extra spaces,
  dates as text and as numbers, empty rows. Unit tests: parsing and daily sums, the self-check, matching,
  upsert of only the file's metrics, the complete-period rule, a repeated import changes nothing.
- **QA-3**: Playwright with a fake GitHub (requests to `api.github.com` intercepted): login → import a
  fixture → preview → commit → the viewer's page shows the figures moving.
- **The real September exports** (the author's «да», 10.10.2026): the parsers run against them on the
  author's PC, checked by the self-check totals; nothing from them enters the repository, the tests or
  the logs; subagents never open them.
- **Safety**: the token goes only to `api.github.com`; the phrase never reaches the repository or logs;
  commit messages carry counts only; raw exports are stopped by the hook and `.gitignore`; the admin code
  is a lazy chunk (the initial JS unchanged).
- **Process**: plan 2a → code in the session → independent review → fixes → the author's check → the
  launch → 2b.
