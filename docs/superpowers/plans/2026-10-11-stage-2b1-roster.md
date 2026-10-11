# Stage 2b-1 — the Roster and the Teams: Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process; the author
> chose inline execution for stage 2), an independent review subagent checks the whole plan at the end
> (Task 7). Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and
> `docs/NAVIGATOR.md` §3.

**Goal:** while the real game runs (12.10–25.10.2026), the coordinator adds, renames, transfers, fires
and returns operators, changes their norms and the teams' leader, colour, hero and order — as one batch
with one preview and one commit — without the developer.

**Architecture:** an edit is a value; a batch is a list applied by a pure function to the season config
(`applyRosterEdits`), which names each edit that does not apply instead of failing the batch. A pure step
(`prepareRoster`) gives the preview and the public message; the screen holds the batch and writes it
through `commitChange` of plan 2a. After «данные изменились» the same list is applied to the fresh
season (ADM-2).

**Tech stack:** React 19, TypeScript 6 strict, zod 4, Vitest, Playwright; the GitHub write path, the
fake GitHub and the engine of stages 1–2a as they are.

**Spec:** `docs/superpowers/specs/2026-10-11-stage-2b1-roster-design.md` (approved 11.10.2026); SPEC §8
(ADM-ROSTER, ADM-PREVIEW, ADM-2, ADM-3); DECISIONS ADM-ROSTER-1…6, R-1, R-2, R-5, OQ-11, D-21, D-41,
D-51; BACKLOG «Этап 2».

## Global Constraints

- The admin chunk stays lazy (D-7a): nothing of this plan in the initial JS; `npm run size` unchanged.
- Commit messages and the game title are public — counts only, never names (D-51); the name guard of
  `commitChange` stays.
- No real names, exports or the real phrase in tests or the repository; tests use the demo
  (`tests/fixtures/demo-data`) and builders with fictional people.
- The live game's data change only when the author presses «Записать»; deploying this plan changes the
  admin's code only.
- Dates are `YYYY-MM-DD` strings; «today» is the admin's local date (`localDate`), timestamps through
  `localTimestamp` (D-11); the engine stays pure and unchanged.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved,
  the push only after the author's «да» (D-3).
- In the UI «оператор», in code and data `manager` (ADM-ROSTER-6).

## Review Focus

1. **An edit of an operator added in the same batch, then that «Новый» line removed with «×»** — the
   edits that referred to the new person go with it; they never retarget another operator (ids of new
   people shift) — Task 3 test «removing a new operator removes the edits that refer to him».
2. **Two edits of one operator that contradict each other in a batch** (fired on 09.10, then a transfer
   from 12.10) — the later one is a problem with the reason, the earlier one applies — Task 1 test
   «a transfer after the firing in the same batch is refused».
3. **Norms typed with a comma** («1,5») in the forms — read as 1.5, not refused — Task 3 test
   «reads a decimal with a comma or a point».
4. **«Today» outside the game** (before the start, after the end) — default dates and the people counts
   use the nearest day of the game — Task 3 test «today before the start counts people on the first
   day».
5. **A rename to the same name in another spelling** (ё/е, case) — fixes the spelling, adds no alias,
   is not «такой оператор уже есть» — Task 1 test «a rename that only fixes the spelling».

---

### Task 1: Operator edits as data — `applyRosterEdits` for add, rename, transfer, norms, fire, return

**Где смотреть:** спецификация 2б-1 §2; DECISIONS ADM-ROSTER-2, ADM-ROSTER-3, R-1, R-2, R-5, OQ-11;
код `src/engine/roster.ts` (`effectiveMemberships`, `teamOn`, `membersOn`), `src/import/apply.ts`
(`nextId`), `src/import/match.ts` (`cleanName`, `normalizeName`), `src/data/schemas/season.ts`
(`ManagerSchema`, `MembershipSchema`), `tests/support/builders.ts`; навигатор §1, §3.

**Files:**
- Create: `src/admin/roster.ts`
- Modify: `src/import/apply.ts` (export `nextManagerId`, the former private `nextId`)
- Test: `tests/unit/admin/roster.test.ts`

**Interfaces:**
- Consumes: `cleanName`, `normalizeName` (`src/import/match.ts`); `dayMonth` (`src/import/grid.ts`);
  `addDays` (`src/engine/dates.ts`); `schemaProblem(error: ZodError): string` (`src/admin/session.ts`);
  `SeasonConfigSchema`, `SeasonConfig`, `Manager`, `Team`, `Membership`.
- Produces:
  ```ts
  // src/import/apply.ts
  export function nextManagerId(managers: Manager[]): string; // op001… after the largest
  // src/admin/roster.ts
  export type Norms = Record<string, number>;
  export type RosterEdit =
    | { kind: 'add'; ref: string; name: string; teamId: string; from: string; norms: Norms }
    | { kind: 'rename'; managerId: string; name: string }
    | { kind: 'transfer'; managerId: string; teamId: string; from: string }
    | { kind: 'norms'; managerId: string; norms: Norms }
    | { kind: 'fire'; managerId: string; date: string; reason?: string }
    | { kind: 'unfire'; managerId: string }
    | { kind: 'team'; teamId: string; leaderName?: string; color?: string; characterId?: string }
    | { kind: 'order'; teamIds: string[] };
  export type RosterResult = {
    config: SeasonConfig;
    problems: { index: number; message: string }[]; // index −1: the batch as a whole
    warnings: string[];
    lines: string[]; // one per edit, in words, for the screen (names inside: never public)
  };
  export function applyRosterEdits(config: SeasonConfig, edits: RosterEdit[]): RosterResult;
  export function teamLabel(team: Team): string; // sourceCode, else the leader's name
  ```
  `managerId` of an edit may be the `ref` of an `add` earlier in the batch (a new person: `new-1`…).

