# «Промежуточные итоги» — the intraday file: Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process: executing-plans
> with a ledger and TDD), an independent review subagent (opus) checks the whole plan at the end (Task 5).
> Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md`.

**Goal:** the coordinator uploads the intraday file «пром итоги» (groups and their operators in column A,
today's running totals of `inv6` in B and `inv20` in C, no dates) through the usual import; it is written for
the chosen day (by default today), replacing that day's `inv6` and `inv20` — so the figures move during the
day with today's animation of moves.

**Architecture:** a third kind of import profile, `list`, beside the funnel (`matrix`) and the paid invoices
(`events`): a pure parser `parseIntraday(grid, profile, day)` and a detector `looksLikeList` in a new
`src/import/intraday.ts`; the day is passed into the parse and can be changed on the import screen
(`onDay`). `applyImport` and the engine do not change. The new default profile is merged from the code
(`profilesFor`) and never written into the running game's config.

**Tech stack:** React 19, TypeScript 6 strict, zod 4, SheetJS 0.20.3 (admin worker and Node scripts only),
Vitest, Playwright 1.63; the import pipeline and the fake GitHub of stage 2 as they are.

**Spec:** `docs/superpowers/specs/2026-10-13-engagement-moments-design.md`, Part 0 (approved 13.10.2026);
DECISIONS D-19…D-22, D-51, OQ-12; `docs/IMPORT_FORMATS.md`.

**Refinements of the spec made here:**
- Detection looks at the first **20** rows (the window `parseWorkbook` already gives detection,
  `HEADER_SEARCH_ROWS`), not 30.
- A group's row is any row whose name matches `groupCode`; its own B and C are **not required to be empty**
  and are ignored — a group total the author may add later must not make the file «unknown».
- An operator listed twice in the file: the numbers are summed (as `applyImport` does for any file) and a
  warning names them.
- A cell must be empty or an integer ≥ 0 (a number, or digits stored as text); anything else stops the
  import with the row and the column only — never the name or the value (`check-exports` prints errors).
- A one-day period reads as one date: «импорт: промежуточные итоги 13.10, 49 операторов» (also for a
  one-day funnel or payments file).

## Global Constraints

- The engine (`src/engine`) and `applyImport` do not change.
- The running game's `config.importProfiles` is never rewritten by this work: viewers with older code parse
  the config with the kinds `matrix` and `events` only (an unknown `kind` would fail their schema).
- Public commit messages — counts and dates only, no names (D-51).
- No real names, exports or the real phrase in tests, fixtures or the repository; fixtures use the demo's
  invented names (`npm run make-fixtures`). The author's sample stays in their Downloads and is read only
  by `check-exports` (counts).
- SheetJS stays in the admin's worker and Node scripts (D-7a); the admin chunk stays lazy; the viewers'
  initial JS does not grow (`npm run size`).
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved, the
  push only after the author's «да» (D-3).

## Review Focus

1. **A cleared or outside «День»** on the import screen — no crash, no preview, a hint «укажите день игры» —
   Task 3 e2e steps «fill '' → hint, button disabled».
2. **An operator listed twice** — numbers summed, a warning with the name — Task 1 test «an operator listed
   twice».
3. **Digits stored as text, a fraction, a negative, a word** — read / stopped by row and column, never naming
   the person or the value — Task 1 tests «a number stored as text is read» and «stops … by row and column».
4. **A group row with its own numbers** (a total added later) — still a group, its numbers ignored, the file
   still recognised — Task 1 tests «a group row with a total» (parser and detector).
5. **The running game's config never gains the new profile** — the import commit leaves `importProfiles` as
   it was — Task 1 test of `profilesFor` and Task 3 e2e assertion on `importProfiles`.

---

### Task 1: The profile, the parser and the day (pure)

**Где смотреть:** спецификация Part 0; `docs/IMPORT_FORMATS.md` §1–3; код `src/data/schemas/importProfiles.ts`,
`src/import/profiles.ts`, `src/import/funnel.ts` (группы и операторы под ними), `src/import/grid.ts`
(`cellText`, `column`, `ImportError`), `src/import/parsed.ts`, `src/import/apply.ts` (не меняется); тесты
`tests/unit/import/funnel.test.ts`, `tests/unit/import/apply.test.ts`, хелперы `tests/support/grids.ts`,
`tests/support/builders.ts`.

**Files:**
- Modify: `src/data/schemas/importProfiles.ts` (the `list` kind)
- Modify: `src/import/profiles.ts` (`DEFAULT_INTRADAY`, `profilesFor`)
- Create: `src/import/intraday.ts` (`parseIntraday`, `looksLikeList`, `onDay`)
- Modify: `tests/support/grids.ts` (`intradayGrid`)
- Create: `tests/unit/import/intraday.test.ts`

**Interfaces:**
- Produces:
  - `IntradayProfile` type and `IntradayProfileSchema` (`kind: 'list'`), part of `ImportProfileSchema`;
  - `DEFAULT_INTRADAY: IntradayProfile` (id `intraday`), `DEFAULT_PROFILES = [DEFAULT_FUNNEL,
    DEFAULT_PAYMENTS, DEFAULT_INTRADAY]`;
  - `profilesFor(configured: ImportProfile[]): ImportProfile[]`;
  - `parseIntraday(grid: Grid, p: IntradayProfile, day: string): Parsed`;
  - `looksLikeList(rows: unknown[][], p: IntradayProfile): boolean`;
  - `onDay(parsed: Parsed, day: string): Parsed`;
  - test helper `intradayGrid(groups: IntradayGroup[]): Grid`.

- [ ] **Step 1: The grid helper** — append to `tests/support/grids.ts`:

```ts
export type IntradayPerson = { name: string; inv6?: number | string; inv20?: number | string };
export type IntradayGroup = {
  name: string;
  people: IntradayPerson[];
  /** The group row's own B and C (a total the author may add later); default — empty. */
  total?: [number, number];
};

/**
 * The intraday totals «Промежуточные итоги» (D-55): no header row; a group's row (its name with the code
 * inside, B and C empty), then its operators with `inv6` in B and `inv20` in C; an empty cell is ''.
 */
