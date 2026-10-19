# Import changes per operator, corrections in the preview — Implementation Plan (2b-3, release 1)

> **For agentic workers:** executed inline in the authoring session (executing-plans with a ledger and TDD); an
> independent review subagent (opus) checks the whole plan at the end (Task 5). Steps use checkbox (`- [ ]`)
> syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md` §3.

**Goal:** the import's preview shows per operator what the file changes («было → по выгрузке → с правкой»), lets
the author add «показатели за день» corrections right there (one commit with the import), and warns of a double
count — an import bringing what a manual correction already added — offering to cancel that correction in the same
commit.

**Architecture:** a pure `src/admin/importDiff.ts` (`importChanges`, `doubleCounts`) compares the season before and
after the file over the file's days, with the net manual counts parsed by the finale's `manualCount` (D-59).
`prepareImport` (`src/admin/importStep.ts`) takes the screen's fixes (`Correction` of kind `metric`, D-53) and
cancels (adjustment ids) and applies them after the file through `applyCorrections` and a new `revokeAdjustments`
(`src/admin/corrections.ts`). The screen `ImportFlow.tsx` re-runs the pure step on every change of fixes or
cancels; a new `ImportChanges.tsx` draws the table, the forms and the hints.

**Tech Stack:** React 19, TypeScript 6 strict, Vitest, Playwright 1.63 (GitHub faked in the browser).

**Spec:** `docs/superpowers/specs/2026-10-19-journal-undo-design.md` (approved 19.10.2026) — release 1 of three;
D-53 (corrections), D-55 (intraday files), D-59 (`manualCount`), SPEC ADM-PREVIEW, ADM-UNDO, SEC-5.

## Global Constraints

- Commit messages are public: counts and dates only — `commitChange` refuses a name (D-51). New suffixes:
  «, корректировок: N», «, отменено корректировок: N».
- A correction's reason keeps the code-written form «<показатель> ±N: <слова автора>» (`applyCorrections` writes
  it) — `manualCount` parses it.
- No corrections in the preview of an intraday file (`profile.kind === 'list'`): the next funnel rewrites that day.
- Nothing is cancelled without the author ticking it.
- «Now» is a parameter in pure code (D-11); timestamps by `localTimestamp`.
- Russian UI text, English comments; `sq-*` classes (D-46); the admin stays a lazy chunk (D-7a).
- No real names in code, tests, docs or commits (demo and builder names only).

## Review Focus

1. **A conflict after fixes were added** (another tab wrote meanwhile): the same fixes and cancels apply to the
   fresh read; a cancel whose correction is gone or already cancelled is a named problem, not a crash or a silent
   skip.
2. **A file over several days** (the catch-up funnel): sums over the days, the day of a fix chosen among the file's
   days, a hint per day — never a hint for a raise on another day than the correction's.
3. **A correction offset by an opposite one** («+1» and «−1» on one day): net 0 — no hint, nothing offered.
4. **An operator new in this file** (added by the resolve step): a row with «было 0», a fix allowed for them.
5. **A fix the engine refuses** (no reason, count 0, a day after today): «Записать» disabled with the message, as
   on the «Корректировки» screen.

---

### Task 1: Cancelled corrections — `revokeAdjustments`, and `manualCount` ignores them

**Где смотреть:** `src/admin/corrections.ts` (`applyCorrections`, ids, `Refused`), `src/finale/results.ts`
(`manualCount`), `src/data/schemas/records.ts` (`revoked`), `src/engine/adjustments.ts`, tests
`tests/unit/admin/corrections.test.ts`, `tests/unit/finale/results.test.ts`.

**Files:** Modify `src/admin/corrections.ts`, `src/finale/results.ts`; Test the two test files above.

**Interfaces:**
- Produces: `revokeAdjustments(input: EngineInput, ids: string[], meta: { by: string; at: string; reason: string }):
  { input: EngineInput; problems: { id: string; message: string }[] }` — each id's adjustment gets
  `revoked: { by, at, reason }`; problems: «корректировки больше нет» (unknown id), «корректировка уже отменена»
  (already revoked); the others still apply. `manualCount` returns null for a revoked adjustment.

- [ ] **Step 1: Failing tests**

`tests/unit/finale/results.test.ts`, in «the department’s result»:

```ts
  it('a cancelled correction is not counted (2b-3)', () => {
    const plus = { ...fix('Оплаты +1: поздняя оплата', 10), revoked: { by: 'k', at: at('2026-10-09'), reason: 'пришла в выгрузке' } };
    expect(manualCount(plus, config)).toBeNull();
  });