- [ ] **Step 1: Failing tests** — `tests/unit/admin/roster.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyRosterEdits, type RosterEdit } from '../../../src/admin/roster.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { makeConfig, manager, team } from '../../support/builders.ts';

const NORMS = { inv6: 3, inv20: 1.5, pay: 0.2 };
// A two-week game 05.10–18.10; СР1, СР5, СР9.
const config = makeConfig({
  teams: [
    team('t1', 1, { sourceCode: 'СР1' }),
    team('t2', 2, { sourceCode: 'СР5', color: '#29335C' }),
    team('t3', 3, { sourceCode: 'СР9', color: '#4C956C' }),
  ],
  managers: [
    manager('op001', 't1', { fullName: 'Ершова Мария', dailyNorms: NORMS }),
    manager('op002', 't1', { fullName: 'Федоров Иван', aliases: ['Федоров Иван Петрович'] }),
    manager('op003', 't2', { fullName: 'Белова Анна', firedAt: '2026-10-07' }),
  ],
  defaultDailyNorms: NORMS,
});
const apply = (edits: RosterEdit[], c: SeasonConfig = config) => applyRosterEdits(c, edits);
const mgr = (c: SeasonConfig, id: string) => c.managers.find((m) => m.id === id);

describe('operator edits (ADM-ROSTER-2, ADM-ROSTER-3)', () => {
  it('adds an operator with the next id, a clean name, the norms and a team from a day', () => {
    const r = apply([
      { kind: 'add', ref: 'new-1', name: '  Новикова   Фёкла ', teamId: 't2', from: '2026-10-12', norms: NORMS },
    ]);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op004')).toEqual({
      id: 'op004',
      fullName: 'Новикова Фёкла',
      aliases: [],
      dailyNorms: NORMS,
      memberships: [{ teamId: 't2', from: '2026-10-12' }],
    });
    expect(r.lines).toEqual(['Новый: Новикова Фёкла → СР5 с 12.10']);
  });

  it('a date before the start means the start; after the end is refused', () => {
    const r = apply([
      { kind: 'add', ref: 'new-1', name: 'Новикова Фёкла', teamId: 't2', from: '2026-10-01', norms: NORMS },
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-20' },
    ]);
    expect(mgr(r.config, 'op004')?.memberships).toEqual([{ teamId: 't2', from: '2026-10-05' }]);
    expect(r.problems).toEqual([{ index: 1, message: expect.stringMatching(/после конца игры \(18\.10\)/) }]);
  });

  it('a transfer closes the old team the day before; earned points stay there (R-1)', () => {
    const r = apply([{ kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' }]);
    expect(mgr(r.config, 'op001')?.memberships).toEqual([
      { teamId: 't1', from: '2026-10-05', to: '2026-10-11' },
      { teamId: 't2', from: '2026-10-12' },
    ]);
    expect(r.lines).toEqual(['Перевод: Ершова Мария → СР5 с 12.10']);
  });

  it('a transfer on the first day replaces the team; to the same team is a problem', () => {
    const r = apply([
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-05' },
      { kind: 'transfer', managerId: 'op002', teamId: 't1', from: '2026-10-12' },
    ]);
    expect(mgr(r.config, 'op001')?.memberships).toEqual([{ teamId: 't2', from: '2026-10-05' }]);
    expect(r.problems).toEqual([{ index: 1, message: 'Федоров Иван уже в этой команде' }]);
  });

  it('a transfer drops the memberships after its day', () => {
    const moved = makeConfig({
      ...config,
      managers: [
        manager('op001', 't1', {
          fullName: 'Ершова Мария',
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-10' },
          ],
        }),
      ],
    });
    const r = apply([{ kind: 'transfer', managerId: 'op001', teamId: 't3', from: '2026-10-08' }], moved);
    expect(mgr(r.config, 'op001')?.memberships).toEqual([
      { teamId: 't1', from: '2026-10-05', to: '2026-10-07' },
      { teamId: 't3', from: '2026-10-08' },
    ]);
  });

  it('a rename keeps the old name as an alias; a name of someone else, an alias of theirs too, is refused', () => {
    const r = apply([
      { kind: 'rename', managerId: 'op001', name: 'Ершова Мария Ивановна' },
      { kind: 'rename', managerId: 'op001', name: 'федоров  иван петрович' },
      { kind: 'add', ref: 'new-1', name: 'Фёдоров Иван', teamId: 't1', from: '2026-10-12', norms: NORMS },
    ]);
    expect(mgr(r.config, 'op001')).toMatchObject({
      fullName: 'Ершова Мария Ивановна',
      aliases: ['Ершова Мария'],
    });
    expect(r.problems).toEqual([
      { index: 1, message: 'такой оператор уже есть: Федоров Иван (СР1)' },
      { index: 2, message: 'такой оператор уже есть: Федоров Иван (СР1)' },
    ]);
  });

  it('a rename that only fixes the spelling (ё, case) adds no alias and is no duplicate', () => {
    const r = apply([{ kind: 'rename', managerId: 'op002', name: 'Фёдоров Иван' }]);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op002')).toMatchObject({
      fullName: 'Фёдоров Иван',
      aliases: ['Федоров Иван Петрович'],
    });
  });

  it('norms: every metric, numbers from 0, fractions allowed', () => {
    const r = apply([
      { kind: 'norms', managerId: 'op002', norms: { inv6: 2.5, inv20: 0, pay: 0.2 } },
      { kind: 'norms', managerId: 'op001', norms: { inv6: -1, inv20: 1, pay: 0.2 } },
      { kind: 'norms', managerId: 'op001', norms: { inv6: 1, inv20: 1 } },
    ]);
    expect(mgr(r.config, 'op002')?.dailyNorms).toEqual({ inv6: 2.5, inv20: 0, pay: 0.2 });
    expect(r.problems.map((p) => p.message)).toEqual([
      'норматив «Качественные счета» — число от 0',
      'норматив «Оплаты» — число от 0',
    ]);
    expect(r.lines[0]).toBe('Нормативы: Федоров Иван — 2,5 / 0 / 0,2');
  });

  it('fires on a day with a reason; already fired, or before the person came, is refused', () => {
    const r = apply([
      { kind: 'fire', managerId: 'op001', date: '2026-10-12', reason: ' ушла ' },
      { kind: 'fire', managerId: 'op003', date: '2026-10-12' },
      { kind: 'add', ref: 'new-1', name: 'Новикова Фёкла', teamId: 't2', from: '2026-10-12', norms: NORMS },
      { kind: 'fire', managerId: 'new-1', date: '2026-10-09' },
    ]);
    expect(mgr(r.config, 'op001')).toMatchObject({ firedAt: '2026-10-12', firedReason: 'ушла' });
    expect(r.problems).toEqual([
      { index: 1, message: 'Белова Анна: увольнение уже записано — с 07.10' },
      { index: 3, message: 'Новикова Фёкла: увольнение 09.10 раньше прихода в команду (12.10)' },
    ]);
    expect(r.lines[0]).toBe('Увольнение: Ершова Мария с 12.10 (ушла)');
  });

  it('a return removes the firing; without a firing it is a problem', () => {
    const r = apply([
      { kind: 'unfire', managerId: 'op003' },
      { kind: 'unfire', managerId: 'op001' },
    ]);
    expect(mgr(r.config, 'op003')).not.toHaveProperty('firedAt');
    expect(r.problems).toEqual([{ index: 1, message: 'Ершова Мария: увольнения нет — возвращать нечего' }]);
    expect(r.lines[0]).toBe('Возврат: Белова Анна');
  });

  it('a transfer after the firing in the same batch is refused; the firing applies', () => {
    const r = apply([
      { kind: 'fire', managerId: 'op001', date: '2026-10-09' },
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' },
    ]);
    expect(mgr(r.config, 'op001')?.firedAt).toBe('2026-10-09');
    expect(r.problems).toEqual([
      { index: 1, message: 'Ершова Мария: увольнение с 09.10 — перевод после него не нужен' },
    ]);
  });

  it('edits of a new person follow its ref; without its «Новый» they are problems, never someone else', () => {
    const add = (ref: string, name: string): RosterEdit => ({
      kind: 'add', ref, name, teamId: 't2', from: '2026-10-12', norms: NORMS,
    });
    const fireB: RosterEdit = { kind: 'fire', managerId: 'new-2', date: '2026-10-14' };
    const both = apply([add('new-1', 'Аа Аа'), add('new-2', 'Бб Бб'), fireB]);
    expect(mgr(both.config, 'op005')).toMatchObject({ fullName: 'Бб Бб', firedAt: '2026-10-14' });
    const withoutB = apply([add('new-1', 'Аа Аа'), fireB]);
    expect(mgr(withoutB.config, 'op004')).not.toHaveProperty('firedAt');
    expect(withoutB.problems).toEqual([
      { index: 1, message: 'этого оператора нет в составе — возможно, его уже убрали' },
    ]);
  });

  it('a batch applied again to a changed season: what no longer fits is a problem, the rest applies', () => {
    const edits: RosterEdit[] = [
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' },
      { kind: 'rename', managerId: 'op002', name: 'Федоров Иван Сергеевич' },
    ];
    // Another admin fired op001 on 09.10 meanwhile.
    const changed = apply([{ kind: 'fire', managerId: 'op001', date: '2026-10-09' }]).config;
    const r = apply(edits, changed);
    expect(r.problems.map((p) => p.index)).toEqual([0]);
    expect(mgr(r.config, 'op002')?.fullName).toBe('Федоров Иван Сергеевич');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/roster.test.ts` — Expected: FAIL, «Cannot find
  module '../../../src/admin/roster.ts'».

