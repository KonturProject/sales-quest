# Stage 2b-1 — the roster and the teams while the game runs: design

Agreed with the author section by section on 11.10.2026. The real game runs 12.10–25.10.2026 (D-51); the
author's goal for stage 2b: **run the game without the developer** — staff changes, team details,
corrections, the journal. The author's order: the roster and the teams first; every part is shipped on
its own (tests, an independent review, a push after the author's «да»).

Requirements: SPEC §8 (ADM-ROSTER, ADM-PREVIEW, ADM-2, ADM-3); `docs/DECISIONS.md` ADM-ROSTER-1…6, R-1,
R-2, R-5, OQ-11, D-21, D-41, D-51; `docs/BACKLOG.md` «Этап 2» (the deferred items of the review of 2a).
Where to look: `docs/NAVIGATOR.md` §3. The write path is the one of plan 2a: `src/admin/pipeline.ts`.

## Sub-plans of 2b

- **2b-1 — «Состав и команды»** (this design): operators added, renamed, transferred, fired and returned,
  their norms; the teams' leader, colour, hero and order; edits written as one batch.
- **2b-2 — corrections**: extra steps ±N with a reason (ADM-STEPS), a figure back to the start
  (ADM-RESET-TEAM, D-17), points of an operator for a day (D-25).
- **2b-3 — the journal and undo**: the log of imports, corrections and roster batches with filters
  (ADM-LOG), undo of a correction and a return to an earlier version from the history (ADM-UNDO),
  the weights with a preview (ADM-WEIGHTS), a change of the access phrase (SEC-8).
- **Not in 2b**: granting and editing achievements — stage 4 (they are not shown yet); new seasons,
  archive, export — stage 5.

## 1. The screen «Состав и команды»

A button «Состав и команды» on the admin's start screen opens it (the lazy admin chunk, D-7a).

- **The teams in their order.** Each: a crest of the team's colour, «СР6 • Вера Соколова» (the plate
  of the map), the hero, the number of people today; «Изменить команду» (leader, colour, hero) and
  «↑ / ↓» (the order of the cards).
- **A team opens to its operators.** Each: full name, norms («3 / 1,5 / 0,2» in the order of the
  metrics), since when in the team; «Изменить» and «Уволить».
- **The operator's form** (ADM-ROSTER-2): the full name (a change sends the old one to the aliases, so
  imports still know the person), the team (a change asks for the transfer date, today by default), the
  norms per metric of the season (fields built from `metrics`, fractions allowed, ≥ 0).
- **«Уволить»** (ADM-ROSTER-3): a date (today by default) and an optional reason.
- **At the bottom**: «Добавить оператора» (name, team, since when, norms — the game's
  `defaultDailyNorms` prefilled) and the list «Уволенные» with «Вернуть».
- **«Несохранённые изменения (N)»**: one line per edit with «×»; «Показать превью»; «Записать» →
  «Публикуется…» → «Опубликовано» (the banner of plan 2a). The batch lives while the tab is open.

## 2. Edits as data

An edit is a value, the batch is a list; `applyRosterEdits` (pure, `src/admin/roster.ts`) applies the
list to a season config in order. The same list is applied again to fresh data after a conflict
(ADM-2), so nothing the admin did is lost.

```ts
type RosterEdit =
  | { kind: 'add'; ref: string; name: string; teamId: string; from: string; norms: Record<string, number> }
  | { kind: 'rename'; managerId: string; name: string }
  | { kind: 'transfer'; managerId: string; teamId: string; from: string }
  | { kind: 'norms'; managerId: string; norms: Record<string, number> }
  | { kind: 'fire'; managerId: string; date: string; reason?: string }
  | { kind: 'unfire'; managerId: string }
  | { kind: 'team'; teamId: string; leaderName?: string; color?: string; characterId?: string }
  | { kind: 'order'; teamIds: string[] };

applyRosterEdits(config, edits): {
  config: SeasonConfig;          // validated by SeasonConfigSchema
  problems: { index: number; message: string }[];  // edits that did not apply, in words
  warnings: string[];            // allowed, but worth a look
};
```

An edit that does not apply is skipped and named in `problems`; the others still apply. A new person
of the batch is named by its `ref` (`new-1`…, never reused) until the batch is written: edits of that
person use the ref, and removing the «Новый» line removes them too — they never move to another operator
when the ids of new people shift. The operator's
form yields one edit per changed field (rename, transfer, norms) — each a line of its own.

