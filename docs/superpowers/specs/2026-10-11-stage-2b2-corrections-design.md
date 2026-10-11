# Stage 2b-2 — corrections while the game runs: design

Agreed with the author section by section on 11.10.2026. The real game runs 12.10–25.10.2026 (D-51); the
roster and the teams are edited in batches since 2b-1 (D-52). This part gives the coordinator the
corrections the spec requires for stage 2 (SPEC §18: «корректировки шагов/сброс»). The author's practice:
**bonuses and penalties in steps to a team** and **an operator's numbers for a day**; a team back to the
start is rare.

Requirements: SPEC §8 (ADM-STEPS, ADM-RESET-TEAM, ADM-PREVIEW, ADM-1, ADM-2), FR-STEP-3, FR-STEP-5;
`docs/DECISIONS.md` D-17 (`team_reset`), D-25 (`manager_points` for a day), R-1, D-51, D-52;
`docs/BACKLOG.md` «Этап 2» («долг» отрицательных шагов). Where to look: `docs/NAVIGATOR.md` §1, §3. The
engine and the data format do not change: `team_steps`, `team_reset`, `manager_points` exist since stage 1
(`src/data/schemas/records.ts`, `src/engine/progress.ts`, `src/engine/adjustments.ts`).

## 1. The screen «Корректировки»

A button «Корректировки» on the admin's start screen. Three forms; corrections gather in a batch
«Несохранённые корректировки (N)» — lines with «×», «Показать превью» (the teams' cells and the top 10
«было → станет»), «Записать» — exactly as the roster of 2b-1, but a batch of its own (the roster and the
corrections are rarely needed together).

- **«Шаги команде»**: the team, the steps (+N or −N, an integer, not 0), the reason (required). The form
  shows what will happen: «СР5: клетка 12 → 14».
- **«Показатели оператора за день»**: the operator (a list grouped by team), the day (of the game, not
  after today; yesterday by default, clamped to the game), the metric (one of the season's), the count
  (+N or −N, an integer, not 0), the reason (required). The form shows the points: «+1 оплата = +10
  баллов» and warns: «если эта оплата потом придёт в выгрузке, она посчитается дважды — тогда правку
  нужно будет убрать».
- **«Вернуть команду на старт»** — under «Редкое»: the team, the reason, a checkbox «Понимаю: фигурка
  встанет на старт; отменить можно будет только после части 2б-3».

## 2. Rules

Corrections are values, the batch a list (as D-52): `applyCorrections(input, corrections, now)` appends
adjustments to the season in order and names each one that does not apply; after «данные изменились» the
same list is applied to the fresh season and every derived value is computed again.

```ts
type Correction =
  | { kind: 'steps'; teamId: string; steps: number; reason: string }
  | { kind: 'metric'; managerId: string; date: string; metricId: string; count: number; reason: string }
  | { kind: 'reset'; teamId: string; reason: string };
```

- **The reason** is required for every kind (ADM-STEPS); trimmed, not empty.
- **Steps — no debt** (the author, 11.10.2026): the figure never goes below the start nor past the end of
  the overflow zone. The written `team_steps.value` is what really moves the figure: with the position
  `p` now (the batch's earlier corrections applied) and the end `max`, `value = clamp(p + N, 0, max) − p`.
  The line says it: «СР5: −10 шагов → запишется −5, ниже старта нельзя». A value of 0 (a penalty at the
  start, a bonus at the end) is a problem: «команда уже на старте — штрафовать нечего» / «команда уже в
  конце трека». Steps count from the moment they are written (the engine's `activeAdjustments`).
- **An operator's numbers for a day** are written as points (the author's choice A, 11.10.2026):
  `manager_points { managerId, date, value: count × weight(metric) }` with the reason
  «+1 оплата: <reason>» (the count and the metric in words, for the journal of 2b-3). They count for the
  day they are for (D-25) — for the team of that day (R-1) and in the operator's rating. The day is of the
  game and not after today; any operator of the roster, a fired one too (a late payment). The metric
  counters of the operator do not change — only points; a later change of weights (2b-3) does not
  rescale them.
- **Back to the start**: `team_reset { teamId, value }` with the team's computed position now
  (`computedPosition`, before the track's limits — D-17); from then on the figure is at 0 and moves on
  with new data.
- **Timestamps** through `localTimestamp` (D-11); ids `adj-<YYYYMMDDHHmm>-<n>`, unique in the file.
- **The public message**: counts only — `корректировки: 2 — шаги, 1 — показатели, 1 — старт` (zero
  counts left out); the name guard of `commitChange` stays.
- **Commit**: only `adjustments` changes (the import log untouched, the check of a stale change holds),
  every file passes the viewers' check before sealing (2a).
- **Undo** — in 2b-3. Until then steps and numbers are fixed by a reverse correction; a reset cannot be
  reversed — hence the checkbox.

## 3. Verification and delivery

- **Unit** (`tests/unit/admin/corrections.test.ts`): each kind and the required reason; no debt at the
  bottom and at the top, «штрафовать нечего»; a metric turned into points by its weight, the day of the
  game and not in the future, a fired operator allowed; a reset by the computed position; a batch applied
  again to a changed season; the message — counts only.
- **e2e** (`tests/e2e/admin.spec.ts`, the fake GitHub): one batch — a bonus to a team and +1 payment to
  an operator for yesterday — is one commit that changes only `adjustments`; the written season moves the
  team and adds the points on that day; «данные изменились» re-applies the batch.
- Screenshots for the author; an independent review; a report in Russian; the push after «да». The
  engine and the format of the data do not change: open screens of the office read the new data as they
  are.