export function intradayGrid(groups: IntradayGroup[]): Grid {
  const rows: unknown[][] = [];
  for (const g of groups) {
    rows.push([g.name, g.total?.[0] ?? '', g.total?.[1] ?? '']);
    for (const p of g.people) rows.push([p.name, p.inv6 ?? '', p.inv20 ?? '']);
  }
  return rows;
}
```

- [ ] **Step 2: Write the failing tests** — `tests/unit/import/intraday.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { applyImport, type Resolution } from '../../../src/import/apply.ts';
import { ImportError } from '../../../src/import/grid.ts';
import { looksLikeList, onDay, parseIntraday } from '../../../src/import/intraday.ts';
import {
  DEFAULT_FUNNEL,
  DEFAULT_INTRADAY,
  DEFAULT_PAYMENTS,
  DEFAULT_PROFILES,
  ImportProfileSchema,
  profilesFor,
} from '../../../src/import/profiles.ts';
import { daily, makeConfig, manager, team } from '../../support/builders.ts';
import { intradayGrid } from '../../support/grids.ts';

const DAY = '2026-10-13';
const grid = intradayGrid([
  {
    name: 'Пл_НП_СР_Город_СР1_Входящие',
    people: [
      { name: 'Ершова Мария', inv6: 3, inv20: 1 },
      { name: 'Федоров Иван', inv6: '', inv20: '' },
    ],
  },
  { name: 'Пл_НП_СР_Город_СР5_Входящие', people: [{ name: 'Белова Анна', inv6: 2, inv20: 0 }] },
]);

describe('the intraday file «Промежуточные итоги» (D-55)', () => {
  it('reads operators under the group above them, for the given day; an empty cell is 0', () => {
    const parsed = parseIntraday(grid, DEFAULT_INTRADAY, DAY);
    expect(parsed).toEqual({
      profileId: 'intraday',
      metrics: ['inv6', 'inv20'],
      rows: [
        { name: 'Ершова Мария', group: 'СР1', date: DAY, values: { inv6: 3, inv20: 1 } },
        { name: 'Федоров Иван', group: 'СР1', date: DAY, values: { inv6: 0, inv20: 0 } },
        { name: 'Белова Анна', group: 'СР5', date: DAY, values: { inv6: 2, inv20: 0 } },
      ],
      period: [DAY, DAY],
      days: [DAY],
      groups: ['СР1', 'СР5'],
      people: [
        { name: 'Ершова Мария', group: 'СР1' },
        { name: 'Федоров Иван', group: 'СР1' },
        { name: 'Белова Анна', group: 'СР5' },
      ],
      warnings: [],
    });
  });

  it('a number stored as text is read; empty rows are skipped', () => {
    const rows = [['Группа СР2', '', ''], ['', '', ''], ['Ершова Мария', '4', ' 2 ']];
    expect(parseIntraday(rows, DEFAULT_INTRADAY, DAY).rows[0]?.values).toEqual({
      inv6: 4,
      inv20: 2,
    });
  });

  it('a group row with a total: still a group, its own numbers ignored', () => {
    const withTotal = intradayGrid([
      {
        name: 'СР1',
        total: [9, 9],
        people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }],
      },
    ]);
    const parsed = parseIntraday(withTotal, DEFAULT_INTRADAY, DAY);
    expect(parsed.rows).toEqual([
      { name: 'Ершова Мария', group: 'СР1', date: DAY, values: { inv6: 3, inv20: 1 } },
    ]);
    expect(looksLikeList(withTotal, DEFAULT_INTRADAY)).toBe(true);
  });

  it('stops on a negative, a fraction or a word — by row and column, never the name or the value', () => {
    for (const bad of [-1, 2.5, 'много']) {
      const rows = [['СР1', '', ''], ['Ершова Мария', 3, bad]];
      expect(() => parseIntraday(rows, DEFAULT_INTRADAY, DAY)).toThrow(ImportError);
      try {
        parseIntraday(rows, DEFAULT_INTRADAY, DAY);
      } catch (e) {
        const message = (e as Error).message;
        expect(message).toBe(
          'строка 2, столбец C: нужно целое число не меньше 0 или пустая ячейка — проверьте файл',
        );
        expect(message).not.toContain('Ершова');
      }
    }
  });

  it('stops on an operator above the first group, and on a file without operators', () => {
    expect(() => parseIntraday([['Ершова Мария', 3, 1]], DEFAULT_INTRADAY, DAY)).toThrow(
      'строка 1: оператор выше первой группы — над операторами должна быть строка группы с кодом вроде «СР1»',
    );
    expect(() => parseIntraday([['СР1', '', '']], DEFAULT_INTRADAY, DAY)).toThrow(
      'в файле промежуточных итогов нет ни одного оператора',
    );
  });

  it('an operator listed twice: the numbers are summed, with a warning', () => {
    const twice = intradayGrid([
      { name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] },
      { name: 'СР5', people: [{ name: 'Ершова  Мария', inv6: 1, inv20: 0 }] },
    ]);
    const parsed = parseIntraday(twice, DEFAULT_INTRADAY, DAY);
    expect(parsed.warnings).toEqual([
      'Ершова Мария: в файле 2 раза — показатели сложены, проверьте файл',
    ]);
    const config = makeConfig({
      teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
      managers: [manager('m01', 't1', { fullName: 'Ершова Мария' })],
    });
    const result = applyImport(
      { config, records: [], adjustments: [], imports: [] },
      parsed,
      new Map(),
      { fileName: 'пром итоги.xlsx', sha256: 'a'.repeat(64), by: 'k', at: `${DAY}T15:00:00+03:00` },
    );
    expect(result.input.records[0]?.values).toEqual({ inv6: 4, inv20: 1 });
  });

  it('onDay moves the whole file to another day', () => {
    const parsed = onDay(parseIntraday(grid, DEFAULT_INTRADAY, DAY), '2026-10-12');
    expect(parsed.period).toEqual(['2026-10-12', '2026-10-12']);
    expect(parsed.days).toEqual(['2026-10-12']);
    expect(new Set(parsed.rows.map((r) => r.date))).toEqual(new Set(['2026-10-12']));
  });

  it('recognises the file: a group row, then an operator with a number', () => {
    expect(looksLikeList(grid, DEFAULT_INTRADAY)).toBe(true);
    expect(looksLikeList([['Имя', 'Дата'], ['Ершова Мария', 3]], DEFAULT_INTRADAY)).toBe(false);
    // Only a group and people without numbers: not enough to call it this file.
    expect(looksLikeList([['СР1', '', ''], ['Ершова Мария', '', '']], DEFAULT_INTRADAY)).toBe(false);
  });
});