- [ ] **Step 3: Implement.** In `src/import/apply.ts` rename `nextId` to an exported `nextManagerId`
  (one call site there). `src/admin/roster.ts`:

```ts
import { SeasonConfigSchema, type Manager, type Membership, type SeasonConfig, type Team } from '../data/schemas/season.ts';
import { addDays } from '../engine/dates.ts';
import { nextManagerId } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import { cleanName, normalizeName } from '../import/match.ts';
import { schemaProblem } from './session.ts';

/**
 * The roster and the teams as a batch of edits (ADM-ROSTER, plan 2b-1): an edit is a value, the batch a
 * list applied in order to the season config. An edit that does not apply is named in `problems` and
 * skipped; the rest still apply — so the same list can be applied again to a season another admin
 * changed meanwhile (ADM-2). Pure.
 */

export type Norms = Record<string, number>;
export type RosterEdit = /* as in Interfaces */;
export type RosterResult = /* as in Interfaces */;

/** One edit that does not apply, in words for the admin. */
class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused(message);
};

/** A team as the admin sees it: its group's code (`СР5`), else its leader. */
export function teamLabel(team: Team): string {
  return team.sourceCode ?? team.leaderName;
}

type Ctx = { config: SeasonConfig; refs: Map<string, string> };

const lastTeamId = (m: Manager) => (m.memberships[m.memberships.length - 1] as Membership).teamId;

function managerOf(ctx: Ctx, id: string): Manager {
  const real = ctx.refs.get(id) ?? id;
  return (
    ctx.config.managers.find((m) => m.id === real) ??
    refuse('этого оператора нет в составе — возможно, его уже убрали')
  );
}

function teamOf(config: SeasonConfig, id: string): Team {
  return config.teams.find((t) => t.id === id) ?? refuse('этой команды нет в игре');
}

/** A day of the game: before the start — the start; after the end — refused. */
function gameDate(config: SeasonConfig, date: string, what: string): string {
  if (date > config.period.end)
    refuse(`${what} ${dayMonth(date)} — после конца игры (${dayMonth(config.period.end)})`);
  return date < config.period.start ? config.period.start : date;
}

/** No two operators share a name or an alias (case, spaces, ё/е and NFC aside). */
function unique(config: SeasonConfig, name: string, exceptId?: string): void {
  const norm = normalizeName(name);
  const other = config.managers.find(
    (m) => m.id !== exceptId && [m.fullName, ...m.aliases].some((n) => normalizeName(n) === norm),
  );
  if (other)
    refuse(`такой оператор уже есть: ${other.fullName} (${teamLabel(teamOf(config, lastTeamId(other)))})`);
}

function checkNorms(config: SeasonConfig, norms: Norms): Norms {
  return Object.fromEntries(
    config.metrics.map((m) => {
      const v = norms[m.id];
      if (v === undefined || !Number.isFinite(v) || v < 0) refuse(`норматив «${m.title}» — число от 0`);
      return [m.id, v as number];
    }),
  );
}

const withManager = (config: SeasonConfig, m: Manager): SeasonConfig => ({
  ...config,
  managers: config.managers.map((x) => (x.id === m.id ? m : x)),
});

function applyOne(ctx: Ctx, edit: RosterEdit): SeasonConfig {
  const c = ctx.config;
  switch (edit.kind) {
    case 'add': {
      const name = cleanName(edit.name);
      if (!name) refuse('у нового оператора нет ФИО');
      unique(c, name);
      teamOf(c, edit.teamId);
      const dailyNorms = checkNorms(c, edit.norms);
      const from = gameDate(c, edit.from, 'приход');
      const id = nextManagerId(c.managers);
      ctx.refs.set(edit.ref, id);
      const added: Manager = { id, fullName: name, aliases: [], dailyNorms, memberships: [{ teamId: edit.teamId, from }] };
      return { ...c, managers: [...c.managers, added] };
    }
    case 'rename': {
      const m = managerOf(ctx, edit.managerId);
      const name = cleanName(edit.name);
      if (!name) refuse('ФИО не может быть пустым');
      if (name === m.fullName) refuse('ФИО не изменилось');
      unique(c, name, m.id);
      const norm = normalizeName(name);
      const aliases = m.aliases.filter((a) => normalizeName(a) !== norm);
      // A spelling fix (ё, case) keeps no alias: imports know both spellings anyway.
      const old = normalizeName(m.fullName);
      if (old !== norm && !aliases.some((a) => normalizeName(a) === old)) aliases.push(m.fullName);
      return withManager(c, { ...m, fullName: name, aliases });
    }
    case 'transfer': {
      const m = managerOf(ctx, edit.managerId);
      teamOf(c, edit.teamId);
      const from = gameDate(c, edit.from, 'перевод');
      if (m.firedAt !== undefined && from > m.firedAt)
        refuse(`${m.fullName}: увольнение с ${dayMonth(m.firedAt)} — перевод после него не нужен`);
      const first = m.memberships[0] as Membership;
      const kept = m.memberships.filter((p) => p.from < from);
      const last = kept[kept.length - 1];
      if (!last) {
        if (first.teamId === edit.teamId) refuse(`${m.fullName} уже в этой команде`);
        return withManager(c, { ...m, memberships: [{ teamId: edit.teamId, from: first.from }] });
      }
      const open = last.to === undefined || last.to >= from;
      if (open && last.teamId === edit.teamId) refuse(`${m.fullName} уже в этой команде`);
      const closed = kept.map((p, i) =>
        i === kept.length - 1 && open ? { ...p, to: addDays(from, -1) } : p,
      );
      return withManager(c, { ...m, memberships: [...closed, { teamId: edit.teamId, from }] });
    }
    case 'norms': {
      const m = managerOf(ctx, edit.managerId);
      return withManager(c, { ...m, dailyNorms: checkNorms(c, edit.norms) });
    }
    case 'fire': {
      const m = managerOf(ctx, edit.managerId);
      if (m.firedAt !== undefined)
        refuse(`${m.fullName}: увольнение уже записано — с ${dayMonth(m.firedAt)}`);
      if (edit.date > c.period.end)
        refuse(`увольнение ${dayMonth(edit.date)} — после конца игры (${dayMonth(c.period.end)})`);
      const first = m.memberships[0] as Membership;
      if (edit.date < first.from)
        refuse(`${m.fullName}: увольнение ${dayMonth(edit.date)} раньше прихода в команду (${dayMonth(first.from)})`);
      const reason = edit.reason?.trim();
      return withManager(c, { ...m, firedAt: edit.date, ...(reason ? { firedReason: reason } : {}) });
    }
    case 'unfire': {
      const m = managerOf(ctx, edit.managerId);
      if (m.firedAt === undefined) refuse(`${m.fullName}: увольнения нет — возвращать нечего`);
      const back: Manager = { ...m };
      delete back.firedAt;
      delete back.firedReason;
      return withManager(c, back);
    }
    case 'team':
    case 'order':
      return applyTeamEdit(c, edit); // Task 2
  }
}
```

  `applyRosterEdits` collects a line per edit (`lineOf`, below), applies each edit in a `try`, catches only
  `Refused` into `problems`, then validates the result with `SeasonConfigSchema.safeParse` (a failure is
  `{ index: -1, message: 'состав не проходит проверку: ' + schemaProblem(error) }` and the original
  config is returned). Warnings come in Task 2 (`[]` here). `lineOf(ctx, edit)` is computed before the
  edit applies, from the config at that point (`who(id)` resolves refs; unknown → `оператор <id>`;
  `team(id)` → `teamLabel`; norms joined as `toLocaleString('ru-RU')` with « / »):
  `Новый: <name> → <team> с <dd.mm>` (the date clamped to the start), `ФИО: <old> → <new>`,
  `Перевод: <name> → <team> с <dd.mm>`, `Нормативы: <name> — 3 / 1,5 / 0,2`,
  `Увольнение: <name> с <dd.mm>` + ` (<reason>)` when given, `Возврат: <name>`. In Task 1 `applyTeamEdit`
  is a stub that refuses «правка команд — в следующей задаче»; Task 2 replaces it.

