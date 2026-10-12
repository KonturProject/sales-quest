# Stage 2b — an operator's vacation: Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process; the author
> chose inline execution for stage 2), an independent review subagent checks the whole plan at the end
> (Task 5). Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and
> `docs/NAVIGATOR.md`; before any edit of `src/engine` — the skill `.claude/skills/engine-rules`.

**Goal:** an operator on vacation stays in the team and in the rating (marked «в отпуске»), but the days
of the vacation leave the team's plan, its pace line and the operator's personal plan; the coordinator
sets, changes and removes a vacation «с — по» in the roster batch.

**Architecture:** a new optional field `Manager.vacations` (days inclusive). The engine leaves vacation
days out of an operator's working days (`workingDaysInTeam`, `workingDaysInGame`) — the plan, the
headcount, the pace line and the personal plan follow without other changes; two achievement rules skip
those days; a leaderboard row knows `onVacation`. The roster batch (D-52) gets two edits, `vacation` and
`unvacation`; the screen a form and the vacations in the operator's row; the HUD rating a mark.

**Tech stack:** React 19, TypeScript 6 strict, zod 4, Vitest, Playwright 1.63; the engine, the roster batch
and the fake GitHub of stages 1–2b as they are.

**Spec:** `docs/superpowers/specs/2026-10-12-vacations-design.md` (approved 12.10.2026); SPEC §8
(ADM-ROSTER, ADM-PREVIEW); DECISIONS R-1, R-2, R-3, R-5, D-29, D-38, D-52.

**Refinements of the spec made here:**
- The refusal after the firing reads «<ФИО>: увольнение с 09.10 — отпуск после него не нужен» (the roster's
  wording for a transfer after the firing; «уволен» would need a gender).
- The weekend-only warning reads «<ФИО>: в отпуске 10.10–11.10 нет рабочих дней — на план это не влияет».
- The field is optional (as `firedAt`), not defaulted: managers without vacations keep their bytes.

## Global Constraints

- Engine invariants (`.claude/skills/engine-rules`): pure, no clock, deterministic; no magic numbers;
  plans built once per game (`buildTeamPlans`); `npm run test:engine` keeps `src/engine` ≥ 90 %;
  `npm run test:perf` < 50 ms.
- The config's `schemaVersion` stays 1; the field is optional; a viewer's older code must keep working
  on a config with vacations (zod objects strip unknown keys — never `.strict()`).
- Public commit messages — counts only: «состав: 1 отпуск», «1 снятие отпуска» (D-51).
- No real names, exports or the real phrase in tests or the repository; tests use the demo and builders.
- The admin chunk stays lazy (D-7a); the initial JS grows by the HUD's few lines only (`npm run size`).
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved, the
  push only after the author's «да» (D-3).

## Review Focus

1. **A vacation over a weekend or across a transfer** — only the working days of each team are taken off
   its plan — Task 1 tests «a weekend inside costs nothing» and «a vacation across a transfer».
2. **«Изменить отпуск» = «Снять» + a new one; the «Снять» line removed alone** — the new one is a red
   overlap, never two vacations of one person — Task 3 test «… removing only «Снять» leaves a red overlap».
3. **A vacation of a «Новый» of the same batch** — applies to the new person and goes with its «Новый» —
   Task 3 test «a vacation of a new operator of the same batch».
4. **Numbers that arrive for a vacation day** — counted for the team and the operator, nothing dropped —
   Task 1 test «numbers of a vacation day still count».
5. **An office screen with the old code reading a config with vacations** — keeps working: the schema
   stays non-strict — Task 1 test «an unknown field of an operator is ignored, not refused».

---

### Task 1: The data and the plan — vacation days out of the working days

**Где смотреть:** спецификация §1; скилл `.claude/skills/engine-rules`; DECISIONS R-2, R-3, D-24, D-26;
код `src/data/schemas/season.ts` (`ManagerSchema`), `src/engine/roster.ts` (`workingDaysInTeam`,
`workingDaysInGame`), `src/engine/targets.ts`, `src/engine/plans.ts` (`buildTeamPlans`, `paceAfter`),
`src/engine/leaderboard.ts` (`LeaderboardRow`); тесты `tests/unit/engine/targets.test.ts`,
`tests/unit/engine/roster.test.ts`; навигатор §1.

**Files:**
- Modify: `src/data/schemas/season.ts`, `src/engine/roster.ts`, `src/engine/leaderboard.ts`
- Test: `tests/unit/engine/vacations.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  // src/data/schemas/season.ts
  export const VacationSchema; // { from: IsoDate; to: IsoDate }, from ≤ to («конец отпуска раньше начала»)
  export type Vacation = z.output<typeof VacationSchema>;
  // ManagerSchema: vacations?: Vacation[]
  // src/engine/roster.ts
  export function isOnVacation(manager: Manager, date: string): boolean;
  // src/engine/leaderboard.ts — LeaderboardRow gains
  onVacation: boolean; // today is a day of one of the operator's vacations
  ```