describe('the intraday file applied (D-20, OQ-12; applyImport unchanged)', () => {
  const config = makeConfig({
    teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
    managers: [
      manager('m01', 't1', { fullName: 'Ершова Мария' }),
      manager('m02', 't1', { fullName: 'Федоров Иван' }),
      manager('m03', 't1', { fullName: 'Котова Ольга' }),
      manager('m04', 't2', { fullName: 'Белова Анна' }),
      manager('m05', 't2', { fullName: 'Орлов Пётр' }),
    ],
  });
  const none = new Map<string, Resolution>();
  const meta = (at: string, sha: string) => ({
    fileName: 'пром итоги.xlsx',
    sha256: sha.repeat(64),
    by: 'k',
    at,
  });
  const valuesOf = (input: EngineInput, managerId: string, date: string) =>
    input.records.find((r) => r.managerId === managerId && r.date === date)?.values;

  it('replaces the day: 3 at 13:00, then 5 in the evening is 5; payments and other days kept', () => {
    const start: EngineInput = {
      config,
      records: [
        daily('m01', DAY, { inv6: 1, inv20: 0, pay: 2 }),
        daily('m01', '2026-10-12', { inv6: 6, inv20: 2, pay: 1 }),
        daily('m05', '2026-10-12', { inv6: 2, inv20: 1, pay: 0 }),
      ],
      adjustments: [],
      imports: [],
    };
    const noon = parseIntraday(
      intradayGrid([{ name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] }]),
      DEFAULT_INTRADAY,
      DAY,
    );
    const first = applyImport(start, noon, none, meta(`${DAY}T13:00:00+03:00`, 'a'));
    const evening = parseIntraday(
      intradayGrid([{ name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 5, inv20: 2 }] }]),
      DEFAULT_INTRADAY,
      DAY,
    );
    const second = applyImport(first.input, evening, none, meta(`${DAY}T18:00:00+03:00`, 'b'));
    expect(valuesOf(second.input, 'm01', DAY)).toEqual({ inv6: 5, inv20: 2, pay: 2 });
    expect(valuesOf(second.input, 'm01', '2026-10-12')).toEqual({ inv6: 6, inv20: 2, pay: 1 });
    expect(second.log).toMatchObject({ profileId: 'intraday', dateRange: [DAY, DAY] });
  });

  it("the file's groups' operators without a row get 0 that day; other groups are untouched", () => {
    const start: EngineInput = {
      config,
      records: [
        daily('m03', DAY, { inv6: 4, inv20: 1, pay: 0 }),
        daily('m05', DAY, { inv6: 2, inv20: 1, pay: 1 }),
      ],
      adjustments: [],
      imports: [],
    };
    const parsed = parseIntraday(
      intradayGrid([{ name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] }]),
      DEFAULT_INTRADAY,
      DAY,
    );
    const result = applyImport(start, parsed, none, meta(`${DAY}T13:00:00+03:00`, 'c'));
    expect(valuesOf(result.input, 'm03', DAY)).toEqual({ inv6: 0, inv20: 0, pay: 0 });
    expect(valuesOf(result.input, 'm05', DAY)).toEqual({ inv6: 2, inv20: 1, pay: 1 });
  });
});