- [ ] **Step 4: Run** `npx vitest run tests/unit/admin/roster.test.ts tests/unit/import` — Expected: PASS
  (the import's tests still green after the rename of `nextId`).

- [ ] **Step 5: Commit** «Admin: roster edits as data — add, rename, transfer, norms, fire, return
  applied as a batch, each refused edit named (ADM-ROSTER-2, ADM-ROSTER-3, R-1, plan 2b-1 task 1)».

### Task 2: Team edits, warnings, lines and the public message

**Где смотреть:** спецификация 2б-1 §2–§3; DECISIONS D-41 (герои, `VARIANTS`), D-51 (публичные подписи);
код `src/scene/heroCatalog.ts`, `src/text.ts` (`plural`), `src/admin/importStep.ts`
(`importCommitMessage` — образец подписи); навигатор §3, §7.

**Files:**
- Modify: `src/admin/roster.ts`
- Test: `tests/unit/admin/roster.test.ts`

**Interfaces:**
- Consumes: Task 1 (`applyRosterEdits`, `teamLabel`, `RosterEdit`); `VARIANTS` (`src/scene/heroCatalog.ts`);
  `plural` (`src/text.ts`).
- Produces:
  ```ts
  export const SIMILAR_COLOR_DELTA_E = 30;
  export function similarColors(a: string, b: string): boolean; // CIE76 ΔE in Lab < 30
  export function rosterCommitMessage(edits: RosterEdit[]): string; // public: counts only
  ```

- [ ] **Step 1: Failing tests** (append to `roster.test.ts`; import `rosterCommitMessage`,
  `similarColors`):

```ts
describe('team edits, warnings and the message (plan 2b-1)', () => {
  it('a team: leader, colour (upper case), hero; nothing changed or no leader is a problem', () => {
    const r = apply([
      { kind: 'team', teamId: 't3', leaderName: ' Дарья Волкова ', color: '#1e90ff', characterId: 'mage-book' },
      { kind: 'team', teamId: 't2', leaderName: '  ' },
      { kind: 'team', teamId: 't2', color: '#29335C' },
    ]);
    expect(r.config.teams.find((t) => t.id === 't3')).toMatchObject({
      leaderName: 'Дарья Волкова',
      color: '#1E90FF',
      characterId: 'mage-book',
    });
    expect(r.problems).toEqual([
      { index: 1, message: 'у команды СР5 должен быть руководитель' },
      { index: 2, message: 'в команде СР5 ничего не изменилось' },
    ]);
    expect(r.lines[0]).toBe('Команда СР9: руководитель Дарья Волкова, цвет, герой');
  });

  it('the order: every team once gives order 1…n; another list is a problem', () => {
    const r = apply([
      { kind: 'order', teamIds: ['t3', 't1', 't2'] },
      { kind: 'order', teamIds: ['t1', 't1', 't2'] },
    ]);
    expect(r.config.teams.map((t) => [t.id, t.order])).toEqual([['t1', 2], ['t2', 3], ['t3', 1]]);
    expect(r.problems).toEqual([
      { index: 1, message: 'порядок должен перечислить все команды по одному разу' },
    ]);
    expect(r.lines[0]).toBe('Порядок команд: СР9, СР1, СР5');
  });

  it('close colours by ΔE: two yellows or two greens, never two of the demo six', () => {
    expect(similarColors('#FFD700', '#FFC107')).toBe(true);
    expect(similarColors('#4C956C', '#2E8B57')).toBe(true);
    const demo = ['#E4572E', '#29335C', '#F3A712', '#669BBC', '#4C956C', '#8E5572'];
    for (const a of demo) for (const b of demo) if (a !== b) expect(similarColors(a, b)).toBe(false);
  });

  it('warns about a new colour close to another team, and about all-zero norms', () => {
    const r = apply([
      { kind: 'team', teamId: 't2', color: '#E5582F' },
      { kind: 'norms', managerId: 'op002', norms: { inv6: 0, inv20: 0, pay: 0 } },
    ]);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([
      'цвет СР5 похож на СР1',
      'у Федоров Иван нормативы нулевые — цели команде это не добавит',
    ]);
  });

  it('the commit message counts, never names', () => {
    const edits: RosterEdit[] = [
      { kind: 'add', ref: 'new-1', name: 'Новикова Фёкла', teamId: 't2', from: '2026-10-12', norms: NORMS },
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' },
      { kind: 'transfer', managerId: 'op002', teamId: 't3', from: '2026-10-12' },
      { kind: 'fire', managerId: 'op001', date: '2026-10-14' },
      { kind: 'unfire', managerId: 'op003' },
      { kind: 'rename', managerId: 'op002', name: 'Федоров Иван Сергеевич' },
      { kind: 'norms', managerId: 'op002', norms: NORMS },
      { kind: 'team', teamId: 't2', color: '#123456' },
      { kind: 'team', teamId: 't3', leaderName: 'Дарья Волкова' },
      { kind: 'team', teamId: 't3', color: '#654321' },
      { kind: 'order', teamIds: ['t3', 't1', 't2'] },
    ];
    expect(rosterCommitMessage(edits)).toBe(
      'состав: 1 новый, 2 перевода, 1 увольнение, 1 возврат, 1 переименование, 1 смена нормативов; команды: 2 изменены, порядок',
    );
    expect(rosterCommitMessage([{ kind: 'team', teamId: 't2', color: '#123456' }])).toBe('команды: 1 изменена');
    expect(rosterCommitMessage([{ kind: 'order', teamIds: ['t1', 't2', 't3'] }])).toBe('команды: порядок');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/roster.test.ts` — Expected: FAIL (the stub refuses
  team edits; `similarColors`, `rosterCommitMessage` not exported).

- [ ] **Step 3: Implement** in `roster.ts`:

```ts
/** Team edits (the leader, the colour, the hero) and the order of the cards. */
function applyTeamEdit(c: SeasonConfig, edit: Extract<RosterEdit, { kind: 'team' | 'order' }>): SeasonConfig {
  if (edit.kind === 'order') {
    const ids = c.teams.map((t) => t.id);
    if (edit.teamIds.length !== ids.length || !ids.every((id) => edit.teamIds.includes(id)))
      refuse('порядок должен перечислить все команды по одному разу');
    return { ...c, teams: c.teams.map((t) => ({ ...t, order: edit.teamIds.indexOf(t.id) + 1 })) };
  }
  const t = teamOf(c, edit.teamId);
  const next = { ...t };
  if (edit.leaderName !== undefined) {
    const v = edit.leaderName.trim();
    if (!v) refuse(`у команды ${teamLabel(t)} должен быть руководитель`);
    next.leaderName = v;
  }
  if (edit.color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(edit.color)) refuse('цвет — в формате #RRGGBB');
    next.color = edit.color.toUpperCase();
  }
  if (edit.characterId !== undefined) {
    if (!VARIANTS.some((v) => v.id === edit.characterId)) refuse('такого героя нет');
    next.characterId = edit.characterId;
  }
  if (next.leaderName === t.leaderName && next.color === t.color.toUpperCase() && next.characterId === t.characterId)
    refuse(`в команде ${teamLabel(t)} ничего не изменилось`);
  return { ...c, teams: c.teams.map((x) => (x.id === t.id ? next : x)) };
}

/** A team colour this close to another's reads as the same on the board (CIE76 ΔE in Lab). */
export const SIMILAR_COLOR_DELTA_E = 30;

function lab(hex: string): [number, number, number] {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function similarColors(a: string, b: string): boolean {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) < SIMILAR_COLOR_DELTA_E;
}
```

  Warnings (only for edits that applied): every team whose colour the batch set, against each other team
  — `цвет <label> похож на <other label>`; every `add` or `norms` whose norms are all 0 —
  `у <name> нормативы нулевые — цели команде это не добавит`. `lineOf` for teams:
  `Команда <label>: ` + the changed fields joined by «, » (`руководитель <name>`, `цвет`, `герой`);
  `Порядок команд: <labels in the new order>`. `rosterCommitMessage`: the counts by kind with
  `plural` — `новый/новых/новых`, `перевод/перевода/переводов`, `увольнение/увольнения/увольнений`,
  `возврат/возврата/возвратов`, `переименование/переименования/переименований`,
  `смена нормативов/смены нормативов/смен нормативов` under `состав: `; the distinct teams of `team`
  edits `изменена/изменены/изменены` and `порядок` under `команды: `; zero counts left out; the two
  parts joined by `; `.

- [ ] **Step 4: Run** `npx vitest run tests/unit/admin/roster.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** «Admin: team edits, close-colour and zero-norm warnings, lines for the screen
  and a public message of counts (D-41, D-51, plan 2b-1 task 2)».

### Task 3: The step of a batch — preview, people per team, the draft's helpers

**Где смотреть:** спецификация 2б-1 §3; код `src/admin/importStep.ts` (`prepareImport` — образец),
`src/admin/pipeline.ts` (`previewChange`, `commitChange`), `src/engine/roster.ts` (`membersOn`),
`tests/unit/admin/importStep.test.ts` (состояние демо из поддельного GitHub); навигатор §3.

**Files:**
- Create: `src/admin/rosterStep.ts`
- Modify: `src/text.ts` (`parseDecimal`)
- Test: `tests/unit/admin/rosterStep.test.ts`, `tests/unit/text.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `previewChange`, `Preview`, `RepoState`, `loadRepoState`, `commitChange`;
  `membersOn`.
- Produces:
  ```ts
  // src/admin/rosterStep.ts
  export type PeopleRow = { teamId: string; label: string; before: number; after: number };
  export type RosterStep = {
    state: RepoState; result: RosterResult; input: EngineInput;
    preview: Preview; people: PeopleRow[]; message: string;
  };
  export function gameDay(config: SeasonConfig, today: string): string; // today clamped to the game
  export function prepareRoster(state: RepoState, edits: RosterEdit[], opts: { today: string; now: string }): RosterStep;
  export function withEdit(edits: RosterEdit[], edit: RosterEdit): RosterEdit[]; // a new order replaces the old
  export function withoutEdit(edits: RosterEdit[], index: number): RosterEdit[]; // a «Новый» takes its dependents
  // src/text.ts
  export function parseDecimal(text: string): number; // «1,5» and «1.5» → 1.5; anything else NaN
  ```

- [ ] **Step 1: Failing tests** — `tests/unit/admin/rosterStep.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import { commitChange, loadRepoState, type RepoState } from '../../../src/admin/pipeline.ts';
import type { RosterEdit } from '../../../src/admin/roster.ts';
import { gameDay, prepareRoster, withEdit, withoutEdit } from '../../../src/admin/rosterStep.ts';
import { FakeGitHubRepo } from '../../support/fakeGitHub.ts';

const DEMO = 'sales-quest-demo';
let fake: FakeGitHubRepo;
let state: RepoState;
beforeAll(async () => {
  fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  state = await loadRepoState(fake, DEMO, new Map());
});
const now = (day: string) => `${day}T12:00:00+03:00`;

describe('a roster batch from the screen to a commit (plan 2b-1)', () => {
  it('previews the people of each team on the day and writes a message of counts', () => {
    const { start } = state.input.config.period;
    const first = state.input.config.managers.find((m) => m.memberships[0]?.teamId === 't1');
    if (!first) throw new Error('в демо нет команды t1');
    const step = prepareRoster(state, [{ kind: 'fire', managerId: first.id, date: start }], {
      today: start,
      now: now(start),
    });
    const t1 = step.people.find((p) => p.teamId === 't1');
    expect(t1 && t1.before - t1.after).toBe(1);
    expect(step.people.filter((p) => p.before !== p.after)).toHaveLength(1);
    expect(step.preview.teams).toHaveLength(6);
    expect(step.message).toBe('состав: 1 увольнение');
    expect(step.state).toBe(state);
  });

  it('today before the start counts people on the first day; after the end, on the last', () => {
    const { start, end } = state.input.config.period;
    expect(gameDay(state.input.config, '2026-01-01')).toBe(start);
    expect(gameDay(state.input.config, '2030-01-01')).toBe(end);
  });

  it('a new order replaces the previous one in the batch', () => {
    const a: RosterEdit = { kind: 'order', teamIds: ['t2', 't1', 't3', 't4', 't5', 't6'] };
    const b: RosterEdit = { kind: 'order', teamIds: ['t3', 't1', 't2', 't4', 't5', 't6'] };
    const fire: RosterEdit = { kind: 'fire', managerId: 'm01', date: '2026-10-12' };
    expect(withEdit(withEdit([a, fire], b), fire)).toEqual([fire, b, fire]);
  });

  it('removing a new operator removes the edits that refer to him', () => {
    const add: RosterEdit = { kind: 'add', ref: 'new-1', name: 'Аа Аа', teamId: 't1', from: '2026-10-12', norms: {} };
    const rename: RosterEdit = { kind: 'rename', managerId: 'new-1', name: 'Аа Бб' };
    const other: RosterEdit = { kind: 'fire', managerId: 'm02', date: '2026-10-12' };
    expect(withoutEdit([add, rename, other], 0)).toEqual([other]);
    expect(withoutEdit([add, rename, other], 1)).toEqual([add, other]);
  });

  it('the commit carries the config only — the import log untouched', async () => {
    const own = FakeGitHubRepo.fromDir(DEMO_DATA);
    const s = await loadRepoState(own, DEMO, new Map());
    const step = prepareRoster(s, [{ kind: 'team', teamId: 't4', color: '#123456' }], {
      today: s.input.config.period.start,
      now: now(s.input.config.period.start),
    });
    await commitChange(own, step.state, step.input, {
      phrase: DEMO, keys: new Map(), message: step.message, by: 'k', now: now(s.input.config.period.start),
    });
    const changed = [...own.last.files].filter(([p, t]) => own.commits[0]?.files.get(p) !== t).map(([p]) => p);
    expect(changed.sort()).toEqual(['data/seasons/demo/config.enc.json', 'data/version.json']);
  });
});
```

  And in `tests/unit/text.test.ts`:

```ts
describe('a number typed in a form', () => {
  it('reads a decimal with a comma or a point', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal(' 0.2 ')).toBe(0.2);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('два')).toBeNaN();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/rosterStep.test.ts tests/unit/text.test.ts` —
  Expected: FAIL (modules and `parseDecimal` missing).

- [ ] **Step 3: Implement.** `prepareRoster`: `result = applyRosterEdits(state.input.config, edits)`,
  `input = { ...state.input, config: result.config }`, `day = gameDay(result.config, opts.today)`,
  `people` — the teams by `order`, `label: teamLabel(t)`, `before/after: membersOn(<managers>, t.id,
  day).length`, `preview: previewChange(state.input, input, opts.now)`, `message:
  rosterCommitMessage(<edits without problems>)`, `state` as given. `withEdit`: an `order` edit
  replaces the batch's earlier `order`. `withoutEdit`: removes the edit at `index`; if it is an `add`,
  also every edit whose `managerId` is its `ref`. `parseDecimal`: trim, `,` → `.`, empty → `NaN`,
  `Number(...)`.

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** «Admin: the step of a roster batch — the preview, the people per team on a day
  of the game, the draft's helpers, decimals with a comma (ADM-PREVIEW, plan 2b-1 task 3)».

### Task 4: The admin's errors in words — GitHub's answers and the network

**Где смотреть:** спецификация 2б-1 §4; BACKLOG «Этап 2» (отложенное из ревью 2а: ошибки GitHub, тексты
ошибок); код `src/admin/github.ts`, `src/admin/session.ts` (`adminMessage`), `src/import/funnel.ts`
(текст про блок); тесты `tests/unit/admin/github.test.ts` (заглушка `fetch`); навигатор §3.

**Files:**
- Modify: `src/admin/github.ts`, `src/admin/session.ts`, `src/import/funnel.ts`
- Test: `tests/unit/admin/github.test.ts`, `tests/unit/admin/session.test.ts`,
  `tests/unit/import/funnel.test.ts`

**Interfaces:**
- Produces (in `github.ts`): `class NetworkError extends Error` («нет связи с GitHub — проверьте
  интернет и попробуйте ещё раз»), `class RateLimitError extends Error` («GitHub просит подождать: лимит
  запросов, попробуйте через минуту»), `class RefusedError extends Error` (`GitHub отказал: <message>`).

- [ ] **Step 1: Failing tests** (in `github.test.ts`, with its `stub` and `REF`):

```ts
it('a 422 that is not about a fast forward is GitHub refusing, in its words — not a conflict', async () => {
  const { fetchFn } = stub({
    'GET /repos/o/r/git/commits/base1': () => ({ json: { tree: { sha: 't' } } }),
    'POST /repos/o/r/git/blobs': () => ({ status: 201, json: { sha: 'b' } }),
    'POST /repos/o/r/git/trees': () => ({ status: 201, json: { sha: 't2' } }),
    'POST /repos/o/r/git/commits': () => ({ status: 201, json: { sha: 'n' } }),
    'PATCH /repos/o/r/git/refs/heads/main': () => ({ status: 422, json: { message: 'Protected branch update failed' } }),
  });
  const repo = new HttpGitHubRepo('tok', REF, fetchFn);
  await expect(repo.commit('base1', new Map([['data/a.json', 'A']]), 'm')).rejects.toThrow(
    'GitHub отказал: Protected branch update failed',
  );
});

it('a 403 of the rate limit asks to wait, not «no rights»', async () => {
  const { fetchFn } = stub({
    'GET /repos/o/r/git/ref/heads/main': () => ({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
  });
  await expect(new HttpGitHubRepo('tok', REF, fetchFn).head()).rejects.toBeInstanceOf(RateLimitError);
});

it('a token without access to the repository says so at the login', async () => {
  const { fetchFn } = stub({ 'GET /user': () => ({ json: { login: 'k' } }) }); // the repo: 404
  await expect(new HttpGitHubRepo('tok', REF, fetchFn).whoAmI()).rejects.toThrow(
    /нет доступа к репозиторию sales-quest/,
  );
});

it('a network failure is NetworkError', async () => {
  const fetchFn = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
  await expect(new HttpGitHubRepo('tok', REF, fetchFn).head()).rejects.toBeInstanceOf(NetworkError);
});
```

  In `session.test.ts`: `expect(adminMessage(new TypeError('x is undefined'))).toBe('x is undefined')`
  (a bug is shown as it is); `expect(adminMessage(new NetworkError())).toMatch(/нет связи/)`. In
  `funnel.test.ts` («a missing block is an error naming it»): the message also matches
  `/сообщите разработчику/`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin tests/unit/import/funnel.test.ts` — Expected: the
  new tests FAIL.

- [ ] **Step 3: Implement.** In `call()`: `fetchFn` in a `try` — a `TypeError` becomes `NetworkError`;
  a 403 with `x-ratelimit-remaining: 0` is `RateLimitError` before the «нет прав» `AuthError`. In
  `commit()`: 409 → `ConflictError`; 422 → read `{ message }` — `/fast.?forward/i` → `ConflictError`,
  else `RefusedError(message)`. In `whoAmI()`: the repository answering 404 → `AuthError('у ключа нет
  доступа к репозиторию sales-quest: в настройках ключа выберите его в Repository access')`. In
  `adminMessage`: the `TypeError` → «нет связи» branch goes (the client throws `NetworkError` itself).
  In `funnel.ts`: `…— формат выгрузки изменился, сообщите разработчику`.

- [ ] **Step 4: Run** `npm test` — Expected: PASS (the fake GitHub of e2e answers a moved branch with
  «Update is not a fast forward», a conflict as before).

- [ ] **Step 5: Commit** «Admin: GitHub's answers in words — a refusal is not a conflict, a rate limit is
  not «no rights», no access to the repository at the login, the network apart from bugs (review 2a)».

### Task 5: The screen «Состав и команды» and its first e2e test

**Где смотреть:** спецификация 2б-1 §1, §3; DECISIONS ADM-ROSTER-1…6, D-46 (стиль `sq-*`); код
`src/admin/AdminPage.tsx`, `Home.tsx`, `ImportFlow.tsx` (образец записи и конфликта), `NewGame.tsx`
(`HERO_TITLES`, `COLORS`), `PreviewTable.tsx`, `Publishing.tsx`, `src/hud/Crest.tsx`,
`src/engine/roster.ts` (`teamOn`, `isFiredOn`); `tests/e2e/admin.spec.ts`,
`tests/support/fakeGitHub.ts`; навигатор §3, §11.

**Files:**
- Create: `src/admin/Roster.tsx` (the screen), `src/admin/RosterForms.tsx` (the forms),
  `src/admin/RosterDraft.tsx` (the batch, preview, «Записать»), `src/admin/teamOptions.ts`
  (`HERO_TITLES`, `TEAM_COLORS` moved from `NewGame.tsx`)
- Modify: `src/admin/AdminPage.tsx`, `src/admin/Home.tsx`, `src/admin/ImportFlow.tsx`,
  `src/admin/NewGame.tsx`
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `commitChange`, `loadRepoState`, `ConflictError`, `Publishing`, `Crest`,
  `teamOn`, `isFiredOn`, `localDate`, `localTimestamp`, `parseDecimal`.
- Produces: `Roster({ session, edits, onEdits, onState, onCancel, onCommitted })`; AdminPage holds the
  batch (`RosterEdit[]`) so it survives a visit to another view.

- [ ] **Step 1: Failing e2e test** (in `tests/e2e/admin.spec.ts`; add `loadRepoState` import from
  `../../src/admin/pipeline.ts`):

```ts
test('«Состав и команды»: a firing, a transfer, a new operator and a colour are one commit of counts (ADM-ROSTER)', async ({ page }) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  const roster = page.getByTestId('roster');
  const alina = roster.getByRole('region', { name: 'Команда Алина Смирнова' });
  await alina.getByText(/^Операторы/).click();
  const [fired, moved] = (await alina.getByTestId('operator-name').allTextContents()) as [string, string];

  await alina.getByRole('button', { name: `Уволить: ${fired}` }).click();
  await page.getByLabel('Дата увольнения', { exact: true }).fill('2026-10-12');
  await page.getByLabel('Причина', { exact: true }).fill('тест');
  await page.getByRole('button', { name: 'В изменения' }).click();

  await alina.getByRole('button', { name: `Изменить: ${moved}` }).click();
  await page.getByLabel('Команда', { exact: true }).selectOption({ label: 'Борис Кузнецов' });
  await page.getByLabel('Дата перевода', { exact: true }).fill('2026-10-12');
  await page.getByRole('button', { name: 'В изменения' }).click();

  await roster.getByRole('button', { name: 'Добавить оператора' }).click();
  await page.getByLabel('ФИО', { exact: true }).fill('Тестов Новичок');
  await page.getByLabel('Команда', { exact: true }).selectOption({ label: 'Вера Соколова' });
  await page.getByLabel('С какого дня', { exact: true }).fill('2026-10-12');
  await page.getByRole('button', { name: 'В изменения' }).click();

  await roster
    .getByRole('region', { name: 'Команда Глеб Морозов' })
    .getByRole('button', { name: 'Изменить команду' })
    .click();
  await page.getByLabel('Цвет', { exact: true }).fill('#123456');
  await page.getByRole('button', { name: 'В изменения' }).click();

  const draft = page.getByTestId('roster-draft');
  await expect(draft.getByRole('listitem')).toHaveCount(4);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('roster-preview')).toBeVisible();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect(fake.last.message).toBe(
    'data(demo): состав: 1 новый, 1 перевод, 1 увольнение; команды: 1 изменена [by koordinator]',
  );
  const after = (await loadRepoState(fake, DEMO, new Map())).input.config;
  const by = (name: string) => after.managers.find((m) => m.fullName === name);
  expect(by(fired)?.firedAt).toBe('2026-10-12');
  expect(by(moved)?.memberships.at(-1)).toEqual({ teamId: 't2', from: '2026-10-12' });
  expect(by('Тестов Новичок')?.memberships).toEqual([{ teamId: 't3', from: '2026-10-12' }]);
  expect(after.teams.find((t) => t.leaderName === 'Глеб Морозов')?.color).toBe('#123456');
  await expect(draft.getByRole('listitem')).toHaveCount(0);
});
```

- [ ] **Step 2: Run** `npx playwright test tests/e2e/admin.spec.ts --project=e2e -g "Состав"` —
  Expected: FAIL (no «Состав и команды» button).

- [ ] **Step 3: Implement.**
  - `teamOptions.ts`: `HERO_TITLES`, `TEAM_COLORS` moved out of `NewGame.tsx` (which imports them).
  - `Home.tsx`: a button «Состав и команды» (`onRoster`).
  - `AdminPage.tsx`: view `'roster'`; the batch `useState<RosterEdit[]>([])`; `setError(null)` on every
    change of view and after a successful reload; after a roster commit the batch empties and the
    banner `Publishing` (keyed by rev) shows.
  - `Roster.tsx` (`data-testid="roster"`): `step = prepareRoster(session.state, edits, { today:
    localDate(new Date()), now: localTimestamp(new Date()) })` on every render; the shown season is
    `step.result.config` (the batch applied, so a pending change is visible). For each team by `order`:
    `<section aria-label={'Команда ' + leaderName}>` with `Crest`, the plate text
    `plateName(leaderName, sourceCode)`, the hero's title, `N чел.` (`membersOn` on `gameDay`),
    buttons «Изменить команду», «↑», «↓» (`aria-label` «Выше: <label>» / «Ниже: <label>»), and
    `<details><summary>Операторы (N)</summary>` listing operators whose `teamOn(m, day)` is the team and
    who are not fired on that day, sorted by name: `<span data-testid="operator-name">`, norms
    `3 / 1,5 / 0,2`, «с dd.mm», «увольнение с dd.mm» when fired later, buttons «Изменить: <ФИО>»,
    «Уволить: <ФИО>». Below: «Добавить оператора» and «Уволенные» (each with «Вернуть: <ФИО>»).
    Ids of new operators in the batch are refs (`new-1`…) from a `useRef` counter that never repeats.
  - `RosterForms.tsx`: one form open at a time, each with «В изменения» and «Отмена»:
    - operator: «ФИО» (text), «Команда» (`select`, options labelled by the leader's name), «Дата
      перевода» (shown when the team changes; default `gameDay(today)`), a text input per metric
      labelled by its title (`parseDecimal`); yields the changed fields as edits (`rename`, `transfer`,
      `norms`);
    - fire: «Дата увольнения» (default `gameDay(today)`), «Причина» (optional);
    - add: «ФИО», «Команда», «С какого дня» (default `gameDay(today)`), the norms
      (`defaultDailyNorms`, else `DEFAULT_NORMS`);
    - team: «Руководитель», «Цвет» (`input type="color"`), «Герой» (`VARIANTS` with `HERO_TITLES`);
      yields one `team` edit with the changed fields only;
    - «↑»/«↓» yield an `order` edit through `withEdit`.
  - `RosterDraft.tsx` (`data-testid="roster-draft"`, shown when the batch is not empty): «Несохранённые
    изменения (N)»; a `<li>` per line of `step.result.lines` with «×» (`aria-label` «Убрать: <line>»,
    `withoutEdit`); a line with a problem in the alarm colour with the message under it (`role="alert"`);
    the warnings as a plate; «Показать превью» shows (`data-testid="roster-preview"`) the people per team
    «было → станет» and the teams' cells «было → станет» with the top 10 (`PreviewTable`'s tables), the
    public message under «Подпись в истории»; the preview hides when the batch changes (it remembers the
    batch it was made for). «Записать» (`data-testid="roster-commit"`) — enabled only with the preview
    shown and no problems: `commitChange(session.repo, step.state, step.input, { message: step.message,
    … })`; `'unchanged'` → «Нечего записывать»; done → `onEdits([])`, `onCommitted(rev)`; a
    `ConflictError` → `loadRepoState` → `onState(fresh)` and its message as a note (the step is
    recomputed on the fresh state: lines that no longer apply turn red).
  - `ImportFlow.tsx`: «Назад» disabled while `busy`.

- [ ] **Step 4: Run** `npx playwright test tests/e2e/admin.spec.ts --project=e2e` — Expected: all admin
  tests PASS; `npm run typecheck && npm run lint && npm test` — PASS.

- [ ] **Step 5: Commit** «Admin: the screen «Состав и команды» — teams and operators, the forms, the batch
  with a preview and one commit (ADM-ROSTER-1…6, ADM-PREVIEW, ADM-3, plan 2b-1 task 5)».

### Task 6: A conflict re-applies the batch; the whole suite; screenshots for the author

**Где смотреть:** спецификация 2б-1 §3, §5; SPEC ADM-2; код `tests/support/fakeGitHub.ts`
(`beforeMove`, `advance`), `tests/e2e/admin.spec.ts` («the branch moved…» из 2а); CLAUDE.md «Проверка»;
навигатор §14.

**Files:**
- Test: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: The e2e test** (it must pass on the code of Task 5; a mutation check proves it bites —
  make `RosterDraft` commit on `session.state` instead of `step.state`, see it fail, restore):

```ts
test('«данные изменились» between the preview and «Записать»: the batch is applied again and written (ADM-2)', async ({ page }) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  let other = true;
  await login(page, fake, {
    beforeMove: () => {
      if (other) fake.advance();
      other = false;
    },
  });
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  await page
    .getByTestId('roster')
    .getByRole('region', { name: 'Команда Егор Лебедев' })
    .getByRole('button', { name: 'Изменить команду' })
    .click();
  await page.getByLabel('Цвет', { exact: true }).fill('#123456');
  await page.getByRole('button', { name: 'В изменения' }).click();
  const draft = page.getByTestId('roster-draft');
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByRole('status').filter({ hasText: 'данные изменились' })).toBeVisible();
  expect(fake.commits.map((c) => c.message)).toEqual(['начало', 'другой админ']);
  await expect(draft.getByRole('listitem')).toHaveCount(1);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
  expect(fake.commits).toHaveLength(3);
  expect(fake.last.parent).toBe('c1');
  expect(fake.last.message).toBe('data(demo): команды: 1 изменена [by koordinator]');
});
```

- [ ] **Step 2: Run** `npx playwright test tests/e2e/admin.spec.ts --project=e2e` — Expected: PASS; the
  mutation — FAIL; restored — PASS.

- [ ] **Step 3: The whole suite** — `npm run typecheck && npm run lint && npm test && npm run test:e2e`
  (QA-4 unchanged: the admin is not in the viewer's chunk); `npm run build && npm run size` — the initial
  JS unchanged.

- [ ] **Step 4: Screenshots** with a temporary spec `tests/e2e/zz-roster.spec.ts` (never committed): the
  screen with a team open, a form, the batch with a red line and a warning, the preview — sent to the
  author.

- [ ] **Step 5: Commit** «e2e: the roster batch re-applied after «данные изменились» (ADM-2, plan 2b-1
  task 6)».

### Task 7: Docs, the review, the report, the push

**Где смотреть:** CLAUDE.md (текущий этап), `docs/NAVIGATOR.md` §3 и §16, `docs/BACKLOG.md` «Этап 2»,
`docs/DECISIONS.md` D-51.

- [ ] DECISIONS: **D-52** — the roster as a batch of edits re-applied after a conflict; a transfer
  closes the old team on X − 1 and drops later memberships; the firing day counts in the team, off the
  leaderboard from it; a rename keeps the old name as an alias unless it only fixes the spelling; new
  people of a batch are refs; the close-colour warning (CIE76 ΔE < 30); the public message of counts;
  GitHub's answers in words. NAVIGATOR §3 (the roster: where to look), §16 (2b-1 done, 2b-2 next).
  BACKLOG «Этап 2»: the done items of the 2a review out; «Дальше — 2б» split into 2b-2 and 2b-3.
  CLAUDE.md: the current stage line.
- [ ] An independent review of the plan's range (a subagent on the most capable model; it never opens
  the root `*.xlsx` or `refs/`), with this plan's Review Focus; Critical/Important fixed by TDD;
  minors to BACKLOG.
- [ ] A short report to the author in Russian (what is new, how to use it, what was decided); the push
  only after «да». The game's data are not touched by the push.