- [ ] **Step 1: Failing tests** — `tests/unit/engine/vacations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SeasonConfigSchema } from '../../../src/data/schemas/season.ts';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { buildTeamPlans } from '../../../src/engine/plans.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import {
  isOnVacation,
  workingDaysInGame,
  workingDaysInTeam,
} from '../../../src/engine/roster.ts';
import { weightsOf } from '../../../src/engine/scoring.ts';
import { averageHeadcount, teamTargetPoints } from '../../../src/engine/targets.ts';
import { buildTrack } from '../../../src/engine/track.ts';
import { at, daily, makeConfig, manager } from '../../support/builders.ts';

// A two-week game Mon 05.10 … Sun 18.10: 10 working days, 2 cells a day, 7.5 points a day by default.
// «a» is away Fri 09.10 … Tue 13.10: 3 working days (the weekend inside costs nothing).
const away = manager('a', 't1', { vacations: [{ from: '2026-10-09', to: '2026-10-13' }] });
const config = makeConfig({ managers: [away, manager('b', 't1'), manager('c', 't2')] });
const calendar = buildCalendar(config);
const input = (records: EngineInput['records']): EngineInput => ({
  config,
  records,
  adjustments: [],
  imports: [],
});

describe('vacations in the roster (D-54)', () => {
  it('a day of a vacation, both ends included', () => {
    expect(
      ['2026-10-08', '2026-10-09', '2026-10-13', '2026-10-14'].map((d) => isOnVacation(away, d)),
    ).toEqual([false, true, true, false]);
    expect(isOnVacation(manager('b', 't1'), '2026-10-09')).toBe(false);
  });

  it('the working days in the team and in the game leave the vacation out; a weekend inside costs nothing', () => {
    expect(workingDaysInTeam(away, 't1', calendar)).toHaveLength(7);
    expect(workingDaysInTeam(away, 't1', calendar)).not.toContain('2026-10-12');
    expect(workingDaysInGame(away, calendar)).toHaveLength(7);
  });

  it('the schema: from ≤ to; without vacations the field stays absent', () => {
    const reversed = makeConfig({
      managers: [manager('x', 't1', { vacations: [{ from: '2026-10-09', to: '2026-10-08' }] })],
    });
    expect(() => SeasonConfigSchema.parse(reversed)).toThrow(/конец отпуска раньше начала/);
    const plain = SeasonConfigSchema.parse(makeConfig({ managers: [manager('x', 't1')] }));
    expect(plain.managers[0]).not.toHaveProperty('vacations');
  });

  it('an unknown field of an operator is ignored, not refused — older viewers read newer configs', () => {
    const newer = makeConfig({ managers: [{ ...manager('x', 't1'), somethingNew: 1 } as never] });
    expect(SeasonConfigSchema.parse(newer).managers[0]).not.toHaveProperty('somethingNew');
  });
});

describe('the plan without the days away (R-2, R-3, D-26, D-54)', () => {
  it('the team target and the headcount lose the working days of the vacation', () => {
    expect(teamTargetPoints('t1', config, calendar, weightsOf(config))).toBe(7.5 * (7 + 10));
    expect(averageHeadcount('t1', config, calendar)).toBe((7 + 10) / 10);
  });

  it('the pace line accrues without them', () => {
    const plans = buildTeamPlans(config, calendar, buildTrack(config, calendar.workingDays.length));
    const pace = plans.get('t1')?.paceAfter ?? [];
    // After week 1: «a» Mon–Thu (4 days) and «b» (5 days) — 9 of the 17 days of the plan.
    expect(pace[5]).toBe(Math.floor((9 / 17) * 20 + 1e-9));
    expect(pace[10]).toBe(20);
  });

  it('a vacation across a transfer: each team loses only its own days', () => {
    const moved = manager('m', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 't2', from: '2026-10-12' },
      ],
      vacations: [{ from: '2026-10-08', to: '2026-10-13' }],
    });
    const cal = buildCalendar(makeConfig({ managers: [moved] }));
    expect(workingDaysInTeam(moved, 't1', cal)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(workingDaysInTeam(moved, 't2', cal)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
  });
});

describe('the rating and the numbers of vacation days (D-54)', () => {
  it('a row knows whether today is a day of the vacation; the place is kept', () => {
    const i = input([daily('a', '2026-10-06', { pay: 3 }), daily('b', '2026-10-06', { pay: 1 })]);
    const during = computeGameState(i, at('2026-10-12')).managers.find((m) => m.managerId === 'a');
    expect([during?.onVacation, during?.rank]).toEqual([true, 1]);
    const back = computeGameState(i, at('2026-10-14')).managers.find((m) => m.managerId === 'a');
    expect(back?.onVacation).toBe(false);
  });

  it('numbers of a vacation day still count for the team and the operator', () => {
    const s = computeGameState(input([daily('a', '2026-10-12', { pay: 1 })]), at('2026-10-14'));
    expect(s.teams.find((t) => t.teamId === 't1')?.points).toBe(10);
    expect(s.managers.find((m) => m.managerId === 'a')?.points).toBe(10);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/engine/vacations.test.ts` — Expected: FAIL
  (`isOnVacation` is not exported; the plan counts the vacation days).