describe('profiles of a running game (D-55)', () => {
  it("adds the default profiles the config lacks by id, keeps the config's own", () => {
    expect(profilesFor([])).toEqual(DEFAULT_PROFILES);
    expect(profilesFor([DEFAULT_FUNNEL, DEFAULT_PAYMENTS])).toEqual([
      DEFAULT_FUNNEL,
      DEFAULT_PAYMENTS,
      DEFAULT_INTRADAY,
    ]);
    const own = { ...DEFAULT_INTRADAY, title: 'Свои итоги' };
    expect(profilesFor([DEFAULT_FUNNEL, own])).toEqual([DEFAULT_FUNNEL, own, DEFAULT_PAYMENTS]);
  });

  it('the list kind is a valid profile of the config schema', () => {
    expect(ImportProfileSchema.parse(DEFAULT_INTRADAY)).toEqual(DEFAULT_INTRADAY);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/import/intraday.test.ts`
Expected: FAIL — `src/import/intraday.ts` cannot be resolved; `DEFAULT_INTRADAY`, `profilesFor` not exported.

- [ ] **Step 4: The schema** — in `src/data/schemas/importProfiles.ts`, before `ImportProfileSchema`:

```ts
/**
 * The intraday totals «Промежуточные итоги» (D-55): a column of groups and their operators, the running
 * totals of one day beside them, no dates — the day is chosen at the import.
 */
export const IntradayProfileSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('list'),
  title: z.string().min(1),
  /** A sheet's name, or its index (0 — the first). */
  sheet: z.union([z.string().min(1), z.number().int().min(0)]),
  nameColumn: Letters,
  /** A group's row: its name has the team's code (`СР\d+`, D-21). */
  groupCode: z.string().min(1),
  metrics: z.array(z.object({ column: Letters, metricId: IdSchema })).min(1),
});
```

and extend the union and the types:

```ts
export const ImportProfileSchema = z.discriminatedUnion('kind', [
  FunnelProfileSchema,
  PaymentsProfileSchema,
  IntradayProfileSchema,
]);

export type FunnelProfile = z.output<typeof FunnelProfileSchema>;
export type PaymentsProfile = z.output<typeof PaymentsProfileSchema>;
export type IntradayProfile = z.output<typeof IntradayProfileSchema>;
export type ImportProfile = z.output<typeof ImportProfileSchema>;
```

- [ ] **Step 5: The default profile and the merge** — in `src/import/profiles.ts`: import and re-export
`IntradayProfile` beside the other types, then replace `DEFAULT_PROFILES` with:

```ts
/** The intraday totals (`docs/IMPORT_FORMATS.md` §3, D-55): B — `inv6`, C — `inv20`, as the author's file. */
export const DEFAULT_INTRADAY: IntradayProfile = {
  id: 'intraday',
  kind: 'list',
  title: 'Промежуточные итоги',
  sheet: 0,
  nameColumn: 'A',
  groupCode: 'СР\\d+',
  metrics: [
    { column: 'B', metricId: 'inv6' },
    { column: 'C', metricId: 'inv20' },
  ],
};

export const DEFAULT_PROFILES: ImportProfile[] = [DEFAULT_FUNNEL, DEFAULT_PAYMENTS, DEFAULT_INTRADAY];

/**
 * The profiles an import uses: the config's, then every default one the config lacks by id (D-55). A
 * running game gets a new kind of export without a config change — viewers with older code read the
 * config with the kinds they know.
 */
export function profilesFor(configured: ImportProfile[]): ImportProfile[] {
  const own = new Set(configured.map((p) => p.id));
  return [...configured, ...DEFAULT_PROFILES.filter((p) => !own.has(p.id))];
}
```

- [ ] **Step 6: The parser** — create `src/import/intraday.ts`:

```ts
import { plural } from '../text.ts';
import { ImportError, cellText, column, type Grid } from './grid.ts';
import { normalizeName } from './match.ts';
import type { Parsed, ParsedRow, Person } from './parsed.ts';
import type { IntradayProfile } from './profiles.ts';

/**
 * The intraday totals «Промежуточные итоги» (D-55, `docs/IMPORT_FORMATS.md` §3): a group's row (its name
 * has the team's code; its own numbers, if any, are ignored), then its operators with the day's running
 * totals; an empty cell is 0. The file has no dates — the rows take `day`, chosen at the import.
 */
export function parseIntraday(grid: Grid, p: IntradayProfile, day: string): Parsed {
  const code = new RegExp(p.groupCode);
  const nameCol = column(p.nameColumn);
  const metrics = p.metrics.map((m) => ({ ...m, col: column(m.column) }));
  const groups: string[] = [];
  const people: Person[] = [];
  const rows: ParsedRow[] = [];
  let group: string | null = null;
  for (let i = 0; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const name = cellText(line[nameCol]);
    if (!name) continue;
    const found = code.exec(name)?.[0];
    if (found) {
      group = found;
      if (!groups.includes(found)) groups.push(found);
      continue;
    }
    if (group === null)
      throw new ImportError(
        `строка ${i + 1}: оператор выше первой группы — над операторами должна быть строка группы с кодом вроде «СР1»`,
      );
    const values: Record<string, number> = {};
    for (const m of metrics) values[m.metricId] = count(line[m.col], i + 1, m.column);
    const person: Person = { name, group };
    people.push(person);
    rows.push({ ...person, date: day, values });
  }
  if (people.length === 0) throw new ImportError('в файле промежуточных итогов нет ни одного оператора');

  // A name twice (a copy, a move between groups): `applyImport` sums the rows — say so.
  const times = new Map<string, { name: string; n: number }>();
  for (const person of people) {
    const key = normalizeName(person.name);
    const seen = times.get(key);
    if (seen) seen.n += 1;
    else times.set(key, { name: person.name, n: 1 });
  }
  const warnings = [...times.values()]
    .filter((t) => t.n > 1)
    .map(
      (t) => `${t.name}: в файле ${t.n} ${plural(t.n, 'раз', 'раза', 'раз')} — показатели сложены, проверьте файл`,
    );

  return {
    profileId: p.id,
    metrics: metrics.map((m) => m.metricId),
    rows,
    period: [day, day],
    days: [day],
    groups,
    people,
    warnings,
  };
}

/** An empty cell is 0; an integer ≥ 0, also as text; anything else stops — by place, never by value. */
function count(v: unknown, row: number, letter: string): number {
  const text = cellText(v);
  if (text === '') return 0;
  const n = typeof v === 'number' ? v : /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(n) || n < 0)
    throw new ImportError(
      `строка ${row}, столбец ${letter}: нужно целое число не меньше 0 или пустая ячейка — проверьте файл`,
    );
  return n;
}

/**
 * Whether the first rows of a sheet look like this file: a group's row followed by an operator with a
 * number in one of the profile's columns.
 */
export function looksLikeList(rows: unknown[][], p: IntradayProfile): boolean {
  const code = new RegExp(p.groupCode);
  const nameCol = column(p.nameColumn);
  const cols = p.metrics.map((m) => column(m.column));
  const named = (r: unknown[] | undefined) => cellText(r?.[nameCol]) !== '';
  return rows.some((row, i) => {
    if (!code.test(cellText(row[nameCol]))) return false;
    const next = rows.slice(i + 1).find(named);
    return (
      next !== undefined &&
      !code.test(cellText(next[nameCol])) &&
      cols.some((c) => typeof next[c] === 'number' || /^\d+$/.test(cellText(next[c])))
    );
  });
}

/** The same file for another day (the admin's «День», D-55). */
export function onDay(parsed: Parsed, day: string): Parsed {
  return {
    ...parsed,
    rows: parsed.rows.map((r) => ({ ...r, date: day })),
    period: [day, day],
    days: [day],
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/import/intraday.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 8: The whole suite and types**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green (`tests/unit/admin/newGame.test.ts` compares a new game's `importProfiles` with
`DEFAULT_PROFILES` itself, so the third profile passes there: a new game gets it in its config — its viewers
already run the new code).

- [ ] **Step 9: Commit**

```bash
git add src/data/schemas/importProfiles.ts src/import/profiles.ts src/import/intraday.ts tests/support/grids.ts tests/unit/import/intraday.test.ts
git commit -m "Import: «Промежуточные итоги» — the list profile, its parser for a chosen day, the default profile merged from code (D-55, plan intraday task 1)"
```

---

### Task 2: Recognising the file — detection, the worker, the tools and the fixture

**Где смотреть:** `src/import/detect.ts`, `src/import/xlsx.ts` (`parseWorkbook`, `HEADER_SEARCH_ROWS`),
`src/import/parse.worker.ts`, `src/import/parseFile.ts`; вызовы — `src/admin/ImportFlow.tsx`,
`src/admin/NewGame.tsx`, `scripts/check-exports.ts`; фикстуры — `scripts/make-fixtures.ts`; тесты
`tests/unit/import/detect.test.ts`, `tests/unit/import/xlsx.test.ts`, `tests/unit/admin/importStep.test.ts`,
`tests/unit/admin/newGame.test.ts`.

**Files:**
- Modify: `src/import/detect.ts`, `src/import/xlsx.ts`, `src/import/parse.worker.ts`, `src/import/parseFile.ts`
- Modify: `src/admin/ImportFlow.tsx` (pass the day only — the screen comes in Task 3), `src/admin/NewGame.tsx`
- Modify: `scripts/check-exports.ts`, `scripts/make-fixtures.ts`
- Create (generated): `tests/fixtures/import/intraday.xlsx`
- Test: `tests/unit/import/detect.test.ts`, `tests/unit/import/xlsx.test.ts`; callers in
  `tests/unit/admin/importStep.test.ts`, `tests/unit/admin/newGame.test.ts`

**Interfaces:**
- Consumes: Task 1 — `looksLikeList`, `parseIntraday`, `DEFAULT_INTRADAY`, `DEFAULT_PROFILES`.
- Produces: `parseWorkbook(bytes: ArrayBuffer, profiles: ImportProfile[], day: string)`;
  `ParseRequest = { bytes; profiles; day: string }`; `parseFile(file: File, profiles: ImportProfile[], day:
  string)`; the fixture `tests/fixtures/import/intraday.xlsx` (demo names, groups `СР1…СР6`, people of the
  demo's teams on 13.10 without the fired, plus «Тестов Тест» with empty cells).

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/import/detect.test.ts` (add
`intradayGrid` to the `grids.ts` import and `DEFAULT_INTRADAY` to the profiles import):

```ts
  it('the intraday totals by a group row followed by an operator with a number (D-55)', () => {
    const rows = intradayGrid([
      { name: 'Пл_НП_СР_Город_СР1_Входящие', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] },
    ]);
    expect(detectProfile(['Лист1'], (s) => (s === 0 ? rows : []), DEFAULT_PROFILES)?.id).toBe(
      'intraday',
    );
  });

  it('the paid invoices stay the paid invoices whatever the order of the profiles', () => {
    const p = detectProfile(
      ['Sheet1'],
      (sheet) => (sheet === 0 ? [PAYMENT_HEADERS] : []),
      [DEFAULT_INTRADAY, ...DEFAULT_PROFILES],
    );
    expect(p?.id).toBe('payments');
  });
```

and to `tests/unit/import/xlsx.test.ts` (import `parseIntraday` from `src/import/intraday.ts`,
`DEFAULT_INTRADAY` from the profiles, `intradayGrid` from the grids; give every existing `parseWorkbook`
call a third argument `DAY` with `const DAY = '2026-10-13';` at the top):

```ts
  it('recognises the intraday totals and reads them for the given day (D-55)', () => {
    const grid = intradayGrid([
      { name: 'Пл_НП_СР_Город_СР1_Входящие', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] },
    ]);
    const { profile, parsed } = parseWorkbook(
      book([['Лист1', XLSX.utils.aoa_to_sheet(grid)]]),
      DEFAULT_PROFILES,
      DAY,
    );
    expect(profile.id).toBe('intraday');
    expect(parsed).toEqual(parseIntraday(grid, DEFAULT_INTRADAY, DAY));
  });
```

and change the refusal test's pattern to the new message:
`toThrow(/ни на воронку по дням, ни на выгрузку оплаченных счетов, ни на промежуточные итоги/)`.

In `tests/unit/admin/importStep.test.ts` and `tests/unit/admin/newGame.test.ts` give the `parseWorkbook`
calls a third argument `'2026-10-13'`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/import/detect.test.ts tests/unit/import/xlsx.test.ts`
Expected: FAIL — the intraday sheet is not recognised (`null` / «не похож»), the refusal message differs.

- [ ] **Step 3: Detection** — `src/import/detect.ts`: import `looksLikeList` from `./intraday.ts` and add
after the payments loop:

```ts
  for (const p of profiles)
    if (p.kind === 'list' && looksLikeList(firstRows(p.sheet), p)) return p;
```

and extend the doc comment: «… the intraday totals by a group's row followed by an operator with a number
(D-55); the kinds are tried in this order whatever the order of the profiles».

- [ ] **Step 4: Parsing with a day** — `src/import/xlsx.ts`: import `parseIntraday` from `./intraday.ts`;
`parseWorkbook(bytes: ArrayBuffer, profiles: ImportProfile[], day: string)` with the doc line «`day` — the
day of a file without dates (the intraday totals, D-55)»; the refusal reads
`'файл не похож ни на воронку по дням, ни на выгрузку оплаченных счетов, ни на промежуточные итоги — проверьте, тот ли это файл'`;
the parse:

```ts
  const parsed =
    profile.kind === 'matrix'
      ? parseFunnel(grid(profile.sheet), profile)
      : profile.kind === 'events'
        ? parsePayments(grid(profile.sheet), profile)
        : parseIntraday(grid(profile.sheet), profile, day);
```

`src/import/parse.worker.ts`: `export type ParseRequest = { bytes: ArrayBuffer; profiles: ImportProfile[];
day: string };` and `parseWorkbook(e.data.bytes, e.data.profiles, e.data.day)`.

`src/import/parseFile.ts`: `parseFile(file: File, profiles: ImportProfile[], day: string)` and
`const request: ParseRequest = { bytes, profiles, day };`.

`src/admin/ImportFlow.tsx`: `import { localDate, localTimestamp } from '../data/time.ts';`,
`import { gameDay } from './rosterStep.ts';` and
`const parsed = await parseFile(f, profiles, gameDay(config, localDate(new Date())));`.

`src/admin/NewGame.tsx`: `import { localDate } from '../data/time.ts';` and
`const file = await parseFile(f, DEFAULT_PROFILES, localDate(new Date()));` (the wizard takes only the
funnel; the day is never used there).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/import tests/unit/admin`
Expected: PASS.

- [ ] **Step 6: The tools** — `scripts/check-exports.ts`: `import { localDate } from '../src/data/time.ts';`
and `parseWorkbook(buffer, DEFAULT_PROFILES, localDate(new Date()))`; its header comment gains «the
intraday totals are read for today». The output stays counts only (the parser's errors name a row and a
column; its warnings name a person — they are not printed: the filter keeps only lines that start with a
group or a count).

`scripts/make-fixtures.ts`: import `intradayGrid` from the grids and `teamOn` from
`../src/engine/roster.ts`; after `save('payments.xlsx', …)`:

```ts
// The intraday totals (D-55) of the seventh working day: the demo's operators by their team that day
// (the fired left out), groups in another order than the teams, and a stranger with empty cells — as the
// author's file has one.
const intradayDay = day(8);
const intradayGroups = demo.config.teams
  .map((team, i) => ({
    name: `Пл_НП_СР_Город_СР${i + 1}_Отдел`,
    people: demo.config.managers
      .filter((m) => m.firedAt === undefined && teamOn(m, intradayDay) === team.id)
      .map((m) => ({
        name: m.fullName,
        inv6: 4 + amount(`${m.id}i6`, 4),
        inv20: 2 + amount(`${m.id}i20`, 2),
      })),
  }))
  .reverse();
intradayGroups[0]?.people.push({ name: 'Тестов Тест', inv6: '', inv20: '' });
save('intraday.xlsx', [['Лист1', intradayGrid(intradayGroups)]]);
```

and add `, промежуточные итоги на ${intradayDay}` to the final `console.log`. (`day(8)` is 13.10 for the
demo's start 05.10: the working days 05–09 and 12, 13.)

Run: `npm run make-fixtures`
Expected: `make-fixtures: 6 групп, … ; … промежуточные итоги на 2026-10-13 → tests/fixtures/import/`. Only
`intraday.xlsx` is new in this task: if `git status` shows `funnel.xlsx` or `payments.xlsx` changed (SheetJS
may stamp the write time), restore them with `git checkout -- tests/fixtures/import/funnel.xlsx
tests/fixtures/import/payments.xlsx`.

Run: `npm run check-exports -- tests/fixtures/import/intraday.xlsx`
Expected: `intraday.xlsx: Промежуточные итоги; групп 6, людей N (с показателями N−1), дней с данными 1, период <today> … <today>; предупреждений 0; … мс`
— no names.

- [ ] **Step 7: The whole suite and types**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/import/detect.ts src/import/xlsx.ts src/import/parse.worker.ts src/import/parseFile.ts src/admin/ImportFlow.tsx src/admin/NewGame.tsx scripts/check-exports.ts scripts/make-fixtures.ts tests/fixtures/import/intraday.xlsx tests/unit/import/detect.test.ts tests/unit/import/xlsx.test.ts tests/unit/admin/importStep.test.ts tests/unit/admin/newGame.test.ts
git commit -m "Import: the intraday totals recognised and read for the admin's day; check-exports and a synthetic fixture (D-55, plan intraday task 2)"
```

---

### Task 3: The import screen — «День», the profiles of a running game, the commit message

**Где смотреть:** `src/admin/ImportFlow.tsx`, `src/admin/importStep.ts` (`importCommitMessage`),
`src/admin/rosterStep.ts` (`gameDay`); опыт ревью 2б-2 — очищенный «День» не должен ронять админку
(`src/admin/CorrectionForms.tsx`); e2e `tests/e2e/admin.spec.ts` (импорт воронки, корректировки с
`page.clock.setFixedTime`); NAVIGATOR «Грабли среды» (сервер e2e на 127.0.0.1).

**Files:**
- Modify: `src/admin/ImportFlow.tsx`, `src/admin/importStep.ts`
- Test: `tests/unit/admin/importStep.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 1 — `profilesFor`, `onDay`; Task 2 — `parseFile(file, profiles, day)`, the fixture
  `tests/fixtures/import/intraday.xlsx`.
- Produces: `periodText(period: [string, string]): string` in `src/admin/importStep.ts`.

- [ ] **Step 1: Write the failing unit test** — in `tests/unit/admin/importStep.test.ts`, inside
«one import from a file to a commit», after the payments message test:

```ts
  it('a one-day file reads as one date (D-55)', () => {
    expect(importCommitMessage('Промежуточные итоги', ['2026-10-13', '2026-10-13'], 49, 0)).toBe(
      'импорт: промежуточные итоги 13.10, 49 операторов',
    );
    expect(periodText(['2026-10-05', '2026-10-07'])).toBe('05.10–07.10');
  });
```

(add `periodText` to the import from `importStep.ts`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/admin/importStep.test.ts`
Expected: FAIL — `periodText` is not exported; the message reads `13.10–13.10`.

- [ ] **Step 3: The message** — in `src/admin/importStep.ts`:

```ts
/** `05.10–12.10`, or `13.10` for one day. */
export function periodText([from, to]: [string, string]): string {
  return from === to ? dayMonth(from) : `${dayMonth(from)}–${dayMonth(to)}`;
}
```

and in `importCommitMessage` the return becomes
``return `импорт: ${title.toLowerCase()} ${periodText(period)}, ${people}${fresh}`;`` (its doc example gains
«`импорт: промежуточные итоги 13.10, 49 операторов`»).

Run: `npx vitest run tests/unit/admin/importStep.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing e2e test** — in `tests/e2e/admin.spec.ts`, beside `FUNNEL`:
`const INTRADAY = 'tests/fixtures/import/intraday.xlsx';`, and at the end of the file:

```ts
test('«Промежуточные итоги»: a file without dates is one commit of the chosen day — inv6 and inv20 only; the figures move (D-55)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The admin's today is pinned: the default day must not depend on when the test runs.
  const NOW = '2026-10-14T12:00:00+03:00';
  await page.clock.setFixedTime(new Date(NOW));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const before = (await loadRepoState(fake, DEMO, new Map())).input;
  await login(page, fake);
  await page.getByRole('button', { name: 'Загрузить выгрузку' }).click();
  await page.getByTestId('import-file').setInputFiles(INTRADAY);

  const day = page.getByLabel('День', { exact: true });
  await expect(day).toHaveValue('2026-10-14');
  // A cleared day never takes the admin down: no preview until a day of the game (review 2b-2).
  await day.fill('');
  await expect(page.getByText('укажите день игры')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Показать превью' })).toBeDisabled();
  await day.fill('2026-10-13');
  await expect(page.getByText(/^Промежуточные итоги: 13\.10, людей \d+/)).toBeVisible();
  // «Тестов Тест» has no numbers: nothing to ask.
  await expect(page.getByTestId('resolve-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('preview-table')).toBeVisible();
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect(fake.last.message).toMatch(
    /^data\(demo\): импорт: промежуточные итоги 13\.10, \d+ операторов \[by koordinator\]$/,
  );
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  // The running game's config keeps its profiles: older viewers must read it (D-55).
  expect(after.config.importProfiles).toEqual(before.config.importProfiles);
  const key = (r: { managerId: string; date: string }) => `${r.managerId}|${r.date}`;
  const was = new Map(before.records.map((r) => [key(r), r]));
  const day13 = after.records.filter((r) => r.date === '2026-10-13');
  expect(day13.length).toBeGreaterThan(0);
  for (const r of after.records) {
    const old = was.get(key(r));
    if (r.date !== '2026-10-13') expect(r).toEqual(old);
    else expect(r.values.pay).toBe(old?.values.pay);
  }
  const position = (input: EngineInput) =>
    computeGameState(input, NOW).teams.map((t) => t.position);
  const moved = position(after).some((p, i) => p > (position(before)[i] ?? p));
  expect(moved).toBe(true);
});
```

Run: `npx playwright test tests/e2e/admin.spec.ts --project=e2e -g "Промежуточные итоги"`
Expected: FAIL — no field «День» on the import screen.

- [ ] **Step 5: The screen** — `src/admin/ImportFlow.tsx`:
- imports: `import { onDay } from '../import/intraday.ts';`, `import { profilesFor } from
  '../import/profiles.ts';` (instead of `DEFAULT_PROFILES`), `periodText` beside `prepareImport, toAsk`;
- state: `const [day, setDay] = useState<string | null>(null);` with the comment «the intraday file's day as
  typed (D-55)»;
- after `const config = …`:

```ts
  const profiles = profilesFor(config.importProfiles);
  const { start, end } = config.period;
  // The intraday file has no dates: its rows take the chosen day. A cleared or half-typed day, or one
  // outside the game, gives no file to preview — never an exception (review 2b-2).
  const dated = (f: ParsedFile): ParsedFile | null => {
    if (f.profile.kind !== 'list') return f;
    return day !== null && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= start && day <= end
      ? { ...f, parsed: onDay(f.parsed, day) }
      : null;
  };
  const current = file ? dated(file) : null;
  const match = current
    ? matchPeople(current.parsed.people, config, current.parsed.period[0])
    : null;
  const asked = current && match ? toAsk(match.unknown, current.parsed) : [];
```

  (the old `profiles`, `match` and `asked` lines go);
- `const chooseDay = (next: string) => { setDay(next); setStep(null); setNote(null); };`;
- in `pick`, after `setFile(parsed)`: `setDay(parsed.profile.kind === 'list' ? parsed.parsed.period[0] :
  null);`;
- in `preview`: `if (!current) return;` and `prepareImport(state, current, resolutions, …)`;
- the file label: «Файл выгрузки (воронка по дням, оплаченные счета или промежуточные итоги, .xlsx) — он не
  покидает этот браузер»;
- the block after the label becomes:

```tsx
      {file && (
        <div className="space-y-3">
          {current && match && (
            <p className="text-sm">
              {current.profile.title}: {periodText(current.parsed.period)}, людей{' '}
              {current.parsed.people.length}, узнано {match.managerOf.size}.
            </p>
          )}
          {file.profile.kind === 'list' && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              В файле нет дат — записать за день
              <input
                type="date"
                aria-label="День"
                className="sq-input w-auto"
                min={start}
                max={end}
                value={day ?? ''}
                onChange={(e) => chooseDay(e.target.value)}
              />
              {current ? (
                <span className="italic">
                  {current.parsed.metrics
                    .map((id) => config.metrics.find((m) => m.id === id)?.title ?? id)
                    .join(' и ')}{' '}
                  за этот день заменятся числами файла
                </span>
              ) : (
                <span className="sq-pace-down">укажите день игры</span>
              )}
            </p>
          )}
          {period && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Файл полный за период
              <input
                type="date"
                aria-label="Начало периода"
                className="sq-input w-auto"
                value={period[0]}
                onChange={(e) => choosePeriod([e.target.value, period[1]])}
              />
              —
              <input
                type="date"
                aria-label="Конец периода"
                className="sq-input w-auto"
                value={period[1]}
                onChange={(e) => choosePeriod([period[0], e.target.value])}
              />
              <span className="sq-dim">(дни без оплат в нём станут нулями)</span>
            </p>
          )}
          {asked.length > 0 && (
            <Resolve unknown={asked} config={config} resolutions={resolutions} onChange={choose} />
          )}
          <button
            className="sq-button"
            disabled={!current || open > 0 || busy}
            onClick={() => preview(session.state)}
          >
            {open > 0 ? `Осталось решить: ${open}` : 'Показать превью'}
          </button>
        </div>
      )}
```

  (for the default profile the hint reads «Качественные счета и Разговоры от 20 минут за этот день заменятся
  числами файла»).

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npx playwright test tests/e2e/admin.spec.ts --project=e2e -g "Промежуточные итоги"`
Expected: PASS.

- [ ] **Step 7: Screenshot of the screen** — run the dev server's admin by the e2e flow once more with a
screenshot of the import screen after the day is filled (a throwaway `page.screenshot` in a scratch spec, not
committed) and look at it: the date field, the hint and the line «Промежуточные итоги: 13.10, людей N» read
clearly on the parchment.

- [ ] **Step 8: The whole admin e2e, the suite and types**

Run: `npm run typecheck && npm run lint && npm test && npx playwright test tests/e2e/admin.spec.ts --project=e2e`
Expected: all green (17 admin e2e tests).

- [ ] **Step 9: Commit**

```bash
git add src/admin/ImportFlow.tsx src/admin/importStep.ts tests/unit/admin/importStep.test.ts tests/e2e/admin.spec.ts
git commit -m "Admin: the import of «Промежуточные итоги» — the field «День» (today by default), the running game's profiles kept, a one-day period as one date (D-55, plan intraday task 3)"
```

---

### Task 4: Documents, the author's sample and the full check

**Где смотреть:** `docs/IMPORT_FORMATS.md`, `docs/DECISIONS.md` (последнее — D-54), `docs/NAVIGATOR.md` §3,
`CLAUDE.md` (строка этапа); правила приватности — `CLAUDE.md` «Правила».

**Files:**
- Modify: `docs/IMPORT_FORMATS.md`, `docs/DECISIONS.md`, `docs/NAVIGATOR.md`, `CLAUDE.md`

- [ ] **Step 1: IMPORT_FORMATS** — after the table «Итог: какая метрика откуда» add the line «`inv6` и `inv20`
за день — также из «Промежуточных итогов» (§3): днём, нарастающим итогом за сегодня; утренняя воронка
заменяет их официальными числами.»; insert a new section before «## 3. Как два файла складываются …» and
renumber that and the following sections (3 → 4, 4 → 5, 5 → 6; the heading becomes «## 4. Как файлы
складываются в данные игры»):

```markdown
## 3. Промежуточные итоги (форма «список», D-55)

Выгрузка вида `пром итоги.xlsx` — нарастающие итоги **сегодняшнего** дня по двум показателям воронки.
Автор грузит её несколько раз в течение дня; дат в файле нет. Разобрана 13.10.2026 по образцу автора —
только устройство (скриптом, без имён и чисел).

| Что | Как |
|---|---|
| Лист | один, первый |
| Шапка | нет: данные с первой строки |
| A | строка **группы** — её полное название с кодом `СР<n>` внутри (как в воронке); под ней — её **операторы** (полные ФИО) |
| B | `inv6` — качественные счета за день |
| C | `inv20` — разговоры от 20 минут за день |
| B, C у группы | пусто (итог группы, если появится, игнорируется) |

- Оператор относится к ближайшей группе выше; пустая ячейка — 0; целое число ≥ 0 (в т.ч. цифры текстом) —
  значение; отрицательное, дробное или слово — импорт останавливается с номером строки и столбца.
- Оператор выше первой группы — отказ; файл без операторов — отказ; одно ФИО дважды — числа складываются,
  предупреждение.
- **День** выбирает админ при загрузке (по умолчанию сегодняшний день игры): файл полный за этот один день —
  `inv6` и `inv20` дня заменяются (3 в 13:00, 5 вечером → 5), операторы групп файла без строки получают 0,
  `pay` и другие дни не трогаются.
- Профиль `intraday` (вид `list`) — в коде (`DEFAULT_INTRADAY`); в конфиг идущей игры не пишется: открытые
  экраны со старым кодом не знают этого вида (D-55).
```

and in the renumbered §4 add a bullet: «**Промежуточные итоги** заменяют `inv6` и `inv20` своего одного дня;
следующая утренняя воронка за этот день заменяет их официальными числами.»

- [ ] **Step 2: DECISIONS** — after D-54:

```markdown
**D-55. Промежуточные итоги — третья выгрузка, днём** (ответы автора 13.10.2026: «грузить данные по счетам 6+
и 20+ … накопительными»; файл без дат — группы и их операторы в столбце A, B — `inv6`, C — `inv20`;
спецификация `docs/superpowers/specs/2026-10-13-engagement-moments-design.md`, часть 0, план
`docs/superpowers/plans/2026-10-13-intraday-import.md`; к D-19…D-22, OQ-12, D-35):
- **вид профиля `list`** (`parseIntraday`, `looksLikeList` в `src/import/intraday.ts`): узнаётся после воронки
  и оплат — строка группы с кодом и под ней оператор с числом; группа может иметь свои числа — они не
  читаются;
- **день** выбирает админ (поле «День», по умолчанию сегодняшний день игры); файл полный за этот день — его
  `inv6` и `inv20` заменяются, операторы групп файла без строки — 0, `pay` и другие дни не трогаются. Движок и
  `applyImport` не менялись; утренняя воронка за этот день заменяет промежуточные числа официальными;
- **профиль в коде, не в конфиге:** `profilesFor` добавляет к профилям конфига недостающие по id из кода —
  идущая игра получает новую выгрузку без правки конфига, а старый код открытых экранов не встречает
  незнакомый вид;
- ошибки разбора называют строку и столбец, но не человека и не число (`check-exports` их печатает); подпись
  коммита — «импорт: промежуточные итоги 13.10, N операторов» (период из одного дня — одной датой, и у других
  выгрузок).
```

- [ ] **Step 3: NAVIGATOR §3 and CLAUDE.md** — in NAVIGATOR §3 (import), beside the funnel and the payments,
add: «**Промежуточные итоги (D-55):** `src/import/intraday.ts` (`parseIntraday`, `looksLikeList`, `onDay`),
профиль `DEFAULT_INTRADAY` и `profilesFor` в `src/import/profiles.ts`, поле «День» в `src/admin/ImportFlow.tsx`;
тесты `tests/unit/import/intraday.test.ts`, e2e «Промежуточные итоги» в `admin.spec.ts`; фикстура
`tests/fixtures/import/intraday.xlsx`.» and the plan's path to the stage list. In `CLAUDE.md`, the stage line,
after the vacation's plan: «дневная выгрузка «Промежуточные итоги» (D-55) —
`docs/superpowers/plans/2026-10-13-intraday-import.md`;». Mention in the same line that the moments of
part A/B (D-56, D-57) follow per the spec `docs/superpowers/specs/2026-10-13-engagement-moments-design.md`.

- [ ] **Step 4: The author's sample** — run `check-exports` on it (counts only, the output is for the report,
not for the repository):

Run: `npm run check-exports -- "C:/Users/Elder_Mikhey/Downloads/пром итоги.xlsx"`
Expected: `<маска>.xlsx: Промежуточные итоги; групп 6, людей …; дней с данными 1, период <today> … <today>;
предупреждений 0` — recognised, no error. A warning is counted, not printed (it may name a person); a count
above 0 goes into the report.

- [ ] **Step 5: The privacy scan** — no real names in the diff of the plan:

Run: `git diff <BASE>..HEAD --stat` and grep the diff for the six leader surnames (typed only in the
command, never written into a file) and for the sample's file name in committed files.
Expected: no matches except the documented file name pattern «пром итоги.xlsx» in IMPORT_FORMATS.

- [ ] **Step 6: The full check**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run size && npx playwright test --project=e2e`
Expected: all green; `size` — the viewers' initial JS unchanged (the import code lives in the admin chunk and
the worker).

- [ ] **Step 7: Commit**

```bash
git add docs/IMPORT_FORMATS.md docs/DECISIONS.md docs/NAVIGATOR.md CLAUDE.md
git commit -m "Docs: D-55 — «Промежуточные итоги», the intraday file: IMPORT_FORMATS §3, NAVIGATOR and the current stage"
```

---

### Task 5: Independent review, fixes, the report

- [ ] **Step 1:** the review package of the whole plan (`review-package`), an independent reviewer on opus
with the spec, this plan, its Review Focus and the ledger's rulings; the reviewer must not open the root
`*.xlsx`, `refs/`, `assets-src/`, the author's Downloads, and must not decrypt `data/`.
- [ ] **Step 2:** re-grade; Critical and Important — one fix pass, each fix RED → GREEN + the whole suite;
minors — to the ledger and `docs/BACKLOG.md`.
- [ ] **Step 3:** a short report in Russian: what the author can do now (load «пром итоги» through «Загрузить
выгрузку», check «День», the preview, «Записать»), the rulings, the deferred minors; the push and the deploy
only after a fresh «да» (rebase on the admin's data commits first).
