# Stage 2b — an operator's vacation: design

Agreed with the author section by section on 12.10.2026. The real game runs 12.10–25.10.2026 (D-51); an
operator went on vacation — not to be fired, but out of the team's plan for those days. The roster is edited
in batches (D-52, plan 2b-1); corrections came with 2b-2 (D-53).

The author's answers (12.10.2026): out of the **team's plan** (the plan and the pace line), still in the
rating with a mark «в отпуске»; a vacation is **«с — по»**, several per person, changed or removed in the
batch; stored as **a field of its own** on the operator (not as a gap in the memberships).

Requirements: SPEC §8 (ADM-ROSTER, ADM-PREVIEW, ADM-2); DECISIONS R-2 (norms × working days in the team),
R-3 (average headcount), R-5 (firing), D-29 (achievements), D-38 (the rotating rating), D-52 (the roster
batch). Where to look: `docs/NAVIGATOR.md` §1, §3, §11. The engine changes — `.claude/skills/engine-rules`
before any edit there.

## 1. The rules of the game (the engine)

- **Data.** `Manager.vacations: { from, to }[]` — days of the game, both inclusive, `from ≤ to`, default
  `[]` (`src/data/schemas/season.ts`). The config's `schemaVersion` stays 1: a viewer's older code strips
  the unknown field and keeps working; it applies vacations after a reload.
- **An operator's working days** in a team (`workingDaysInTeam`) and in the game (`workingDaysInGame`) leave
  out the days of their vacations. Through them, without other changes:
  - the team's plan (R-2) and average headcount (R-3) — so its target and its pace line (`buildTeamPlans`);
  - the personal plan of the `target` achievement («план недели»).
- **The plan is the whole game's** (as now): a vacation entered at any time — also back-dated — changes the
  team's target for the whole game and so the replay of past days, as a transfer or a firing does.
- **Numbers on vacation days** (should an export bring any) count as usual — for the team of that day (R-1)
  and in the rating. Nothing is dropped.
- **The rating** keeps the operator in place; a row knows whether today is a day of their vacation
  (`LeaderboardRow.onVacation`).
- **Achievements:** a `streak` skips the operator's vacation days — they neither break nor extend it, as
  days off; `team_all_members` does not count an operator on vacation that day as a member, as a fired one
  (R-5). Other rules are unchanged.
- **The cards' «N чел.»** and `membersOn` are unchanged: an operator on vacation is still in the team.

## 2. The screen «Состав и команды»

New edits of the batch (D-52):

```ts
| { kind: 'vacation'; managerId: string; from: string; to: string }
| { kind: 'unvacation'; managerId: string; from: string } // the vacation that starts on `from`
```

- **The operator's row:** a button «Отпуск» → a form «С» / «По» (both default to the admin's day of the
  game, `gameDay`). A vacation is shown in the row: «в отпуске до 18.10» while it runs, «отпуск 20.10–24.10»
  ahead (or past); with buttons «Изменить отпуск» (the same form; yields `unvacation` of the old and
  `vacation` of the new) and «Снять отпуск».
- **Rules (a refusal is a red line, the rest of the batch applies):**
  - a date that is not a day — «<что>: укажите дату»;
  - dates are cut to the game: before the start → the start, after the end → the end; a vacation wholly
    outside the game — refused «отпуск вне игры»;
  - `to` before `from` — «конец отпуска раньше начала»;
  - overlapping another vacation of the person — «пересекается с отпуском 14.10–18.10 — измените его»;
  - starting on or after the firing — «уволен с 09.10»;
  - removing a vacation that is not there — «такого отпуска нет»;
  - a vacation without working days (a weekend) — a warning, not a refusal.
- **Lines:** «Отпуск: Иванов Иван 14.10–18.10 (5 раб. дн.)», «Снять отпуск: Иванов Иван 14.10–18.10».
- **The preview** shows the teams' cells «было → станет» (a smaller plan may move a figure forward).
- **The public message** — counts only, in the roster part: «состав: 1 отпуск», «… 1 снятие отпуска».

## 3. The map

- In the rotating rating (team slides and the top 10) a small «в отпуске» next to the name on the days of
  the vacation — the same HUD in 3D, the 2D scheme and the TV mode.
- Open office screens keep working; they apply vacations after a reload (F5) — the author refreshes the
  office screen once after the deploy.

## 4. Verification and delivery

- **Engine unit tests:** the plan and the headcount without vacation days, the pace line, the personal
  plan, a streak across a vacation, `team_all_members` with a member away, `onVacation` in the rating, a
  record on a vacation day still counted. `npm run test:engine` (≥ 90 %), `npm run test:perf` (< 50 ms).
- **Roster unit tests:** add, change, remove; the cut to the game, outside the game, overlap, after the
  firing, a weekend-only warning, the message.
- **e2e:** a vacation through the batch → one commit of the config; the written config has the vacation
  and the team's target is smaller (its cell does not go down).
- QA-4 and the screenshot tests QA-6 unchanged (the demo has no vacations).
- DECISIONS **D-54**, NAVIGATOR; an independent review; a report in Russian; the push after «да».