- [ ] **Step 3: Implement.**
  - `src/data/schemas/season.ts`, above `ManagerSchema`:

```ts
/** A vacation, days inclusive: out of the team's plan, still in the team and the rating (D-54). */
export const VacationSchema = z
  .object({ from: IsoDateSchema, to: IsoDateSchema })
  .refine((v) => v.from <= v.to, { message: 'конец отпуска раньше начала', path: ['to'] });
export type Vacation = z.output<typeof VacationSchema>;
```

    and in `ManagerSchema` after `firedReason`:

```ts
  /** Vacations (D-54); none — the field is absent. */
  vacations: z.array(VacationSchema).optional(),
```

  - `src/engine/roster.ts`:

```ts
/** A day of one of the manager's vacations (D-54): out of the plan, still in the team and the rating. */
export function isOnVacation(manager: Manager, date: string): boolean {
  return (manager.vacations ?? []).some((v) => date >= v.from && date <= v.to);
}
```

    `workingDaysInTeam` and `workingDaysInGame` filter with
    `!isOnVacation(manager, d) && periods.some(…)`; their comments say «(R-2, R-3; vacation days left out,
    D-54)».
  - `src/engine/leaderboard.ts`: `LeaderboardRow` gains
    `/** Today is a day of one of the operator's vacations (D-54): a mark, the place is kept. */
    onVacation: boolean;`, the row `onVacation: isOnVacation(m, today)` (import from `./roster.ts`).

- [ ] **Step 4: Run** `npx vitest run tests/unit/engine` — Expected: PASS (the new file and the old engine
  tests); then `npm run format && npm run typecheck && npm run lint` — exit 0 each (a literal
  `LeaderboardRow` elsewhere gets `onVacation: false`).

- [ ] **Step 5: Commit** «Engine: an operator's vacation — its days out of the team's plan, the headcount
  and the pace line, the operator still in the rating with onVacation (D-54, R-2, R-3, plan vacations
  task 1)».

### Task 2: Achievements — a vacation day is a day off for the streak, away for «все в деле»

**Где смотреть:** спецификация §1; скилл `.claude/skills/engine-rules` (п. 9); DECISIONS D-29; код
`src/engine/achievements/rules/streak.ts`, `teamAllMembers.ts`, `target.ts`; тесты
`tests/unit/engine/achievements/managerRules.test.ts`, `teamRules.test.ts` (образцы `unlocks`); навигатор §1.

**Files:**
- Modify: `src/engine/achievements/rules/streak.ts`, `src/engine/achievements/rules/teamAllMembers.ts`
- Test: `tests/unit/engine/vacations.test.ts`

**Interfaces:**
- Consumes: `isOnVacation(manager, date)` (Task 1).

- [ ] **Step 1: Failing tests** — append to `tests/unit/engine/vacations.test.ts` (imports merged at the
  top: `AchievementRule` type from `src/data/schemas/achievements.ts`, `Manager` type from
  `src/data/schemas/season.ts`, `evaluateAchievements` from `src/engine/achievements/evaluate.ts`,
  `prepare` from `src/engine/prepare.ts`, `achievement` from the builders):