```

`tests/unit/admin/corrections.test.ts`:

```ts
describe('revokeAdjustments (2b-3)', () => {
  it('cancels by id with who, when and why; the rest of the file stays', () => {
    const input = { config, records: [], adjustments: [managerPoints('p1', 'a', 10, at('2026-10-08')), managerPoints('p2', 'a', 1, at('2026-10-08'))], imports: [] };
    const { input: after, problems } = revokeAdjustments(input, ['p1'], { by: 'k', at: NOW, reason: 'пришла в выгрузке' });
    expect(problems).toEqual([]);
    expect(after.adjustments[0]?.revoked).toEqual({ by: 'k', at: NOW, reason: 'пришла в выгрузке' });
    expect(after.adjustments[1]).toBe(input.adjustments[1]);
  });
  it('an unknown or already cancelled id is a problem; the others still apply', () => {
    // p1 already revoked, 'zz' unknown, p2 applies
    expect(problems).toEqual([
      { id: 'p1', message: 'корректировка уже отменена' },
      { id: 'zz', message: 'корректировки больше нет' },
    ]);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/finale/results.test.ts tests/unit/admin/corrections.test.ts` — FAIL
  (`revokeAdjustments` not exported; `manualCount` returns a count).
- [ ] **Step 3:** implement both (`manualCount`: `if (adjustment.revoked) return null` first).
- [ ] **Step 4:** the same run — PASS; `npm test` green.
- [ ] **Step 5:** commit `Admin: revokeAdjustments; the finale no longer counts a cancelled correction (2b-3)`.

---

### Task 2: What a file changes per operator — `importChanges`, `doubleCounts`

**Где смотреть:** `src/engine/prepare.ts` (`prepare(input).series` — values per operator-day, snapshots resolved),
`src/engine/adjustments.ts` (`pointsDateOf`), `src/finale/results.ts` (`manualCount`), `src/engine/roster.ts`
(`teamOn`), `tests/support/builders.ts`.

**Files:** Create `src/admin/importDiff.ts`, `tests/unit/admin/importDiff.test.ts`.

**Interfaces:**
- Produces:

```ts
/** One metric of one operator over the file's days (or one day). */
export type MetricChange = {
  metricId: string;
  title: string;
  before: number; // the records before the file
  file: number; // the records after the file
  manual: number; // the net count of active «показатели» corrections (after: the batch's fixes in, cancels out)
};
export type OperatorChange = {
  managerId: string;
  name: string;
  teamId: string; // the team on the file's last day
  metrics: MetricChange[]; // the config's metrics in order, all of them (the screen dims the unchanged)
  days: { date: string; metrics: MetricChange[] }[]; // only days where something differs
};
/** Rows: operators whose records or manual counts differ over `period`; by team order, then name (ru). */
export function importChanges(before: EngineInput, after: EngineInput, period: [string, string]): OperatorChange[];

export type DoubleCount = {
  managerId: string;
  date: string;
  metricId: string;
  raised: number; // file − before, that day (> 0)
  manual: number; // the net manual count that day (> 0)
  adjustmentIds: string[]; // the active positive corrections of that operator, day and metric — to offer
};
/** A day the file raises a metric that active manual corrections had already added (net > 0). */
export function doubleCounts(before: EngineInput, after: EngineInput, period: [string, string]): DoubleCount[];
```

`manual` and `doubleCounts` read `before.adjustments` / `after.adjustments` with `manualCount` (revoked ones are
null since Task 1); the day of a correction is `pointsDateOf`. `doubleCounts` compares the records of `before`
with the records of `after` but the manual counts of `before` (the batch's own fixes are not a double count).

- [ ] **Step 1: Failing tests** (`makeConfig()`: inv6 «Качественные счета» w1, inv20 «Разговоры от 20 минут» w3,
  pay «Оплаты» w10; teams t1, t2):

```ts
it('a row for each operator the file changes: было → по выгрузке, over the file’s days', ...)
  // before: a inv20 2 on 10-06, b inv6 1 on 10-06; after: a inv20 3 on 10-06 and inv20 1 on 10-07, b as before
  // importChanges(before, after, ['2026-10-06', '2026-10-07']) → one row (a);
  // its inv20: { before: 2, file: 4, manual: 0 }; days: 10-06 (2 → 3) and 10-07 (0 → 1)
it('the manual count: active «показатели» corrections of the days, cancelled ones out', ...)
  // after has a fix «Разговоры от 20 минут +1: …» value 3 date 10-06 for a, and a revoked «+1» → manual 1
it('an operator new in the file: было 0', ...)
it('a double count: the file raises a day a manual correction had added', ...)
  // before: a inv6 1 on 10-06 + correction p1 «Качественные счета +1: …» value 1 date 10-06
  // after: a inv6 2 on 10-06 → [{ managerId: 'a', date: '2026-10-06', metricId: 'inv6', raised: 1, manual: 1, adjustmentIds: ['p1'] }]
it('no hint: offset by a «−1», not raised, or raised on another day', ...)
```

- [ ] **Step 2:** `npx vitest run tests/unit/admin/importDiff.test.ts` — FAIL (module missing).
- [ ] **Step 3:** implement `src/admin/importDiff.ts` (values from `prepare(input).series`; the period's days are
  every date in [from, to] present in either series).
- [ ] **Step 4:** the same run — PASS.
- [ ] **Step 5:** commit `Admin: what an import changes per operator, and the double counts it brings (2b-3)`.

---

### Task 3: The import step with fixes and cancels

**Где смотреть:** `src/admin/importStep.ts` (`prepareImport`, `importCommitMessage`), `src/admin/corrections.ts`
(`applyCorrections`, `Correction`), `tests/unit/admin/importStep.test.ts` (the demo and `funnel.xlsx` parsed in
Node by `parseWorkbook`).

**Files:** Modify `src/admin/importStep.ts`; Test `tests/unit/admin/importStep.test.ts`.

**Interfaces:**
- Consumes: `applyCorrections(input, corrections, { now, by })`, `revokeAdjustments` (Task 1), `importChanges`,
  `doubleCounts` (Task 2).
- Produces: `prepareImport(state, file, resolutions, opts, extra?: { fixes: Correction[]; cancels: string[] })`
  returns, besides `state`, `result`, `preview`, `message`: `changes: OperatorChange[]`, `doubles: DoubleCount[]`,
  `problems: { index: number; message: string }[]` (fix problems by the fix's index; cancel problems with index
  −1 and the id in the message), `lines: string[]` (the fixes in words). `result.input` is the season after the
  file, the fixes and the cancels; `preview` and `changes` are computed on it. Cancels get the reason «пришло в
  выгрузке ДД.ММ» (the file's last day) and `at` = `opts.at`. A fix of kind other than `metric`, or any fix for
  a `list` file, is a problem «в промежуточных итогах правок нет — правьте после утренней воронки».
  `importCommitMessage` gains the suffixes (Global Constraints): `…, 49 операторов, корректировок: 1, отменено
  корректировок: 1`.

- [ ] **Step 1: Failing tests** in `tests/unit/admin/importStep.test.ts`:

```ts
it('a fix in the preview goes into the same step: the adjustment, the line, the message (2b-3)', ...)
  // fix { kind: 'metric', managerId: <a demo operator in the file>, date: '2026-10-12', metricId: 'inv6', count: 1, reason: 'нет в воронке' }
  // → result.input.adjustments ends with reason 'Качественные счета +1: нет в воронке', date '2026-10-12';
  //   message ends ', корректировок: 1'; problems []
it('a cancel ticked in the preview revokes the correction in the same step (2b-3)', ...)
  // the demo with a correction committed first (applyCorrections on state.input) → cancels [its id]
  // → revoked.reason 'пришло в выгрузке 12.10'; message ends ', отменено корректировок: 1'
it('a fix without a reason, or any fix in an intraday file, is a problem — nothing else changes', ...)
it('the step’s changes and doubles come from the same before and after', ...)
it('on a fresh read the same fixes and cancels apply; a cancel of a correction gone meanwhile is a problem', ...)
  // prepareImport on state, then on a state whose adjustments lost / revoked the cancelled one →
  // problems [{ index: -1, message: contains the id and 'корректировки больше нет' / 'уже отменена' }]
```

- [ ] **Step 2:** `npx vitest run tests/unit/admin/importStep.test.ts` — FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same run — PASS; `npm test` green.
- [ ] **Step 5:** commit `Admin: the import step takes the preview's fixes and cancels into one commit (2b-3)`.

---

### Task 4: The screen — the table, the fixes, the hints

**Где смотреть:** `src/admin/ImportFlow.tsx` (step, `save`, the conflict path), `src/admin/PreviewTable.tsx`,
`src/admin/CorrectionForms.tsx` (the «Показатели» form: fields and their labels), `src/admin/FormParts.tsx`,
`tests/e2e/admin.spec.ts` (`login`, `importFunnel`, `resolveAndPreview`, `changed`), NAVIGATOR §3.

**Files:** Create `src/admin/ImportChanges.tsx`; Modify `src/admin/ImportFlow.tsx`, `src/admin/PreviewTable.tsx`
(if the summary moves); Test `tests/e2e/admin.spec.ts`.

**Interfaces:**
- Consumes: `prepareImport(…, { fixes, cancels })` and its `changes`, `doubles`, `problems`, `lines` (Task 3).
- Produces (screen): `ImportFlow` holds `fixes: Correction[]` and `cancels: string[]` and the step's base
  (`state`, `at`); every change re-runs `prepareImport` on that same base (pure) — «Записать» writes exactly what
  is shown; a new file, a new day, period or resolution clears fixes and cancels. On `ConflictError` the fixes and
  cancels are applied to the fresh read.

The table «Что меняет файл» (`data-testid="import-changes"`, `aria-label="Что меняет файл"`): a row per operator
(name, the team's label), per metric «было → по выгрузке» and, when a manual count exists, «→ с правкой N»;
unchanged metrics dimmed; «по дням» opens the row's days. A row's «Поправить» (not for `list` files) opens the
fields of the «Показатели» form for that operator: metric (the game's metrics), «Сколько» (±N), «День» (the
file's days, the last by default), «Причина»; «Добавить» puts the fix into the batch, listed under the table with
«Убрать». A hint at the row: «Похоже, это уже было добавлено вручную: <reason> (ДД.ММ)» and a checkbox «Отменить
эту корректировку в этой записи». A problem blocks «Записать» and is shown at its fix (`role="alert"`).

- [ ] **Step 1: Failing e2e** in `tests/e2e/admin.spec.ts`:

```ts
test('the funnel’s preview shows what it changes per operator; a fix there is one commit with the import (2b-3)', ...)
  // login → importFunnel → resolveAndPreview → the table «Что меняет файл» has rows;
  // «Поправить» at the first row → «Качественные счета», «Сколько» 1, «Причина» «нет в воронке» → «Добавить»
  // → its row reads «с правкой» → «Записать» → «Опубликовано»;
  // fake.last.message ends ', корректировок: 1'; changed(fake, 0, 1) has imports, records, adjustments, version;
  // the new adjustment's reason 'Качественные счета +1: нет в воронке'
test('a correction the funnel now brings: the hint, the tick, the correction cancelled in the same commit (2b-3)', ...)
  // in Node: parse funnel.xlsx (parseWorkbook), importChanges/doubleCounts candidates — an operator and a day the
  // file raises a metric of; commitDemo a «показатели» correction +1 of that metric, day and operator first;
  // the preview shows the hint; tick → «Записать» → the adjustment has revoked.reason 'пришло в выгрузке 12.10';
  // message ends ', отменено корректировок: 1'
test('an intraday file: the table, no «Поправить» (2b-3)', ...)
```

- [ ] **Step 2:** `npx playwright test admin --project=e2e -g "2b-3"` — FAIL (no table).
- [ ] **Step 3:** implement `ImportChanges.tsx` and wire `ImportFlow.tsx`.
- [ ] **Step 4:** the same run — PASS; the whole `admin.spec.ts`; `npm run typecheck && npm run lint && npm test`;
  `npm run build && npm run size`.
- [ ] **Step 5:** a look at 1280 px (a scratch screenshot of the table with a fix and a hint; demo names only).
- [ ] **Step 6:** commit `Admin: the import preview shows what the file changes per operator, takes fixes and cancels (2b-3)`.

---

### Task 5: Docs and review

- [ ] DECISIONS D-61 (release 1: the table, fixes in the preview, the double-count hint, cancelled corrections out
  of the finale's totals); NAVIGATOR §3 (`importDiff.ts`, `ImportChanges.tsx`, `revokeAdjustments`, the e2e); BACKLOG
  («Сделано», the `manualCount` minor of D-59 closed); CLAUDE.md stage line.
- [ ] Commit `Docs: import changes per operator and corrections in the preview (D-61)`.
- [ ] Independent review (opus) of the plan's range; Critical/Important fixed RED→GREEN; minors to BACKLOG.