**Rules** (the dates of the game are its period; «today» is the admin's local date):
- **Dates** — any day of the game, retroactive or ahead. A date after the end is refused; for `add` and
  `transfer` a date before the start means the start.
- **Transfer from X**: the membership covering X closes on X − 1 and `{teamId, from: X}` follows;
  memberships after X are dropped (the new team from X on). A transfer on the first day of a membership
  replaces its team. To the same team — a problem «уже в этой команде». Earned points stay with the old
  team (R-1); plans follow the days in each team (R-2) — the preview shows who moves.
- **Fire on X**: `firedAt = X`, `firedReason`. On X the operator still counts in the team; from X off
  the leaderboard (R-5); records and achievements stay. Already fired, or X before the first
  membership — a problem. **Return**: `firedAt` and `firedReason` removed; not fired — a problem.
- **Add**: the next id `opNNN` (one helper with the import's), the name cleaned (single spaces, NFC),
  no aliases, the norms of the form, `[{ teamId, from }]`.
- **Rename**: the new name cleaned; the old one joins the aliases (unless there already); the new name
  leaves the aliases if it was one.
- **Names are unique**: a name (normalised: case, spaces, ё/е, NFC) of another operator or of one of
  their aliases — a problem «такой оператор уже есть: Иванова Мария (СР3)».
- **Norms**: every metric of the season, numbers ≥ 0, fractions allowed.
- **Team**: the leader not empty; a colour `#RRGGBB`; a hero of the ten variants (`VARIANTS`, D-41).
  **Order**: a permutation of the team ids → `order` 1…n.
- **Warnings**: a team colour close to another team's (a perceptual RGB distance under a threshold that
  flags two yellows or two greens of the launch and none of the demo's six colours) — «цвет СР9 похож на
  СР1»; all norms of an operator 0 — «у … нормативы нулевые: команде он цели не добавит».

## 3. Preview, commit, conflict

- **Preview** (ADM-PREVIEW): the teams' positions «было → станет» and the top 10 (`previewChange`), the
  people of each team today «было → станет», the lines of the batch, the warnings.
- **Commit**: `commitChange` of plan 2a on the state the preview was made of; only `config` changes
  (the import log is untouched, the check of a stale change holds), every file passes the viewers' own
  check before sealing. **The message is public — counts only**: `состав: 1 новый, 1 перевод,
  1 увольнение, 1 возврат, 2 переименования, 1 нормативы; команды: 2 изменены, порядок` (zero counts left
  out); the name guard of `commitChange` stays.
- **Conflict** («данные изменились»): the state is read again, the same list applied to it; lines that no
  longer apply turn red with the reason; a new preview. The admin removes red lines and writes the rest.
- **Undo**: until the journal (2b-3), a mistake is fixed by the reverse edit («Вернуть», a transfer back).

## 4. The admin's errors (the review of 2a, deferred items)

- **GitHub**: a 422 is a conflict only when the answer says the update is not a fast forward; another
  422 — «GitHub отказал: <its message>». A 403 with `x-ratelimit-remaining: 0` — «GitHub просит
  подождать: лимит запросов, попробуйте через минуту», not «нет прав». A 404 on the repository at the
  login — «у ключа нет доступа к репозиторию sales-quest: в настройках ключа выберите его в Repository
  access». A network failure of `fetch` — its own error «нет связи с GitHub…»; any other `TypeError` is
  a bug and is shown as it is.
- **The screens**: the error banner clears on the next action; «Назад» is disabled while a commit runs.
- **The funnel's missing block**: «…— формат выгрузки изменился, сообщите разработчику» instead of a
  pointer to a settings screen that does not exist.

## 5. Verification and delivery

- **Unit** (`tests/unit/admin/roster.test.ts`): every edit kind with its dates; problems and warnings
  in words; a batch applied again to a changed config (a transfer whose operator was fired meanwhile
  turns into a problem, the rest applies); the commit message — counts only, never a name; the error
  mapping of `HttpGitHubRepo`.
- **e2e** (`tests/e2e/admin.spec.ts`, the fake GitHub of plan 2a): one batch — a firing, a transfer, a
  new operator and a team colour — gives one commit with a message of counts; the viewer
  (`#/debug`) shows the people per team changed and the fired operator off the leaderboard; «данные
  изменились» between the preview and «Записать» re-applies the batch.
- **Screenshots** of the screen for the author before the push.
- **An independent review**, fixes, a short report in Russian; the push only after the author's «да».
  The game's data change only when the author presses «Записать».
- **Constraints**: no real names or exports in tests (the demo and the synthetic fixtures); commit
  messages and the game title are public — counts only (D-51).