```ts
function unlocks(
  rule: AchievementRule,
  records: EngineInput['records'],
  managers: Manager[],
  scope: 'manager' | 'team' = 'manager',
) {
  const c = makeConfig({
    managers,
    achievements: [achievement('x', rule, scope === 'team' ? { scope: 'team' } : {})],
  });
  const p = prepare({ config: c, records, adjustments: [], imports: [] });
  return evaluateAchievements(p, '2026-10-19').unlocks.map((u) => [
    u.managerId ?? u.teamId,
    u.unlockedAt,
  ]);
}

describe('achievements across a vacation (D-29, D-54)', () => {
  const streak: AchievementRule = { type: 'streak', metric: 'pay', minPerDay: 1, days: 3 };
  const wedThu = { vacations: [{ from: '2026-10-07', to: '2026-10-08' }] };

  it('a streak: the vacation neither breaks it nor extends it', () => {
    const records = [
      daily('a', '2026-10-05', { pay: 1 }),
      daily('a', '2026-10-06', { pay: 1 }),
      daily('a', '2026-10-09', { pay: 1 }),
    ];
    expect(unlocks(streak, records, [manager('a', 't1', wedThu)])).toEqual([['a', '2026-10-09']]);
    expect(unlocks(streak, records, [manager('a', 't1')])).toEqual([]);
    // Payments on the vacation days do not extend it: without the skip, 06–08 would be a streak.
    const onTheVacation = [
      daily('v', '2026-10-06', { pay: 1 }),
      daily('v', '2026-10-07', { pay: 1 }),
      daily('v', '2026-10-08', { pay: 1 }),
    ];
    expect(unlocks(streak, onTheVacation, [manager('v', 't1')])).toEqual([['v', '2026-10-08']]);
    expect(unlocks(streak, onTheVacation, [manager('v', 't1', wedThu)])).toEqual([]);
  });

  it('«все в деле»: a member away that day does not hold the team back', () => {
    const rule: AchievementRule = {
      type: 'team_all_members',
      metric: 'pay',
      minEach: 1,
      period: 'season',
    };
    const week1 = { vacations: [{ from: '2026-10-05', to: '2026-10-09' }] };
    const team = [manager('a', 't1', week1), manager('b', 't1'), manager('c', 't2')];
    const records = [daily('b', '2026-10-06', { pay: 1 })];
    expect(unlocks(rule, records, team, 'team')).toEqual([['t1', '2026-10-06']]);
    expect(unlocks(rule, records, [manager('a', 't1'), ...team.slice(1)], 'team')).toEqual([]);
  });

  it('the personal plan of «план недели» is the days at work', () => {
    const rule: AchievementRule = { type: 'target', before: 'week_end', week: 1 };
    const week2 = { vacations: [{ from: '2026-10-12', to: '2026-10-16' }] };
    const records = [daily('a', '2026-10-07', { pay: 4 })]; // 40 ≥ 5 days × 7.5, < 10 × 7.5
    expect(unlocks(rule, records, [manager('a', 't1', week2)])).toEqual([['a', '2026-10-07']]);
    expect(unlocks(rule, records, [manager('a', 't1')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/engine/vacations.test.ts` — Expected: FAIL on the
  streak and «все в деле» (the personal plan already follows Task 1 — a passing test there is the Task 1
  change at work, ledgered).

- [ ] **Step 3: Implement.**
  - `streak.ts`: before the loop over managers
    `const managers = new Map(ctx.config.managers.map((m) => [m.id, m]));`, per manager
    `const manager = managers.get(managerId);`, inside the loop over days, first:

```ts
      // A day of the operator's vacation is a day off for them: it neither breaks nor extends (D-54).
      if (manager && isOnVacation(manager, date)) continue;
```

    and the doc comment «days off and the operator's vacation days neither break nor extend it (D-29,
    D-54)».
  - `teamAllMembers.ts`: `if (isFiredOn(m, date) || isOnVacation(m, date)) continue;` with the comment
    «a member away that day does not hold the team back, as a fired one (R-5, D-54)»; the running totals
    stay above it (numbers of a vacation day still count).

- [ ] **Step 4: Run** `npx vitest run tests/unit/engine` — Expected: PASS; `npm run test:engine` —
  `src/engine` ≥ 90 %; `npm run test:perf` — PASS (< 50 ms); `npm run format && npm run typecheck && npm
  run lint` — exit 0.

- [ ] **Step 5: Commit** «Engine: achievements across a vacation — a streak skips the days away, «все в
  деле» does not wait for a member away (D-29, D-54, plan vacations task 2)».

### Task 3: The roster batch — `vacation` and `unvacation`

**Где смотреть:** спецификация §2; DECISIONS D-52; код `src/admin/roster.ts` (`applyOne` — образцы `fire`,
`unfire`, `transfer`; `gameDate`, `isDay`, `lineOf`, `warningsOf`, `rosterCommitMessage`),
`src/admin/rosterStep.ts` (`withoutEdit`), `src/engine/calendar.ts` (`buildCalendar`); тесты
`tests/unit/admin/roster.test.ts`; навигатор §3.

**Files:**
- Modify: `src/admin/roster.ts`
- Test: `tests/unit/admin/roster.test.ts`

**Interfaces:**
- Produces (in `RosterEdit`):
  ```ts
  | { kind: 'vacation'; managerId: string; from: string; to: string }
  | { kind: 'unvacation'; managerId: string; from: string } // the vacation that starts on `from`
  ```

- [ ] **Step 1: Failing tests** — append to `tests/unit/admin/roster.test.ts` (import `withoutEdit` from
  `src/admin/rosterStep.ts`):

```ts
describe('vacations in the roster batch (D-54)', () => {
  const vac = (managerId: string, from: string, to: string): RosterEdit => ({
    kind: 'vacation',
    managerId,
    from,
    to,
  });
  const off = (managerId: string, from: string): RosterEdit => ({
    kind: 'unvacation',
    managerId,
    from,
  });

  it('a vacation of the game with its working days in the line', () => {
    const r = apply([vac('op001', '2026-10-09', '2026-10-13')]);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op001')?.vacations).toEqual([{ from: '2026-10-09', to: '2026-10-13' }]);
    expect(r.lines).toEqual(['Отпуск: Ершова Мария 09.10–13.10 (3 раб. дн.)']);
  });

  it('dates cut to the game; wholly outside, reversed or not a day — refused', () => {
    const r = apply([vac('op001', '2026-10-01', '2026-10-06'), vac('op002', '2026-10-15', '2026-10-30')]);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op001')?.vacations).toEqual([{ from: '2026-10-05', to: '2026-10-06' }]);
    expect(mgr(r.config, 'op002')?.vacations).toEqual([{ from: '2026-10-15', to: '2026-10-18' }]);
    const bad = apply([
      vac('op001', '2026-09-20', '2026-09-30'),
      vac('op001', '2026-10-12', '2026-10-09'),
      vac('op001', '', '2026-10-09'),
      vac('op001', '2026-10-09', ''),
    ]);
    expect(bad.problems.map((p) => p.message)).toEqual([
      'отпуск вне игры (05.10–18.10)',
      'конец отпуска раньше начала',
      'начало отпуска: укажите дату',
      'конец отпуска: укажите дату',
    ]);
  });

  it('overlapping another vacation of the person, or after the firing — refused', () => {
    const r = apply([
      vac('op001', '2026-10-12', '2026-10-16'),
      vac('op001', '2026-10-16', '2026-10-18'),
      vac('op003', '2026-10-08', '2026-10-09'),
    ]);
    expect(r.problems.map((p) => p.message)).toEqual([
      'пересекается с отпуском 12.10–16.10 — измените его',
      'Белова Анна: увольнение с 07.10 — отпуск после него не нужен',
    ]);
  });

  it('«Изменить отпуск» is «Снять» and a new one; removing only «Снять» leaves a red overlap', () => {
    const withVacation = apply([vac('op001', '2026-10-12', '2026-10-16')]).config;
    const changed = apply(
      [off('op001', '2026-10-12'), vac('op001', '2026-10-12', '2026-10-14')],
      withVacation,
    );
    expect(changed.problems).toEqual([]);
    expect(mgr(changed.config, 'op001')?.vacations).toEqual([
      { from: '2026-10-12', to: '2026-10-14' },
    ]);
    expect(changed.lines).toEqual([
      'Снять отпуск: Ершова Мария 12.10–16.10',
      'Отпуск: Ершова Мария 12.10–14.10 (3 раб. дн.)',
    ]);
    const half = apply([vac('op001', '2026-10-12', '2026-10-14')], withVacation);
    expect(half.problems.map((p) => p.message)).toEqual([
      'пересекается с отпуском 12.10–16.10 — измените его',
    ]);
  });

  it('«Снять отпуск» takes it away; a vacation that is not there — refused', () => {
    const withVacation = apply([vac('op001', '2026-10-12', '2026-10-16')]).config;
    expect(mgr(apply([off('op001', '2026-10-12')], withVacation).config, 'op001')).not.toHaveProperty(
      'vacations',
    );
    expect(apply([off('op002', '2026-10-12')]).problems.map((p) => p.message)).toEqual([
      'такого отпуска нет',
    ]);
  });

  it('a weekend-only vacation is a warning; the message counts', () => {
    const r = apply([vac('op001', '2026-10-10', '2026-10-11'), vac('op002', '2026-10-12', '2026-10-12')]);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([
      'Ершова Мария: в отпуске 10.10–11.10 нет рабочих дней — на план это не влияет',
    ]);
    expect(rosterCommitMessage([vac('op001', '2026-10-12', '2026-10-14'), off('op001', '2026-10-12')])).toBe(
      'состав: 1 отпуск, 1 снятие отпуска',
    );
  });

  it('a vacation of a new operator of the same batch goes with its «Новый»', () => {
    const edits: RosterEdit[] = [
      { kind: 'add', ref: 'new-1', name: 'Новикова Фёкла', teamId: 't2', from: '2026-10-12', norms: NORMS },
      vac('new-1', '2026-10-14', '2026-10-15'),
    ];
    const r = apply(edits);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op004')?.vacations).toEqual([{ from: '2026-10-14', to: '2026-10-15' }]);
    expect(withoutEdit(edits, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/roster.test.ts` — Expected: FAIL (unknown kinds).

- [ ] **Step 3: Implement** in `src/admin/roster.ts`:
  - `RosterEdit` gains the two kinds; `Ctx` gains `warnings: string[]` (`applyRosterEdits` starts it empty
    and returns `warnings: [...ctx.warnings, ...warningsOf(…)]`; the schema-failure branch keeps `[]`);
    `import { buildCalendar } from '../engine/calendar.ts';`.
  - helpers:

```ts
type Days = { from: string; to: string };
const range = (v: Days) => `${dayMonth(v.from)}–${dayMonth(v.to)}`;
/** The vacation cut to the game: before the start — the start, after the end — the end. */
const inGame = (c: SeasonConfig, v: Days): Days => ({
  from: v.from < c.period.start ? c.period.start : v.from,
  to: v.to > c.period.end ? c.period.end : v.to,
});
const workingDaysIn = (c: SeasonConfig, v: Days) =>
  buildCalendar(c).workingDays.filter((d) => d >= v.from && d <= v.to).length;
```

  - `applyOne`:

```ts
    case 'vacation': {
      const m = managerOf(ctx, edit.managerId);
      if (!isDay(edit.from)) refuse('начало отпуска: укажите дату');
      if (!isDay(edit.to)) refuse('конец отпуска: укажите дату');
      if (edit.to < edit.from) refuse('конец отпуска раньше начала');
      const { start, end } = c.period;
      if (edit.to < start || edit.from > end)
        refuse(`отпуск вне игры (${dayMonth(start)}–${dayMonth(end)})`);
      const v = inGame(c, edit);
      if (m.firedAt !== undefined && v.from >= m.firedAt)
        refuse(`${m.fullName}: увольнение с ${dayMonth(m.firedAt)} — отпуск после него не нужен`);
      const other = (m.vacations ?? []).find((x) => x.from <= v.to && v.from <= x.to);
      if (other) refuse(`пересекается с отпуском ${range(other)} — измените его`);
      if (workingDaysIn(c, v) === 0)
        ctx.warnings.push(`${m.fullName}: в отпуске ${range(v)} нет рабочих дней — на план это не влияет`);
      const vacations = [...(m.vacations ?? []), v].sort((a, b) => (a.from < b.from ? -1 : 1));
      return withManager(c, { ...m, vacations });
    }
    case 'unvacation': {
      const m = managerOf(ctx, edit.managerId);
      const kept = (m.vacations ?? []).filter((x) => x.from !== edit.from);
      if (kept.length === (m.vacations ?? []).length) refuse('такого отпуска нет');
      const back: Manager = { ...m, vacations: kept };
      if (kept.length === 0) delete back.vacations;
      return withManager(c, back);
    }
```

  - `lineOf`:

```ts
    case 'vacation': {
      if (!isDay(edit.from) || !isDay(edit.to)) return `Отпуск: ${who(edit.managerId)} без даты`;
      const v = inGame(c, edit);
      return `Отпуск: ${who(edit.managerId)} ${range(v)} (${workingDaysIn(c, v)} раб. дн.)`;
    }
    case 'unvacation': {
      const m = c.managers.find((x) => x.id === (ctx.refs.get(edit.managerId) ?? edit.managerId));
      const v = m?.vacations?.find((x) => x.from === edit.from);
      return `Снять отпуск: ${who(edit.managerId)} ${v ? range(v) : `с ${dayMonth(edit.from)}`}`;
    }
```

  - `rosterCommitMessage`, after «смена нормативов»:
    `add(count('vacation'), 'отпуск', 'отпуска', 'отпусков');`
    `add(count('unvacation'), 'снятие отпуска', 'снятия отпуска', 'снятий отпуска');`

- [ ] **Step 4: Run** `npx vitest run tests/unit/admin` — Expected: PASS; `npm run format && npm run
  typecheck && npm run lint` — exit 0.

- [ ] **Step 5: Commit** «Admin: a vacation in the roster batch — «с — по» cut to the game, no overlap, not
  after the firing, «Снять отпуск», a weekend-only warning, counts in the message (D-54, D-52, plan
  vacations task 3)».

### Task 4: The screen and the map — the form, the row, the mark; the e2e test

**Где смотреть:** спецификация §2–§3; код `src/admin/Roster.tsx` (строка оператора, `Open`, `editId`),
`src/admin/RosterForms.tsx` (`FireForm`, `dateInput`), `src/admin/FormParts.tsx`, `src/hud/rating.ts`
(`TeamRow`, `TopRow`), `src/hud/Hud.tsx` (`SlideView`); тесты `tests/unit/hud.test.ts`,
`tests/e2e/admin.spec.ts` (`login`, `changed`); навигатор §3, §11.

**Files:**
- Modify: `src/admin/Roster.tsx`, `src/admin/RosterForms.tsx`, `src/hud/rating.ts`, `src/hud/Hud.tsx`
- Test: `tests/unit/hud.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `isOnVacation` (Task 1), `onVacation` of the rating rows (Task 1), the edits (Task 3).
- Produces: `TeamRow.away: boolean`, `TopRow.away: boolean`; `VacationForm`; buttons «Отпуск: <ФИО>»,
  «Изменить отпуск: <ФИО> с dd.mm», «Снять отпуск: <ФИО> с dd.mm»; inputs «Начало отпуска», «Конец
  отпуска».

- [ ] **Step 1: Failing tests.**
  - `tests/unit/hud.test.ts` (import `computeGameState` if not yet imported):

```ts
describe('ratingSlides — a vacation (D-54)', () => {
  const config = makeConfig({
    teams: [team('t1', 1)],
    managers: [
      manager('a', 't1', { vacations: [{ from: '2026-10-12', to: '2026-10-16' }] }),
      manager('b', 't1'),
    ],
  });
  const input = {
    config,
    records: [daily('a', '2026-10-06', { pay: 2 }), daily('b', '2026-10-06', { pay: 1 })],
    adjustments: [],
    imports: [],
  };

  it('marks the operator away today in the team slide and the top, in place', () => {
    const slides = ratingSlides(computeGameState(input, at('2026-10-14')), config);
    const team1 = slides[0];
    const top = slides.at(-1);
    if (team1?.kind !== 'team' || top?.kind !== 'top') throw new Error('slides expected');
    expect(team1.rows.map((r) => [r.managerId, r.away])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect(top.rows.map((r) => [r.managerId, r.away])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    const later = ratingSlides(computeGameState(input, at('2026-10-19')), config)[0];
    if (later?.kind !== 'team') throw new Error('team slide expected');
    expect(later.rows.every((r) => !r.away)).toBe(true);
  });
});
```

  - `tests/e2e/admin.spec.ts` (import type `EngineInput` from `../../src/engine/prepare.ts`):

```ts
test('«Отпуск»: a vacation through the roster batch is one commit of the config; the team plan loses the days (D-54)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const NOW = '2026-10-14T12:00:00+03:00';
  await page.clock.setFixedTime(new Date(NOW));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const before = (await loadRepoState(fake, DEMO, new Map())).input;
  await login(page, fake);
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  const boris = page.getByTestId('roster').getByRole('region', { name: 'Команда Борис Кузнецов' });
  await boris.getByText(/^Операторы/).click();
  const name = (await boris.getByTestId('operator-name').first().textContent()) ?? '';
  await boris.getByRole('button', { name: `Отпуск: ${name}` }).click();
  await page.getByLabel('Начало отпуска', { exact: true }).fill('2026-10-12');
  await page.getByLabel('Конец отпуска', { exact: true }).fill('2026-10-16');
  await page.getByRole('button', { name: 'В изменения' }).click();
  await expect(boris.getByText('в отпуске до 16.10')).toBeVisible();
  const draft = page.getByTestId('roster-draft');
  await expect(draft.getByRole('list', { name: 'Изменения' })).toContainText(
    `Отпуск: ${name} 12.10–16.10 (5 раб. дн.)`,
  );
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.last.message).toBe('data(demo): состав: 1 отпуск [by koordinator]');
  expect(changed(fake, 0, 1)).toEqual(['data/seasons/demo/config.enc.json', 'data/version.json']);
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  expect(after.config.managers.find((m) => m.fullName === name)?.vacations).toEqual([
    { from: '2026-10-12', to: '2026-10-16' },
  ]);
  const t2 = (i: EngineInput) => computeGameState(i, NOW).teams.find((t) => t.teamId === 't2');
  expect(t2(after)?.targetPoints ?? 0).toBeLessThan(t2(before)?.targetPoints ?? 0);
  expect(t2(after)?.position ?? 0).toBeGreaterThanOrEqual(t2(before)?.position ?? 0);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/hud.test.ts` and `npx playwright test
  tests/e2e/admin.spec.ts --project=e2e -g "Отпуск"` — Expected: FAIL (no `away`; no «Отпуск» button).

- [ ] **Step 3: Implement.**
  - `src/hud/rating.ts`: `TeamRow` and `TopRow` gain `/** Away on vacation today (D-54). */ away:
    boolean;` — team rows `away: isOnVacation(m, game.today)` (import from `../engine/roster.ts`), top rows
    `away: m.onVacation`.
  - `src/hud/Hud.tsx`, `SlideView`, in both lists right after the name:
    `{r.away && <span className="text-xs italic text-(--sq-ink-soft)">в отпуске</span>}`.
  - `src/admin/RosterForms.tsx`:

```tsx
/** «Отпуск» (D-54): the days out of the team's plan, both included; a change replaces the old one. */
export function VacationForm({
  config,
  manager,
  editId,
  day,
  vacation,
  onAdd,
  onCancel,
}: {
  config: SeasonConfig;
  manager: Manager;
  editId: string;
  day: string;
  /** The vacation being changed; none — a new one. */
  vacation?: { from: string; to: string };
  onAdd: Add;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState(vacation?.from ?? day);
  const [to, setTo] = useState(vacation?.to ?? day);
  const submit = () => {
    if (vacation && vacation.from === from && vacation.to === to) {
      onCancel();
      return;
    }
    const edits: RosterEdit[] = vacation
      ? [{ kind: 'unvacation', managerId: editId, from: vacation.from }]
      : [];
    edits.push({ kind: 'vacation', managerId: editId, from, to });
    onAdd(edits);
  };
  return (
    <Form
      title={`${vacation ? 'Изменить отпуск' : 'Отпуск'}: ${manager.fullName}`}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <Field label="С">{dateInput(config, 'Начало отпуска', from, setFrom)}</Field>
      <Field label="По">{dateInput(config, 'Конец отпуска', to, setTo)}</Field>
      <p className="italic">
        Дни отпуска не идут в план команды; в рейтинге оператор остаётся с пометкой «в отпуске».
      </p>
    </Form>
  );
}
```

  - `src/admin/Roster.tsx`: `Open` gains `| { form: 'vacation'; managerId: string; from?: string }`; in the
    operator's row, after the firing mark — each vacation:

```tsx
                      {(m.vacations ?? []).map((v) => (
                        <span key={v.from} className="flex items-center gap-1 italic">
                          {v.from <= day && day <= v.to
                            ? `в отпуске до ${dayMonth(v.to)}`
                            : `отпуск ${dayMonth(v.from)}–${dayMonth(v.to)}`}
                          <button
                            className="sq-button not-italic"
                            aria-label={`Изменить отпуск: ${m.fullName} с ${dayMonth(v.from)}`}
                            onClick={() =>
                              setOpen({ form: 'vacation', managerId: editId(m), from: v.from })
                            }
                          >
                            Изменить
                          </button>
                          <button
                            className="sq-button not-italic"
                            aria-label={`Снять отпуск: ${m.fullName} с ${dayMonth(v.from)}`}
                            onClick={() =>
                              add([{ kind: 'unvacation', managerId: editId(m), from: v.from }])
                            }
                          >
                            Снять
                          </button>
                        </span>
                      ))}
```

    a button «Отпуск» before «Уволить» (`aria-label={`Отпуск: ${m.fullName}`}`, disabled when
    `m.firedAt !== undefined`, `onClick={() => setOpen({ form: 'vacation', managerId: editId(m) })}`), and
    under the row:

```tsx
                      {open?.form === 'vacation' && open.managerId === editId(m) && (
                        <VacationForm
                          config={config}
                          manager={m}
                          editId={editId(m)}
                          day={day}
                          vacation={(m.vacations ?? []).find((v) => v.from === open.from)}
                          onAdd={add}
                          onCancel={close}
                        />
                      )}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/hud.test.ts` and `npx playwright test
  tests/e2e/admin.spec.ts --project=e2e` — Expected: PASS (all admin tests); `npm run format && npm run
  typecheck && npm run lint && npm test` — exit 0.

- [ ] **Step 5: Commit** «Admin and map: «Отпуск» in the operator's row — the form, «Изменить» / «Снять»;
  «в отпуске» in the rotating rating (D-54, D-38, plan vacations task 4)».

### Task 5: The whole suite, screenshots, docs, the review, the report, the push

**Где смотреть:** CLAUDE.md «Проверка»; `docs/NAVIGATOR.md` §1, §3, §11, §16; `docs/DECISIONS.md`
(D-52, D-53); навигатор «Грабли среды» (e2e на 127.0.0.1).

- [ ] **The suite:** `npm run typecheck && npm run lint && npm test && npm run test:engine && npm run
  test:perf && npm run test:e2e` (QA-4 and QA-6 unchanged — the demo has no vacations; QA-4 alone with
  `npx playwright test --project=perf --no-deps` if the full run is loaded); `npm run build && npm run
  size`; `npm run check:data`.
- [ ] **Screenshots** with a temporary spec `tests/e2e/zz-vacation.spec.ts` (never committed; the clock
  pinned to 14.10): the operator's row with «в отпуске до 16.10» and the form, the batch with a red overlap
  line, the map's rating slide with «в отпуске» (the demo game with a vacation written by the batch) — sent
  to the author.
- [ ] **Docs:** DECISIONS **D-54** (in Russian): the field, the working days without vacation days (plan,
  headcount, pace line, personal plan), the whole-game plan and back-dating, numbers of vacation days
  counted, `onVacation` and the mark, the streak and «все в деле», the batch edits and their refusals, the
  message; NAVIGATOR §1 (`isOnVacation`), §3 (the vacation edits and the form), §16; CLAUDE.md — the line
  of the current stage names this plan.
- [ ] Commit «Docs: D-54 — an operator's vacation …»; an independent review of the plan's range (a subagent
  on the most capable model; it never opens the root `*.xlsx`, `refs/` or `assets-src/` and never decrypts
  `data/`), with this plan's Review Focus; Critical/Important fixed by TDD; minors to BACKLOG.
- [ ] A short report to the author in Russian; the push only after «да»; a reminder to refresh the office
  screen (F5) after the deploy.
