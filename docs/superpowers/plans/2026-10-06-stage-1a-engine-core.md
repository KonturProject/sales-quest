# Stage 1a — Schemas and Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validated data schemas and a pure, fully tested game engine that turns a season config + daily records + admin adjustments into team positions on the track, pace, and a manager leaderboard.

**Architecture:** `src/data/schemas/` holds zod schemas (runtime validation of JSON / converted XLSX) and the TypeScript types inferred from them. `src/engine/` is a set of small pure modules (dates → calendar → track/pace, roster, scoring → targets → progress, leaderboard, timeline) composed by `computeGameState(input, now)`; it imports schema *types* only, never zod, React, three.js, the DOM or the clock (ESLint enforces it). Achievements are plan 1b; storage, crypto and delivery are plan 1c.

**Tech Stack:** TypeScript ~6.0.3 (strict), zod ^4.6.5, Vitest ^5.0.2 + @vitest/coverage-v8 ^5.0.2.

**Spec:** `docs/SPEC.md` (§5 mechanics, §14 data models, QA-1, ARCH-2, ARCH-3) and `docs/DECISIONS.md`, which overrides it — especially **D-24** (custom game length, track from working days, 4 equal locations), D-11, D-16, D-17, D-18, D-21, D-22, and R-1…R-5 (roster). Open questions with their defaults: `docs/OPEN_QUESTIONS.md` (OQ-3, OQ-10, OQ-11, OQ-19).

## Global Constraints

- Project root: `C:\Users\Elder_Mikhey\Desktop\Dev Claude\stepper game`; branch `main`; Node ≥ 22.18; TypeScript stays on 6.0.x.
- Relative imports carry the `.ts`/`.tsx` extension.
- `src/engine` is pure (ARCH-3): no DOM, network, storage, React, three.js or zod at runtime; schema types come in via `import type`. No `Date.now()` and no `new Date()` without arguments — "now" is a parameter (D-11). Dates are `YYYY-MM-DD` strings.
- Game numbers only from the season config. Defaults used in tests and seeds: `track.cellsPerWorkingDay = 2`, `track.overflowPct = 50`, `defaultDailyTargetPoints = 7.5`, weights `inv6 = 1`, `inv20 = 3`, `pay = 10`.
- Track geometry (D-24): `cellsPerLocation = ceil(cellsPerWorkingDay × workingDays / 4)`, `trackLength = 4 × cellsPerLocation`, `overflowCells = ceil(trackLength × overflowPct / 100)`, `maxPosition = trackLength + overflowCells`; position 0 is the start, cell `trackLength` is the finish (100 % of plan).
- Messages that admins may see (validation issues, engine warnings) are in Russian; code comments in English.
- Coverage of `src/engine` ≥ 90 % lines / branches / functions / statements (QA-1); full state + timeline for 70 managers < 50 ms (ARCH-2).
- Whenever `npm run lint` reports Prettier differences in files this plan created, run `npm run format` and re-run `npm run lint`.
- Commits: local commits are approved for stage 1 (author, 06.10.2026); English messages with requirement IDs, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never `--no-verify`. **Push only after the author's explicit "yes" (D-3).**

## File map

| File | Responsibility |
|---|---|
| `src/data/schemas/common.ts` | `IsoDateSchema`, `IsoDateTimeSchema`, `IdSchema`, `HexColorSchema` |
| `src/data/schemas/season.ts` | `SeasonConfigSchema`, `parseSeasonConfig`, types `SeasonConfig`, `Team`, `Manager`, `Membership`, `Metric` |
| `src/data/schemas/records.ts` | `MetricRecordSchema`, `AdjustmentSchema`, `ImportLogSchema` and their types |
| `src/engine/dates.ts` | calendar-date arithmetic on `YYYY-MM-DD` strings |
| `src/engine/calendar.ts` | working days and weeks of a game (D-24) |
| `src/engine/track.ts` | track geometry, location of a position (D-24) |
| `src/engine/pace.ts` | pace position (FR-PACE-1, D-18) |
| `src/engine/roster.ts` | team of a manager on a date, days in a team, firing (R-1, R-2, R-5) |
| `src/engine/scoring.ts` | daily series from records (DATA-5/6), weights, points |
| `src/engine/targets.ts` | team target points, average headcount (FR-STEP-1, R-2, R-3) |
| `src/engine/adjustments.ts` | adjustments in force on a date |
| `src/engine/progress.ts` | team points, progress, position incl. steps and resets (FR-STEP-1…3, D-17) |
| `src/engine/leaderboard.ts` | manager ranking with tie-breaks (FR-LB-1, FR-LB-5, D-16, R-5) |
| `src/engine/prepare.ts` | `EngineInput`, `Prepared`, `prepare()` — shared derived inputs |
| `src/engine/timeline.ts` | team standings at the end of every completed working day |
| `src/engine/gameState.ts` | `computeGameState(input, now)` → `GameState` |
| `tests/support/builders.ts` | test data builders (config, managers, records, adjustments) |
| `tests/unit/schemas/*.test.ts`, `tests/unit/engine/*.test.ts` | tests |
| `.claude/skills/engine-rules/SKILL.md` | project skill with the engine invariants (D-4) |

---

### Task 1: Schemas, test builders, engine lint rules

**Files:**
- Create: `src/data/schemas/common.ts`, `src/data/schemas/season.ts`, `src/data/schemas/records.ts`, `tests/support/builders.ts`
- Modify: `package.json` (deps, `test:engine`), `vitest.config.ts` (coverage), `eslint.config.js` (engine rules)
- Test: `tests/unit/schemas/season.test.ts`, `tests/unit/schemas/records.test.ts`

**Interfaces:**
- Produces: `parseSeasonConfig(input: unknown): SeasonConfig`; `SeasonConfigSchema`; types `SeasonConfig`, `Metric`, `Team`, `Manager`, `Membership`, `MetricRecord`, `Adjustment`, `ImportLog`; schemas `MetricRecordSchema`, `AdjustmentSchema`, `ImportLogSchema`.
- Produces (tests): `makeConfig(overrides?)`, `team(id, order, extra?)`, `manager(id, teamId, extra?)`, `daily(managerId, date, values, importId?)`, `snapshot(managerId, date, values, importId?)`, `at(date, time?)`, `teamSteps(id, teamId, value, at)`, `teamReset(id, teamId, value, at)`, `seasonReset(id, value, at)`, `managerPoints(id, managerId, value, at)`, `importLog(id, at)`.

- [ ] **Step 1: Install dependencies and add the engine test script**

```bash
npm install zod@^4.6.5
npm install -D @vitest/coverage-v8@^5.0.2
```

Add to `package.json` → `scripts`:

```json
"test:engine": "vitest run tests/unit/engine tests/unit/schemas --coverage"
```

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      reporter: ['text-summary', 'text'],
      // QA-1: the engine is covered at least to 90 %.
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
```

(`npm run test:engine` is meaningful from Task 2 on, when `src/engine` has files.)

- [ ] **Step 2: Add the engine purity rules to ESLint**

In `eslint.config.js`, add this block at the end of the array (after the `scripts/tests` block):

```js
  {
    // ARCH-3, D-11: the engine is pure — no UI, no runtime dependencies, no clock.
    files: ['src/engine/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'three', '@react-three/*', 'zod'],
              message: 'src/engine — чистые функции без UI и рантайм-зависимостей (ARCH-3).',
            },
            {
              group: ['../data/**'],
              allowTypeImports: true,
              message: 'Из src/data в движок — только типы: import type (ARCH-3).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'fetch',
        'localStorage',
        'sessionStorage',
        'navigator',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: '«Сейчас» — параметр движка (D-11).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: '«Сейчас» — параметр движка (D-11).',
        },
      ],
    },
  },
```

- [ ] **Step 3: Write the shared schemas**

`src/data/schemas/common.ts`:

```ts
import { z } from 'zod';

/** Calendar date `YYYY-MM-DD`, no time zone (D-11). */
export const IsoDateSchema = z.iso.date();

/** Timestamp with an offset in the author's local time, e.g. `2026-10-06T14:05:00+03:00`. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** Stable machine id: latin letters, digits, `_` and `-`. */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'id: латиница, цифры, _ и -, не длиннее 64 символов');

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'цвет в формате #RRGGBB');
```

`src/data/schemas/season.ts`:

```ts
import { z } from 'zod';
import { HexColorSchema, IdSchema, IsoDateSchema } from './common.ts';

export const MetricSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  weight: z.number().min(0),
  order: z.number().int(),
});

export const LocationSchema = z.object({
  index: z.number().int().min(1).max(4),
  title: z.string().min(1),
  themePackId: z.string().min(1),
});

export const TeamSchema = z.object({
  id: IdSchema,
  leaderName: z.string().min(1),
  characterId: z.string().min(1),
  color: HexColorSchema,
  /** Group code in the exports, e.g. `СР1` (D-21). */
  sourceCode: z.string().min(1).optional(),
  targetPoints: z.number().positive().optional(),
  order: z.number().int(),
});

/** A period in a team, dates inclusive; no `to` — still in the team (ADM-ROSTER). */
export const MembershipSchema = z.object({
  teamId: IdSchema,
  from: IsoDateSchema,
  to: IsoDateSchema.optional(),
});

export const ManagerSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  /** Norm per working day for each metric (R-2). */
  dailyNorms: z.record(z.string(), z.number().min(0)).optional(),
  memberships: z.array(MembershipSchema).min(1),
  firedAt: IsoDateSchema.optional(),
  firedReason: z.string().optional(),
});

const SeasonShape = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  title: z.string().min(1),
  status: z.enum(['draft', 'active', 'closed']),
  /** Any length; two weeks by default (D-24). */
  period: z.object({ start: IsoDateSchema, end: IsoDateSchema }),
  /** Explicit working days; without it — Mon–Fri of the period minus holidays. */
  workingDays: z.array(IsoDateSchema).optional(),
  holidays: z.array(IsoDateSchema).default([]),
  track: z.object({
    cellsPerWorkingDay: z.number().int().min(1).max(20),
    overflowPct: z.number().min(0).max(200),
  }),
  progressMode: z.enum(['plan_percent', 'per_capita', 'absolute']),
  /** Target of a manager without daily norms, points per working day (D-24, OQ-3). */
  defaultDailyTargetPoints: z.number().positive(),
  pointsPerStep: z.number().positive().optional(),
  metricsCounting: z.enum(['exclusive', 'inclusive']),
  metrics: z.array(MetricSchema).min(1),
  locations: z.array(LocationSchema).length(4),
  teams: z.array(TeamSchema).min(1),
  managers: z.array(ManagerSchema),
  /** Validated by the achievement schema of plan 1b; opaque until then. */
  achievements: z.array(z.unknown()).default([]),
  /** Import profiles arrive with stage 2. */
  importProfiles: z.array(z.unknown()).default([]),
  achievementBonusAffectsSteps: z.boolean().default(false),
  ui: z.object({
    pollIntervalSec: z.number().int().min(30).max(300),
    blurFreezeSec: z.number().int().min(0),
    camera: z.object({ pitchDeg: z.number(), yawDeg: z.number() }),
  }),
});

/** The season (= one game) config: one schema for season.json and the XLSX template (DATA-13). */
export const SeasonConfigSchema = SeasonShape.superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const unique = (path: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issue([path], `повторяется ${id}`);
      seen.add(id);
    }
  };

  if (c.period.start > c.period.end) issue(['period', 'end'], 'конец периода раньше начала');
  (c.workingDays ?? []).forEach((d, i) => {
    if (d < c.period.start || d > c.period.end)
      issue(['workingDays', i], `рабочий день ${d} вне периода игры`);
  });
  unique('metrics', c.metrics.map((m) => m.id));
  unique('teams', c.teams.map((t) => t.id));
  unique('managers', c.managers.map((m) => m.id));
  unique('locations', c.locations.map((l) => `локация ${l.index}`));
  if (c.progressMode === 'absolute' && c.pointsPerStep === undefined)
    issue(['pointsPerStep'], 'режим absolute требует pointsPerStep');

  const metricIds = new Set(c.metrics.map((m) => m.id));
  const teamIds = new Set(c.teams.map((t) => t.id));
  c.managers.forEach((m, i) => {
    for (const metric of Object.keys(m.dailyNorms ?? {}))
      if (!metricIds.has(metric)) issue(['managers', i, 'dailyNorms', metric], `нет метрики ${metric}`);
    m.memberships.forEach((p, j) => {
      const path = ['managers', i, 'memberships', j];
      if (!teamIds.has(p.teamId)) issue([...path, 'teamId'], `нет команды ${p.teamId}`);
      if (p.to !== undefined && p.to < p.from)
        issue([...path, 'to'], 'период в команде кончается раньше, чем начинается');
      const next = m.memberships[j + 1];
      if (next && (p.to === undefined || p.to >= next.from))
        issue(
          ['managers', i, 'memberships', j + 1, 'from'],
          'периоды в командах идут по порядку и не пересекаются',
        );
    });
  });
});

export type SeasonConfig = z.output<typeof SeasonConfigSchema>;
export type Metric = SeasonConfig['metrics'][number];
export type Team = SeasonConfig['teams'][number];
export type Manager = SeasonConfig['managers'][number];
export type Membership = Manager['memberships'][number];

/** Validates a season config; throws a ZodError that lists every problem with its path. */
export function parseSeasonConfig(input: unknown): SeasonConfig {
  return SeasonConfigSchema.parse(input);
}
```

`src/data/schemas/records.ts`:

```ts
import { z } from 'zod';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from './common.ts';

/** records.enc.json: one manager-day (or a running-total snapshot, DATA-6) of metric values. */
export const MetricRecordSchema = z.object({
  managerId: IdSchema,
  date: IsoDateSchema,
  kind: z.enum(['daily', 'snapshot']),
  values: z.record(z.string(), z.number().min(0)),
  importId: z.string().min(1),
});
export type MetricRecord = z.output<typeof MetricRecordSchema>;

const base = {
  id: z.string().min(1),
  reason: z.string().min(1),
  by: z.string().min(1),
  at: IsoDateTimeSchema,
  revoked: z
    .object({ by: z.string().min(1), at: IsoDateTimeSchema, reason: z.string().min(1) })
    .optional(),
};

/** adjustments.enc.json: admin actions applied on top of the computed result (ADM-1). */
export const AdjustmentSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('team_steps'), teamId: IdSchema, value: z.number().int() }),
  /** `value` — the computed position removed by the reset (D-17). */
  z.object({
    ...base,
    type: z.literal('team_reset'),
    teamId: IdSchema,
    value: z.number().int().min(0),
  }),
  z.object({
    ...base,
    type: z.literal('season_reset'),
    value: z.record(z.string(), z.number().int().min(0)),
  }),
  z.object({ ...base, type: z.literal('manager_points'), managerId: IdSchema, value: z.number() }),
  z.object({
    ...base,
    type: z.literal('grant_achievement'),
    achievementId: IdSchema,
    managerId: IdSchema.optional(),
    teamId: IdSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('revoke_achievement'),
    achievementId: IdSchema,
    managerId: IdSchema.optional(),
    teamId: IdSchema.optional(),
  }),
  /** Audit only: weights live in the config, the engine ignores this record. */
  z.object({
    ...base,
    type: z.literal('weights_change'),
    value: z.record(z.string(), z.number().min(0)),
  }),
]);
export type Adjustment = z.output<typeof AdjustmentSchema>;

/** imports.enc.json: one entry per import (DATA-8). */
export const ImportLogSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  profileId: z.string().min(1),
  rows: z.number().int().min(0),
  matched: z.number().int().min(0),
  unmatched: z.number().int().min(0),
  dateRange: z.tuple([IsoDateSchema, IsoDateSchema]),
  by: z.string().min(1),
  at: IsoDateTimeSchema,
  warnings: z.array(z.string()),
});
export type ImportLog = z.output<typeof ImportLogSchema>;
```

- [ ] **Step 4: Write the test builders**

`tests/support/builders.ts`:

```ts
import type { Adjustment, ImportLog, MetricRecord } from '../../src/data/schemas/records.ts';
import type { Manager, SeasonConfig, Team } from '../../src/data/schemas/season.ts';

/** Local timestamp of a date (D-11): `at('2026-10-06')` → `2026-10-06T12:00:00+03:00`. */
export const at = (date: string, time = '12:00') => `${date}T${time}:00+03:00`;

export function team(id: string, order: number, extra: Partial<Team> = {}): Team {
  return { id, leaderName: `Руководитель ${order}`, characterId: 'knight', color: '#E4572E', order, ...extra };
}

export function manager(id: string, teamId: string, extra: Partial<Manager> = {}): Manager {
  return {
    id,
    fullName: `Оператор ${id}`,
    aliases: [],
    memberships: [{ teamId, from: '2026-10-05' }],
    ...extra,
  };
}

/** A two-week game: Mon 2026-10-05 … Sun 2026-10-18, 10 working days, teams t1 and t2. */
export function makeConfig(overrides: Partial<SeasonConfig> = {}): SeasonConfig {
  return {
    schemaVersion: 1,
    id: 'test-season',
    title: 'Тестовая игра',
    status: 'active',
    period: { start: '2026-10-05', end: '2026-10-18' },
    holidays: [],
    track: { cellsPerWorkingDay: 2, overflowPct: 50 },
    progressMode: 'plan_percent',
    defaultDailyTargetPoints: 7.5,
    metricsCounting: 'exclusive',
    metrics: [
      { id: 'inv6', title: 'Качественные счета', weight: 1, order: 1 },
      { id: 'inv20', title: 'Разговоры от 20 минут', weight: 3, order: 2 },
      { id: 'pay', title: 'Оплаты', weight: 10, order: 3 },
    ],
    locations: [
      { index: 1, title: 'Древние руины', themePackId: 'ruins' },
      { index: 2, title: 'Ледяные скалы', themePackId: 'ice' },
      { index: 3, title: 'Вулкан', themePackId: 'volcano' },
      { index: 4, title: 'Небеса', themePackId: 'heaven' },
    ],
    teams: [team('t1', 1), team('t2', 2)],
    managers: [],
    achievements: [],
    importProfiles: [],
    achievementBonusAffectsSteps: false,
    ui: { pollIntervalSec: 60, blurFreezeSec: 30, camera: { pitchDeg: 45, yawDeg: 45 } },
    ...overrides,
  };
}

export function daily(
  managerId: string,
  date: string,
  values: Record<string, number>,
  importId = 'imp-1',
): MetricRecord {
  return { managerId, date, kind: 'daily', values, importId };
}

export function snapshot(
  managerId: string,
  date: string,
  values: Record<string, number>,
  importId = 'imp-1',
): MetricRecord {
  return { managerId, date, kind: 'snapshot', values, importId };
}

const meta = (id: string, when: string) => ({ id, at: when, reason: 'тест', by: 'admin' });

export const teamSteps = (id: string, teamId: string, value: number, when: string): Adjustment => ({
  ...meta(id, when),
  type: 'team_steps',
  teamId,
  value,
});

export const teamReset = (id: string, teamId: string, value: number, when: string): Adjustment => ({
  ...meta(id, when),
  type: 'team_reset',
  teamId,
  value,
});

export const seasonReset = (id: string, value: Record<string, number>, when: string): Adjustment => ({
  ...meta(id, when),
  type: 'season_reset',
  value,
});

export const managerPoints = (
  id: string,
  managerId: string,
  value: number,
  when: string,
): Adjustment => ({ ...meta(id, when), type: 'manager_points', managerId, value });

export function importLog(id: string, when: string): ImportLog {
  return {
    id,
    fileName: 'export.xlsx',
    fileSha256: 'a'.repeat(64),
    profileId: 'funnel',
    rows: 1,
    matched: 1,
    unmatched: 0,
    dateRange: ['2026-10-05', '2026-10-05'],
    by: 'admin',
    at: when,
    warnings: [],
  };
}
```

- [ ] **Step 5: Write the schema tests**

`tests/unit/schemas/season.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SeasonConfigSchema, parseSeasonConfig } from '../../../src/data/schemas/season.ts';
import { makeConfig, manager } from '../../support/builders.ts';

function problems(input: unknown): string[] {
  const result = SeasonConfigSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('SeasonConfigSchema', () => {
  it('accepts a valid two-week game', () => {
    const config = makeConfig({ managers: [manager('m1', 't1')] });
    expect(parseSeasonConfig(config)).toEqual(config);
  });

  it('fills defaults for optional lists and flags', () => {
    const input: Record<string, unknown> = { ...makeConfig() };
    for (const key of ['holidays', 'achievements', 'importProfiles', 'achievementBonusAffectsSteps'])
      delete input[key];
    input.managers = [
      { id: 'm1', fullName: 'Иванов Иван', memberships: [{ teamId: 't1', from: '2026-10-05' }] },
    ];
    const parsed = parseSeasonConfig(input);
    expect(parsed.holidays).toEqual([]);
    expect(parsed.achievements).toEqual([]);
    expect(parsed.importProfiles).toEqual([]);
    expect(parsed.achievementBonusAffectsSteps).toBe(false);
    expect(parsed.managers[0]?.aliases).toEqual([]);
  });

  it('rejects a period that ends before it starts', () => {
    const config = makeConfig({ period: { start: '2026-10-18', end: '2026-10-05' } });
    expect(problems(config)).toContain('period.end: конец периода раньше начала');
  });

  it('rejects impossible dates', () => {
    const config = makeConfig({ period: { start: '2026-02-30', end: '2026-03-10' } });
    expect(problems(config).some((p) => p.startsWith('period.start'))).toBe(true);
  });

  it('rejects working days outside the period', () => {
    const config = makeConfig({ workingDays: ['2026-10-05', '2026-11-02'] });
    expect(problems(config)).toContain('workingDays.1: рабочий день 2026-11-02 вне периода игры');
  });

  it('rejects memberships in an unknown team, reversed or overlapping', () => {
    const m = manager('m1', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 'nope', from: '2026-10-09', to: '2026-10-08' },
      ],
    });
    const found = problems(makeConfig({ managers: [m] }));
    expect(found).toContain('managers.0.memberships.1.teamId: нет команды nope');
    expect(found).toContain(
      'managers.0.memberships.1.to: период в команде кончается раньше, чем начинается',
    );
    expect(found).toContain(
      'managers.0.memberships.1.from: периоды в командах идут по порядку и не пересекаются',
    );
  });

  it('rejects daily norms for a metric the season does not have', () => {
    const config = makeConfig({ managers: [manager('m1', 't1', { dailyNorms: { calls: 5 } })] });
    expect(problems(config)).toContain('managers.0.dailyNorms.calls: нет метрики calls');
  });

  it('rejects duplicate ids', () => {
    const config = makeConfig();
    expect(problems({ ...config, teams: [...config.teams, config.teams[0]] })).toContain(
      'teams: повторяется t1',
    );
  });

  it('requires pointsPerStep in absolute mode', () => {
    expect(problems(makeConfig({ progressMode: 'absolute' }))).toContain(
      'pointsPerStep: режим absolute требует pointsPerStep',
    );
  });

  it('requires exactly four locations and a valid team color', () => {
    const config = makeConfig();
    expect(problems({ ...config, locations: config.locations.slice(0, 3) }).length).toBeGreaterThan(0);
    const badColor = { ...config, teams: [{ ...config.teams[0], color: 'red' }] };
    expect(problems(badColor)).toContain('teams.0.color: цвет в формате #RRGGBB');
  });
});
```

`tests/unit/schemas/records.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AdjustmentSchema,
  ImportLogSchema,
  MetricRecordSchema,
} from '../../../src/data/schemas/records.ts';
import {
  at,
  daily,
  importLog,
  managerPoints,
  seasonReset,
  teamReset,
  teamSteps,
} from '../../support/builders.ts';

describe('AdjustmentSchema', () => {
  it('accepts every adjustment the engine applies', () => {
    for (const a of [
      teamSteps('a1', 't1', -2, at('2026-10-06')),
      teamReset('a2', 't1', 7, at('2026-10-06')),
      seasonReset('a3', { t1: 7, t2: 3 }, at('2026-10-06')),
      managerPoints('a4', 'm1', 15, at('2026-10-06')),
    ])
      expect(AdjustmentSchema.parse(a)).toEqual(a);
  });

  it('rejects a negative reset position and an unknown type', () => {
    expect(AdjustmentSchema.safeParse(teamReset('a', 't1', -1, at('2026-10-06'))).success).toBe(false);
    expect(
      AdjustmentSchema.safeParse({ ...teamSteps('a', 't1', 1, at('2026-10-06')), type: 'teleport' })
        .success,
    ).toBe(false);
  });

  it('requires a timestamp with an offset (D-11)', () => {
    const a = { ...teamSteps('a', 't1', 1, at('2026-10-06')), at: '2026-10-06 10:00' };
    expect(AdjustmentSchema.safeParse(a).success).toBe(false);
  });
});

describe('MetricRecordSchema', () => {
  it('accepts a daily record and rejects negative counts', () => {
    expect(MetricRecordSchema.parse(daily('m1', '2026-10-06', { pay: 2 }))).toEqual(
      daily('m1', '2026-10-06', { pay: 2 }),
    );
    expect(MetricRecordSchema.safeParse(daily('m1', '2026-10-06', { pay: -1 })).success).toBe(false);
  });
});

describe('ImportLogSchema', () => {
  it('requires a SHA-256 of the file (DATA-8)', () => {
    expect(ImportLogSchema.parse(importLog('i1', at('2026-10-06')))).toEqual(
      importLog('i1', at('2026-10-06')),
    );
    expect(
      ImportLogSchema.safeParse({ ...importLog('i1', at('2026-10-06')), fileSha256: 'abc' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 6: Run the schema tests**

Run: `npm test -- tests/unit/schemas`
Expected: PASS, 15 tests.

- [ ] **Step 7: Prove the engine lint rules bite**

Create a throwaway `src/engine/_probe.ts`:

```ts
import { SeasonConfigSchema } from '../data/schemas/season.ts';
export const probe = [SeasonConfigSchema, Date.now(), new Date()];
```

Run: `npx eslint src/engine/_probe.ts`
Expected: 3 errors — the value import from `../data/**`, `Date.now`, and `new Date()`.
Then delete `src/engine/_probe.ts` (`rm src/engine/_probe.ts`).

- [ ] **Step 8: Type-check, lint, test, commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all exit 0; 44 tests pass (29 from stage 0 + 15).

```bash
git add -A
git commit -m "Stage 1a: season, record and adjustment schemas; engine purity lint rules (DATA-13, ARCH-3, D-11, D-24)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dates and the game calendar

**Files:**
- Create: `src/engine/dates.ts`, `src/engine/calendar.ts`
- Test: `tests/unit/engine/dates.test.ts`, `tests/unit/engine/calendar.test.ts`

**Interfaces:**
- Consumes: type `SeasonConfig` (Task 1).
- Produces: `toDayNumber(date): number`, `fromDayNumber(day): string`, `addDays(date, days): string`, `daysBetween(from, to): number`, `isoWeekday(date): number` (1 = Mon … 7 = Sun), `eachDate(from, to): string[]`, `dateOf(timestamp): string`; `type Week = { index: number; start: string; end: string; workingDays: string[] }`, `type Calendar = { start: string; end: string; workingDays: string[]; weeks: Week[] }`, `buildCalendar(config: Pick<SeasonConfig, 'period' | 'workingDays' | 'holidays'>): Calendar`, `weekOf(calendar, date): Week | undefined`, `completedWorkingDays(calendar, today): number`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateOf,
  daysBetween,
  eachDate,
  fromDayNumber,
  isoWeekday,
  toDayNumber,
} from '../../../src/engine/dates.ts';

describe('dates', () => {
  it('converts calendar dates to day numbers and back', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(toDayNumber('2028-02-29'))).toBe('2028-02-29');
  });

  it('rejects anything that is not a real date', () => {
    for (const bad of ['2026-02-30', '2026-1-5', 'x', '2026-13-01'])
      expect(() => toDayNumber(bad)).toThrow(`не дата: ${bad}`);
  });

  it('adds days and measures distances across months and years', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysBetween('2026-10-05', '2026-10-18')).toBe(13);
  });

  it('knows the ISO weekday', () => {
    expect(isoWeekday('1970-01-01')).toBe(4);
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('lists every date of a range inclusively', () => {
    expect(eachDate('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(eachDate('2026-10-05', '2026-10-04')).toEqual([]);
  });

  it('takes the wall-clock date of a local timestamp (D-11)', () => {
    expect(dateOf('2026-10-06T00:30:00+03:00')).toBe('2026-10-06');
    expect(() => dateOf('yesterday')).toThrow();
  });
});
```

`tests/unit/engine/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCalendar, completedWorkingDays, weekOf } from '../../../src/engine/calendar.ts';

const cal = (start: string, end: string, extra: { holidays?: string[]; workingDays?: string[] } = {}) =>
  buildCalendar({ period: { start, end }, holidays: extra.holidays ?? [], workingDays: extra.workingDays });

describe('buildCalendar (D-24)', () => {
  it('a two-week game from Monday has 10 working days and 2 weeks', () => {
    const c = cal('2026-10-05', '2026-10-18');
    expect(c.workingDays).toHaveLength(10);
    expect([c.workingDays[0], c.workingDays.at(-1)]).toEqual(['2026-10-05', '2026-10-16']);
    expect(c.weeks.map((w) => [w.index, w.start, w.end, w.workingDays.length])).toEqual([
      [1, '2026-10-05', '2026-10-11', 5],
      [2, '2026-10-12', '2026-10-18', 5],
    ]);
  });

  it('removes holidays', () => {
    const c = cal('2026-10-05', '2026-10-18', { holidays: ['2026-10-07'] });
    expect(c.workingDays).toHaveLength(9);
    expect(c.workingDays).not.toContain('2026-10-07');
  });

  it('uses an explicit list of working days, e.g. a working Saturday', () => {
    const c = cal('2026-10-05', '2026-10-11', {
      workingDays: ['2026-10-10', '2026-10-05', '2026-10-05', '2026-10-20'],
    });
    expect(c.workingDays).toEqual(['2026-10-05', '2026-10-10']);
  });

  it('clips the weeks of a game that starts mid-week (OQ-19)', () => {
    const c = cal('2026-10-07', '2026-10-20');
    expect(c.weeks.map((w) => [w.start, w.end, w.workingDays.length])).toEqual([
      ['2026-10-07', '2026-10-11', 3],
      ['2026-10-12', '2026-10-18', 5],
      ['2026-10-19', '2026-10-20', 2],
    ]);
  });

  it('drops a leading weekend that has no working days', () => {
    const c = cal('2026-10-03', '2026-10-16');
    expect(c.weeks.map((w) => [w.index, w.start])).toEqual([
      [1, '2026-10-05'],
      [2, '2026-10-12'],
    ]);
  });

  it('refuses a game without working days', () => {
    expect(() => cal('2026-10-10', '2026-10-11')).toThrow('нет рабочих дней');
  });
});

describe('calendar queries', () => {
  const c = cal('2026-10-05', '2026-10-18');

  it('counts working days strictly before today (D-18)', () => {
    expect(completedWorkingDays(c, '2026-10-01')).toBe(0);
    expect(completedWorkingDays(c, '2026-10-05')).toBe(0);
    expect(completedWorkingDays(c, '2026-10-06')).toBe(1);
    expect(completedWorkingDays(c, '2026-10-12')).toBe(5);
    expect(completedWorkingDays(c, '2026-11-01')).toBe(10);
  });

  it('finds the week of a date', () => {
    expect(weekOf(c, '2026-10-14')?.index).toBe(2);
    expect(weekOf(c, '2026-10-30')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/dates tests/unit/engine/calendar`
Expected: FAIL — cannot resolve `src/engine/dates.ts` / `src/engine/calendar.ts`.

- [ ] **Step 3: Implement**

`src/engine/dates.ts`:

```ts
const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 of a calendar date `YYYY-MM-DD` (D-11); throws on anything else. */
export function toDayNumber(date: string): number {
  const match = DATE_RE.exec(date);
  const day = match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
    : Number.NaN;
  if (Number.isNaN(day) || fromDayNumber(day) !== date) throw new Error(`не дата: ${date}`);
  return day;
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** ISO weekday: 1 = Monday … 7 = Sunday (1970-01-01 was a Thursday). */
export function isoWeekday(date: string): number {
  return ((((toDayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = toDayNumber(from), last = toDayNumber(to); d <= last; d++) dates.push(fromDayNumber(d));
  return dates;
}

/** Calendar date of a local timestamp as written: `2026-10-06T00:30:00+03:00` → `2026-10-06` (D-11). */
export function dateOf(timestamp: string): string {
  const date = timestamp.slice(0, 10);
  toDayNumber(date);
  return date;
}
```

`src/engine/calendar.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';
import { eachDate, isoWeekday } from './dates.ts';

export type Week = { index: number; start: string; end: string; workingDays: string[] };
export type Calendar = { start: string; end: string; workingDays: string[]; weeks: Week[] };

/**
 * Working days and weeks of a game (D-24). Working days: the explicit list, or Mon–Fri of the
 * period minus holidays. Weeks: calendar weeks Mon–Sun clipped to the period; weeks without a
 * working day are dropped.
 */
export function buildCalendar(
  config: Pick<SeasonConfig, 'period' | 'workingDays' | 'holidays'>,
): Calendar {
  const { start, end } = config.period;
  const holidays = new Set(config.holidays);
  const workingDays = config.workingDays
    ? [...new Set(config.workingDays)].filter((d) => d >= start && d <= end).sort()
    : eachDate(start, end).filter((d) => isoWeekday(d) <= 5 && !holidays.has(d));
  if (workingDays.length === 0) throw new Error(`в игре ${start}…${end} нет рабочих дней`);

  const working = new Set(workingDays);
  const spans: Week[] = [];
  for (const day of eachDate(start, end)) {
    const current = spans[spans.length - 1];
    if (!current || isoWeekday(day) === 1) {
      spans.push({ index: 0, start: day, end: day, workingDays: working.has(day) ? [day] : [] });
    } else {
      current.end = day;
      if (working.has(day)) current.workingDays.push(day);
    }
  }
  const weeks = spans
    .filter((w) => w.workingDays.length > 0)
    .map((w, i) => ({ ...w, index: i + 1 }));
  return { start, end, workingDays, weeks };
}

export function weekOf(calendar: Calendar, date: string): Week | undefined {
  return calendar.weeks.find((w) => date >= w.start && date <= w.end);
}

/** Working days strictly before `today` (D-18). */
export function completedWorkingDays(calendar: Calendar, today: string): number {
  return calendar.workingDays.filter((d) => d < today).length;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/dates tests/unit/engine/calendar`
Expected: PASS, 14 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0; coverage of `src/engine` ≥ 90 % (only dates.ts and calendar.ts exist yet).

```bash
git add -A
git commit -m "Stage 1a: date arithmetic and game calendar with weeks (D-11, D-18, D-24)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Track geometry and the pace line

**Files:**
- Create: `src/engine/track.ts`, `src/engine/pace.ts`
- Test: `tests/unit/engine/track.test.ts`

**Interfaces:**
- Consumes: `Calendar`, `completedWorkingDays` (Task 2); type `SeasonConfig`.
- Produces: `type TrackLocation = { index: number; title: string; themePackId: string; firstCell: number; lastCell: number }`, `type Track = { cellsPerLocation: number; trackLength: number; overflowCells: number; maxPosition: number; locations: TrackLocation[] }`, `buildTrack(config: Pick<SeasonConfig, 'track' | 'locations'>, workingDayCount: number): Track`, `locationIndexOf(track, position): number`, `pacePosition(calendar, track, today): number`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/track.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { pacePosition } from '../../../src/engine/pace.ts';
import { buildTrack, locationIndexOf } from '../../../src/engine/track.ts';
import { makeConfig } from '../../support/builders.ts';

const locations = makeConfig().locations;
const track = (cellsPerWorkingDay: number, overflowPct: number, days: number) =>
  buildTrack({ track: { cellsPerWorkingDay, overflowPct }, locations }, days);

describe('buildTrack (D-24)', () => {
  it('2 cells a day over 10 working days: 20 cells, 5 per location, 50 % overflow', () => {
    const t = track(2, 50, 10);
    expect([t.cellsPerLocation, t.trackLength, t.overflowCells, t.maxPosition]).toEqual([5, 20, 10, 30]);
    expect(t.locations.map((l) => [l.index, l.firstCell, l.lastCell])).toEqual([
      [1, 1, 5],
      [2, 6, 10],
      [3, 11, 15],
      [4, 16, 20],
    ]);
  });

  it('rounds up so the four locations stay equal', () => {
    expect(track(2, 50, 9).trackLength).toBe(20);
    expect(track(3, 50, 9).trackLength).toBe(28);
  });

  it('keeps the spec arithmetic for 20 working days (FR-STEP-4)', () => {
    const t = track(2, 12.5, 20);
    expect([t.trackLength, t.overflowCells]).toEqual([40, 5]);
  });

  it('orders locations by index whatever the config order', () => {
    const t = buildTrack({ track: { cellsPerWorkingDay: 2, overflowPct: 0 }, locations: [...locations].reverse() }, 10);
    expect(t.locations.map((l) => l.themePackId)).toEqual(['ruins', 'ice', 'volcano', 'heaven']);
  });

  it('maps positions to locations: start → 1, overflow → 4', () => {
    const t = track(2, 50, 10);
    expect([0, 1, 5, 6, 20, 25].map((p) => locationIndexOf(t, p))).toEqual([1, 1, 1, 2, 4, 4]);
  });
});

describe('pacePosition (FR-PACE-1, D-18)', () => {
  const config = makeConfig();
  const calendar = buildCalendar(config);
  const t = buildTrack(config, calendar.workingDays.length);

  it('moves 2 cells per completed working day', () => {
    expect(pacePosition(calendar, t, '2026-10-01')).toBe(0);
    expect(pacePosition(calendar, t, '2026-10-05')).toBe(0);
    expect(pacePosition(calendar, t, '2026-10-06')).toBe(2);
    expect(pacePosition(calendar, t, '2026-10-12')).toBe(10);
    expect(pacePosition(calendar, t, '2026-10-20')).toBe(20);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/track`
Expected: FAIL — cannot resolve `src/engine/pace.ts` / `track.ts`.

- [ ] **Step 3: Implement**

`src/engine/track.ts`:

```ts
import type { SeasonConfig } from '../data/schemas/season.ts';

export type TrackLocation = {
  index: number;
  title: string;
  themePackId: string;
  firstCell: number;
  lastCell: number;
};

export type Track = {
  cellsPerLocation: number;
  /** The finish: 100 % of the plan. */
  trackLength: number;
  overflowCells: number;
  maxPosition: number;
  locations: TrackLocation[];
};

/**
 * Track geometry from the game's length (D-24): N cells per working day, rounded up so the four
 * locations are equal. Position 0 is the start before the first cell; cell `trackLength` is the
 * finish; the overflow zone after it holds the teams beyond the plan.
 */
export function buildTrack(
  config: Pick<SeasonConfig, 'track' | 'locations'>,
  workingDayCount: number,
): Track {
  const cellsPerLocation = Math.max(
    1,
    Math.ceil((config.track.cellsPerWorkingDay * workingDayCount) / 4),
  );
  const trackLength = 4 * cellsPerLocation;
  const overflowCells = Math.ceil((trackLength * config.track.overflowPct) / 100);
  const locations = [...config.locations]
    .sort((a, b) => a.index - b.index)
    .map((l) => ({
      index: l.index,
      title: l.title,
      themePackId: l.themePackId,
      firstCell: (l.index - 1) * cellsPerLocation + 1,
      lastCell: l.index * cellsPerLocation,
    }));
  return { cellsPerLocation, trackLength, overflowCells, maxPosition: trackLength + overflowCells, locations };
}

/** Location (1–4) of a position: the start counts as location 1, the overflow zone as 4. */
export function locationIndexOf(track: Track, position: number): number {
  if (position <= 0) return 1;
  return Math.min(4, Math.ceil(position / track.cellsPerLocation));
}
```

`src/engine/pace.ts`:

```ts
import { completedWorkingDays, type Calendar } from './calendar.ts';
import type { Track } from './track.ts';

const EPS = 1e-9;

/** Where a team exactly on plan stands after the completed working days (FR-PACE-1, D-18). */
export function pacePosition(calendar: Calendar, track: Track, today: string): number {
  const done = completedWorkingDays(calendar, today);
  return Math.floor((done / calendar.workingDays.length) * track.trackLength + EPS);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/track`
Expected: PASS, 6 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0, coverage ≥ 90 %.

```bash
git add -A
git commit -m "Stage 1a: track geometry from working days and the pace line (D-24, FR-PACE-1, D-18)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Roster — which team a manager is in

**Files:**
- Create: `src/engine/roster.ts`
- Test: `tests/unit/engine/roster.test.ts`

**Interfaces:**
- Consumes: `daysBetween` (Task 2), `Calendar`; types `Manager`, `Membership`.
- Produces: `effectiveMemberships(manager): Membership[]`, `teamOn(manager, date): string`, `workingDaysInTeam(manager, teamId, calendar): string[]`, `isFiredOn(manager, date): boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/roster.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import {
  effectiveMemberships,
  isFiredOn,
  teamOn,
  workingDaysInTeam,
} from '../../../src/engine/roster.ts';
import { makeConfig, manager } from '../../support/builders.ts';

const calendar = buildCalendar(makeConfig());
const transferred = manager('x', 't1', {
  memberships: [
    { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
    { teamId: 't2', from: '2026-10-12' },
  ],
});

describe('teamOn (R-1, OQ-11)', () => {
  it('uses the membership that covers the date', () => {
    expect(teamOn(transferred, '2026-10-08')).toBe('t1');
    expect(teamOn(transferred, '2026-10-13')).toBe('t2');
  });

  it('otherwise the nearest membership', () => {
    expect(teamOn(transferred, '2026-10-01')).toBe('t1');
    expect(teamOn(transferred, '2026-10-10')).toBe('t1'); // 1 day after t1, 2 before t2
    expect(teamOn(transferred, '2026-10-11')).toBe('t2'); // 2 days after t1, 1 before t2
  });

  it('on a tie prefers the later membership', () => {
    const gap = manager('g', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-08' },
        { teamId: 't2', from: '2026-10-12' },
      ],
    });
    expect(teamOn(gap, '2026-10-10')).toBe('t2');
  });

  it('gives a payment that arrives after firing to the last team', () => {
    const fired = manager('f', 't1', { firedAt: '2026-10-07' });
    expect(teamOn(fired, '2026-10-12')).toBe('t1');
  });

  it('falls back to all memberships if firing preceded every one of them', () => {
    const odd = manager('o', 't2', { firedAt: '2026-10-01' });
    expect(effectiveMemberships(odd)).toEqual([]);
    expect(teamOn(odd, '2026-10-06')).toBe('t2');
  });
});

describe('effectiveMemberships and working days (R-2, R-5)', () => {
  it('cuts memberships at the firing date', () => {
    const fired = manager('f', 't1', {
      firedAt: '2026-10-08',
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 't2', from: '2026-10-12' },
      ],
    });
    expect(effectiveMemberships(fired)).toEqual([{ teamId: 't1', from: '2026-10-05', to: '2026-10-08' }]);
  });

  it('counts only the working days spent in a team', () => {
    expect(workingDaysInTeam(transferred, 't1', calendar)).toHaveLength(5);
    expect(workingDaysInTeam(transferred, 't2', calendar)).toHaveLength(5);
    expect(workingDaysInTeam(manager('f', 't1', { firedAt: '2026-10-07' }), 't1', calendar)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
  });

  it('treats a manager as fired from the firing date on', () => {
    const fired = manager('f', 't1', { firedAt: '2026-10-07' });
    expect(isFiredOn(fired, '2026-10-06')).toBe(false);
    expect(isFiredOn(fired, '2026-10-07')).toBe(true);
    expect(isFiredOn(manager('a', 't1'), '2026-10-30')).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/roster`
Expected: FAIL — cannot resolve `src/engine/roster.ts`.

- [ ] **Step 3: Implement**

`src/engine/roster.ts`:

```ts
import type { Manager, Membership } from '../data/schemas/season.ts';
import type { Calendar } from './calendar.ts';
import { daysBetween } from './dates.ts';

const OPEN_END = '9999-12-31';

/** Memberships cut at the firing date: nobody belongs to a team after being fired (R-5). */
export function effectiveMemberships(manager: Manager): Membership[] {
  const fired = manager.firedAt;
  if (fired === undefined) return manager.memberships;
  return manager.memberships
    .filter((p) => p.from <= fired)
    .map((p) => ({ ...p, to: p.to !== undefined && p.to < fired ? p.to : fired }));
}

/**
 * Team that gets a manager's result for `date` (R-1): the membership covering the date,
 * otherwise the nearest one (a payment after firing goes to the last team, OQ-11);
 * on a tie the later membership wins.
 */
export function teamOn(manager: Manager, date: string): string {
  const effective = effectiveMemberships(manager);
  const pool = effective.length > 0 ? effective : manager.memberships;
  let best = pool[0] as Membership;
  let bestDistance = Infinity;
  for (const p of pool) {
    const to = p.to ?? OPEN_END;
    const distance = date < p.from ? daysBetween(date, p.from) : date > to ? daysBetween(to, date) : 0;
    if (distance <= bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best.teamId;
}

/** Working days of the game the manager spent in `teamId` (R-2, R-3). */
export function workingDaysInTeam(manager: Manager, teamId: string, calendar: Calendar): string[] {
  const periods = effectiveMemberships(manager).filter((p) => p.teamId === teamId);
  return calendar.workingDays.filter((d) => periods.some((p) => d >= p.from && d <= (p.to ?? OPEN_END)));
}

/** Fired managers leave the leaderboard from the firing date on (R-5, ADM-ROSTER-3). */
export function isFiredOn(manager: Manager, date: string): boolean {
  return manager.firedAt !== undefined && manager.firedAt <= date;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/roster`
Expected: PASS, 8 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0, coverage ≥ 90 %.

```bash
git add -A
git commit -m "Stage 1a: roster resolution — team on a date, days in a team, firing (R-1, R-2, R-5, OQ-11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scoring — daily series and points

**Files:**
- Create: `src/engine/scoring.ts`
- Test: `tests/unit/engine/scoring.test.ts`

**Interfaces:**
- Consumes: type `MetricRecord`, type `SeasonConfig`.
- Produces: `type MetricValues = Record<string, number>`, `type DailySeries = Map<string, Map<string, MetricValues>>` (managerId → date → values), `buildDailySeries(records, period: { start: string; end: string }): { series: DailySeries; warnings: string[] }`, `weightsOf(config: Pick<SeasonConfig, 'metrics'>): MetricValues`, `pointsOf(values, weights): number`, `addValues(into, values): MetricValues`, `totalsBetween(days: Map<string, MetricValues> | undefined, from, to): MetricValues`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addValues,
  buildDailySeries,
  pointsOf,
  totalsBetween,
  weightsOf,
} from '../../../src/engine/scoring.ts';
import { daily, makeConfig, snapshot } from '../../support/builders.ts';

const period = { start: '2026-10-05', end: '2026-10-18' };

describe('buildDailySeries (DATA-5, DATA-6, FR-STEP-5)', () => {
  it('merges daily records; the later value of a metric wins', () => {
    const records = [
      daily('m1', '2026-10-06', { inv6: 2, inv20: 1 }),
      daily('m1', '2026-10-06', { pay: 1 }, 'imp-2'),
      daily('m1', '2026-10-06', { inv6: 3 }, 'imp-3'),
    ];
    const { series } = buildDailySeries(records, period);
    expect(series.get('m1')?.get('2026-10-06')).toEqual({ inv6: 3, inv20: 1, pay: 1 });
  });

  it('re-importing the same records changes nothing', () => {
    const records = [daily('m1', '2026-10-06', { pay: 1 }), daily('m2', '2026-10-07', { inv6: 4 })];
    expect(buildDailySeries([...records, ...records], period)).toEqual(buildDailySeries(records, period));
  });

  it('ignores daily records outside the period (DATA-7)', () => {
    const { series } = buildDailySeries([daily('m1', '2026-10-02', { pay: 1 })], period);
    expect(series.size).toBe(0);
  });

  it('turns running-total snapshots into daily differences, counting from the last one before the start', () => {
    const records = [
      snapshot('m1', '2026-10-02', { pay: 4 }),
      snapshot('m1', '2026-10-06', { pay: 6 }),
      snapshot('m1', '2026-10-09', { pay: 9 }),
      snapshot('m1', '2026-10-20', { pay: 12 }),
    ];
    const days = buildDailySeries(records, period).series.get('m1');
    expect(Object.fromEntries(days ?? [])).toEqual({
      '2026-10-06': { pay: 2 },
      '2026-10-09': { pay: 3 },
    });
  });

  it('prefers daily records over snapshots of the same metric and says so', () => {
    const records = [
      daily('m1', '2026-10-06', { pay: 1 }),
      snapshot('m1', '2026-10-07', { pay: 5, inv6: 4 }),
    ];
    const { series, warnings } = buildDailySeries(records, period);
    expect(Object.fromEntries(series.get('m1') ?? [])).toEqual({
      '2026-10-06': { pay: 1 },
      '2026-10-07': { inv6: 4 },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('m1');
  });
});

describe('points', () => {
  it('scores with the season weights and ignores metrics the season does not have', () => {
    const weights = weightsOf(makeConfig());
    expect(weights).toEqual({ inv6: 1, inv20: 3, pay: 10 });
    expect(pointsOf({ inv6: 150, inv20: 80, pay: 60, calls: 99 }, weights)).toBe(990);
  });

  it('adds values and sums a manager over a date range', () => {
    expect(addValues({ pay: 1 }, { pay: 2, inv6: 1 })).toEqual({ pay: 3, inv6: 1 });
    const days = new Map([
      ['2026-10-06', { pay: 1 }],
      ['2026-10-07', { pay: 2, inv6: 3 }],
      ['2026-10-12', { pay: 5 }],
    ]);
    expect(totalsBetween(days, '2026-10-06', '2026-10-07')).toEqual({ pay: 3, inv6: 3 });
    expect(totalsBetween(undefined, '2026-10-06', '2026-10-07')).toEqual({});
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/scoring`
Expected: FAIL — cannot resolve `src/engine/scoring.ts`.

- [ ] **Step 3: Implement**

`src/engine/scoring.ts`:

```ts
import type { MetricRecord } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';

/** metricId → value. */
export type MetricValues = Record<string, number>;
/** managerId → date → that day's values. */
export type DailySeries = Map<string, Map<string, MetricValues>>;

/**
 * One value per manager, day and metric. Daily records merge in order — the later value of a
 * metric wins, so re-importing a file changes nothing (DATA-5, FR-STEP-5). Snapshots (running
 * totals, DATA-6) become day-to-day differences counted from the last snapshot before the
 * period. A metric that has daily records ignores that manager's snapshots. Days outside the
 * period are dropped (DATA-7).
 */
export function buildDailySeries(
  records: MetricRecord[],
  period: { start: string; end: string },
): { series: DailySeries; warnings: string[] } {
  const series: DailySeries = new Map();
  const warnings: string[] = [];
  const valuesOf = (managerId: string, date: string): MetricValues => {
    let days = series.get(managerId);
    if (!days) series.set(managerId, (days = new Map()));
    let values = days.get(date);
    if (!values) days.set(date, (values = {}));
    return values;
  };

  const dailyMetrics = new Map<string, Set<string>>();
  // managerId → metric → date → running total (the later record of a date wins)
  const snapshots = new Map<string, Map<string, Map<string, number>>>();
  for (const r of records) {
    if (r.kind === 'daily') {
      if (r.date < period.start || r.date > period.end) continue;
      Object.assign(valuesOf(r.managerId, r.date), r.values);
      let metrics = dailyMetrics.get(r.managerId);
      if (!metrics) dailyMetrics.set(r.managerId, (metrics = new Set()));
      for (const metric of Object.keys(r.values)) metrics.add(metric);
    } else {
      let byMetric = snapshots.get(r.managerId);
      if (!byMetric) snapshots.set(r.managerId, (byMetric = new Map()));
      for (const [metric, total] of Object.entries(r.values)) {
        let byDate = byMetric.get(metric);
        if (!byDate) byMetric.set(metric, (byDate = new Map()));
        byDate.set(r.date, total);
      }
    }
  }

  for (const [managerId, byMetric] of snapshots) {
    for (const [metric, byDate] of byMetric) {
      if (dailyMetrics.get(managerId)?.has(metric)) {
        warnings.push(`${managerId}: «${metric}» есть и по дням, и снимками — снимки не учтены`);
        continue;
      }
      let previous = 0;
      for (const [date, total] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
        if (date > period.end) break;
        if (date >= period.start) valuesOf(managerId, date)[metric] = total - previous;
        previous = total;
      }
    }
  }
  return { series, warnings };
}

export function weightsOf(config: Pick<SeasonConfig, 'metrics'>): MetricValues {
  return Object.fromEntries(config.metrics.map((m) => [m.id, m.weight]));
}

/** Σ value × weight over the season's metrics (FR-SCORE-1). */
export function pointsOf(values: MetricValues, weights: MetricValues): number {
  let points = 0;
  for (const [metric, weight] of Object.entries(weights)) points += (values[metric] ?? 0) * weight;
  return points;
}

export function addValues(into: MetricValues, values: MetricValues): MetricValues {
  for (const [metric, value] of Object.entries(values)) into[metric] = (into[metric] ?? 0) + value;
  return into;
}

/** A manager's values summed over [from, to]. */
export function totalsBetween(
  days: Map<string, MetricValues> | undefined,
  from: string,
  to: string,
): MetricValues {
  const totals: MetricValues = {};
  for (const [date, values] of days ?? []) if (date >= from && date <= to) addValues(totals, values);
  return totals;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/scoring`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0, coverage ≥ 90 %.

```bash
git add -A
git commit -m "Stage 1a: daily series from records and snapshots, weighted points (FR-SCORE-1, DATA-5, DATA-6, FR-STEP-5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Team targets and headcount

**Files:**
- Create: `src/engine/targets.ts`
- Test: `tests/unit/engine/targets.test.ts`

**Interfaces:**
- Consumes: `workingDaysInTeam` (Task 4), `pointsOf`, `weightsOf`, `MetricValues` (Task 5), `Calendar`, types `Manager`, `SeasonConfig`.
- Produces: `dailyTargetPoints(manager, weights, defaultDailyTargetPoints): number`, `teamTargetPoints(teamId, config, calendar, weights): number`, `averageHeadcount(teamId, config, calendar): number`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/targets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { weightsOf } from '../../../src/engine/scoring.ts';
import {
  averageHeadcount,
  dailyTargetPoints,
  teamTargetPoints,
} from '../../../src/engine/targets.ts';
import { makeConfig, manager, team } from '../../support/builders.ts';

const norms = { inv6: 2, inv20: 1, pay: 0.5 }; // 2·1 + 1·3 + 0.5·10 = 10 points a day

function target(config: ReturnType<typeof makeConfig>, teamId = 't1') {
  return teamTargetPoints(teamId, config, buildCalendar(config), weightsOf(config));
}

describe('dailyTargetPoints (R-2, D-24)', () => {
  it('daily norms × weights, or the default without norms', () => {
    const weights = weightsOf(makeConfig());
    expect(dailyTargetPoints(manager('a', 't1', { dailyNorms: norms }), weights, 7.5)).toBe(10);
    expect(dailyTargetPoints(manager('b', 't1'), weights, 7.5)).toBe(7.5);
  });
});

describe('teamTargetPoints (FR-STEP-1, R-2)', () => {
  it('no norms: the default daily target over every working day', () => {
    expect(target(makeConfig({ managers: [manager('a', 't1'), manager('b', 't1')] }))).toBe(150);
  });

  it('daily norms × weights over the working days', () => {
    const config = makeConfig({
      managers: [manager('a', 't1', { dailyNorms: norms }), manager('b', 't1')],
    });
    expect(target(config)).toBe(100 + 75);
  });

  it('counts only the days spent in the team: joined late, fired, transferred', () => {
    const config = makeConfig({
      managers: [
        manager('late', 't1', { memberships: [{ teamId: 't1', from: '2026-10-12' }] }),
        manager('fired', 't1', { firedAt: '2026-10-07' }),
        manager('moved', 't1', {
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-12' },
          ],
        }),
      ],
    });
    expect(target(config, 't1')).toBe((5 + 3 + 5) * 7.5);
    expect(target(config, 't2')).toBe(5 * 7.5);
  });

  it('an explicit team target wins', () => {
    const config = makeConfig({ teams: [team('t1', 1, { targetPoints: 500 })], managers: [manager('a', 't1')] });
    expect(target(config)).toBe(500);
  });

  it('follows the weights (R-4)', () => {
    const config = makeConfig({ managers: [manager('a', 't1', { dailyNorms: norms })] });
    const heavierPay = {
      ...config,
      metrics: config.metrics.map((m) => (m.id === 'pay' ? { ...m, weight: 20 } : m)),
    };
    expect(target(config)).toBe(100);
    expect(target(heavierPay)).toBe(150);
  });
});

describe('averageHeadcount (R-3)', () => {
  it('member working days divided by the game working days', () => {
    const config = makeConfig({
      managers: [manager('a', 't1'), manager('late', 't1', { memberships: [{ teamId: 't1', from: '2026-10-12' }] })],
    });
    expect(averageHeadcount('t1', config, buildCalendar(config))).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/targets`
Expected: FAIL — cannot resolve `src/engine/targets.ts`.

- [ ] **Step 3: Implement**

`src/engine/targets.ts`:

```ts
import type { Manager, SeasonConfig } from '../data/schemas/season.ts';
import type { Calendar } from './calendar.ts';
import { workingDaysInTeam } from './roster.ts';
import { pointsOf, type MetricValues } from './scoring.ts';

/** A manager's target for one working day: daily norms × weights (R-2), else the default (D-24). */
export function dailyTargetPoints(
  manager: Manager,
  weights: MetricValues,
  defaultDailyTargetPoints: number,
): number {
  return manager.dailyNorms ? pointsOf(manager.dailyNorms, weights) : defaultDailyTargetPoints;
}

/** Points that make 100 % of the plan (FR-STEP-1): explicit, else Σ over members' days in the team (R-2). */
export function teamTargetPoints(
  teamId: string,
  config: SeasonConfig,
  calendar: Calendar,
  weights: MetricValues,
): number {
  const explicit = config.teams.find((t) => t.id === teamId)?.targetPoints;
  if (explicit !== undefined) return explicit;
  let target = 0;
  for (const m of config.managers)
    target +=
      workingDaysInTeam(m, teamId, calendar).length *
      dailyTargetPoints(m, weights, config.defaultDailyTargetPoints);
  return target;
}

/** Average headcount over the game: member working days / game working days (R-3). */
export function averageHeadcount(teamId: string, config: SeasonConfig, calendar: Calendar): number {
  let days = 0;
  for (const m of config.managers) days += workingDaysInTeam(m, teamId, calendar).length;
  return days / calendar.workingDays.length;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/targets`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0, coverage ≥ 90 %.

```bash
git add -A
git commit -m "Stage 1a: team targets from daily norms over days in the team, average headcount (FR-STEP-1, R-2, R-3, R-4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Progress, positions and admin adjustments

**Files:**
- Create: `src/engine/adjustments.ts`, `src/engine/progress.ts`
- Test: `tests/unit/engine/progress.test.ts`

**Interfaces:**
- Consumes: `dateOf` (Task 2), `Calendar`, `Track` (Task 3), `teamOn` (Task 4), `DailySeries`, `pointsOf`, `weightsOf` (Task 5), `averageHeadcount`, `teamTargetPoints` (Task 6); types `Adjustment`, `SeasonConfig`, `Team`.
- Produces: `activeAdjustments(adjustments, asOf): Adjustment[]`; `type TeamProgress = { teamId: string; points: number; targetPoints: number; progress: number; computedPosition: number; position: number }`; `type ProgressInput = { config: SeasonConfig; calendar: Calendar; track: Track; series: DailySeries; adjustments: Adjustment[]; asOf: string }`; `teamPoints(input): Map<string, number>`; `computeTeamProgress(input): TeamProgress[]` (teams sorted by `order`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { activeAdjustments } from '../../../src/engine/adjustments.ts';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeTeamProgress } from '../../../src/engine/progress.ts';
import { buildDailySeries } from '../../../src/engine/scoring.ts';
import { buildTrack } from '../../../src/engine/track.ts';
import {
  at,
  daily,
  makeConfig,
  manager,
  managerPoints,
  seasonReset,
  teamReset,
  teamSteps,
} from '../../support/builders.ts';

// t1: a + b without norms → target 2 × 7.5 × 10 = 150; t2: c → 75. Track: 20 cells, max 30.
const base = makeConfig({ managers: [manager('a', 't1'), manager('b', 't1'), manager('c', 't2')] });

function progress(
  records: MetricRecord[],
  adjustments: Adjustment[] = [],
  config: SeasonConfig = base,
  asOf = '2026-10-18',
) {
  const calendar = buildCalendar(config);
  const track = buildTrack(config, calendar.workingDays.length);
  const { series } = buildDailySeries(records, config.period);
  const result = computeTeamProgress({ config, calendar, track, series, adjustments, asOf });
  return Object.fromEntries(result.map((t) => [t.teamId, t]));
}

const half = [daily('a', '2026-10-06', { pay: 5 }), daily('b', '2026-10-07', { inv20: 5, inv6: 10 })]; // 75 points

describe('computeTeamProgress — plan_percent', () => {
  it('half the plan puts the team at half the track', () => {
    const t1 = progress(half).t1;
    expect([t1?.points, t1?.targetPoints, t1?.progress, t1?.position]).toEqual([75, 150, 0.5, 10]);
  });

  it('caps a team beyond the plan at the end of the overflow zone (D-24)', () => {
    expect(progress([daily('a', '2026-10-06', { pay: 30 })]).t1?.position).toBe(30);
  });

  it("gives each day's points to the team the manager was in that day (R-1)", () => {
    const moved = manager('x', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 't2', from: '2026-10-12' },
      ],
    });
    const config = { ...base, managers: [...base.managers, moved] };
    const result = progress(
      [daily('x', '2026-10-06', { pay: 1 }), daily('x', '2026-10-13', { pay: 2 })],
      [],
      config,
    );
    expect([result.t1?.points, result.t2?.points]).toEqual([10, 20]);
  });

  it('counts only data up to asOf and ignores managers not in the roster', () => {
    const records = [...half, daily('a', '2026-10-14', { pay: 3 }), daily('ghost', '2026-10-06', { pay: 9 })];
    expect(progress(records, [], base, '2026-10-07').t1?.points).toBe(75);
  });

  it('never moves a team below the start, even with negative points', () => {
    expect(progress([], [managerPoints('p', 'a', -50, at('2026-10-06'))]).t1?.position).toBe(0);
  });
});

describe('computeTeamProgress — other modes', () => {
  it('per_capita: points against the default target per average member', () => {
    const normed = {
      ...base,
      managers: [manager('a', 't1', { dailyNorms: { inv6: 2, inv20: 1, pay: 0.5 } }), manager('b', 't1')],
    };
    expect(progress(half, [], normed).t1?.position).toBe(8); // plan_percent: 75 / 175
    expect(progress(half, [], { ...normed, progressMode: 'per_capita' }).t1?.position).toBe(10); // 75 / 150
  });

  it('absolute: one cell per pointsPerStep', () => {
    const config = { ...base, progressMode: 'absolute' as const, pointsPerStep: 10 };
    expect(progress(half, [], config).t1?.position).toBe(7);
  });

  it('absolute without pointsPerStep is a config error', () => {
    expect(() => progress(half, [], { ...base, progressMode: 'absolute' })).toThrow('pointsPerStep');
  });
});

describe('adjustments (ADM-STEPS, ADM-RESET, D-17)', () => {
  it('manager_points add to the team; revoked and future ones do not', () => {
    const revoked = {
      ...managerPoints('r', 'a', 100, at('2026-10-06')),
      revoked: { by: 'admin', at: at('2026-10-06', '13:00'), reason: 'ошибка' },
    };
    const result = progress(
      half,
      [managerPoints('p', 'a', 15, at('2026-10-06')), revoked, managerPoints('f', 'a', 100, at('2026-10-20'))],
    );
    expect(result.t1?.points).toBe(90);
  });

  it('team_steps move the figure', () => {
    expect(progress(half, [teamSteps('s', 't1', 3, at('2026-10-06'))]).t1?.position).toBe(13);
    expect(progress(half, [teamSteps('s', 't1', -20, at('2026-10-06'))]).t1?.position).toBe(0);
  });

  it('team_reset removes the position it stored; steps before it are dropped', () => {
    const adjustments = [
      teamSteps('s1', 't1', 2, at('2026-10-06', '10:00')),
      teamReset('r', 't1', 10, at('2026-10-07')),
      teamSteps('s2', 't1', 1, at('2026-10-08')),
    ];
    expect(progress(half, adjustments).t1?.position).toBe(1); // 10 − 10 + 1
    const more = [...half, daily('b', '2026-10-09', { pay: 3 })]; // 105 → 14
    expect(progress(more, adjustments).t1?.position).toBe(5); // 14 − 10 + 1
  });

  it('season_reset resets every team with its own stored position', () => {
    const result = progress(
      [...half, daily('c', '2026-10-06', { pay: 3 })], // t1 → 10, t2: 30 / 75 → 8
      [seasonReset('r', { t1: 10, t2: 8 }, at('2026-10-08'))],
    );
    expect([result.t1?.position, result.t2?.position]).toEqual([0, 0]);
  });
});

describe('activeAdjustments', () => {
  it('orders by real time across offsets and drops revoked and later ones', () => {
    const early = teamSteps('early', 't1', 1, '2026-10-06T10:00:00+03:00'); // 07:00 UTC
    const late = teamSteps('late', 't1', 1, '2026-10-06T08:00:00Z');
    const next = teamSteps('next', 't1', 1, at('2026-10-07'));
    expect(activeAdjustments([late, next, early], '2026-10-06').map((a) => a.id)).toEqual(['early', 'late']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/progress`
Expected: FAIL — cannot resolve `src/engine/adjustments.ts` / `progress.ts`.

- [ ] **Step 3: Implement**

`src/engine/adjustments.ts`:

```ts
import type { Adjustment } from '../data/schemas/records.ts';
import { dateOf } from './dates.ts';

/** Adjustments in force on `asOf` (ADM-1, ADM-UNDO): not revoked, made on or before that date, oldest first. */
export function activeAdjustments(adjustments: Adjustment[], asOf: string): Adjustment[] {
  return adjustments
    .filter((a) => !a.revoked && dateOf(a.at) <= asOf)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
```

`src/engine/progress.ts`:

```ts
import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import { activeAdjustments } from './adjustments.ts';
import type { Calendar } from './calendar.ts';
import { dateOf } from './dates.ts';
import { teamOn } from './roster.ts';
import { pointsOf, weightsOf, type DailySeries } from './scoring.ts';
import { averageHeadcount, teamTargetPoints } from './targets.ts';
import type { Track } from './track.ts';

export type TeamProgress = {
  teamId: string;
  points: number;
  targetPoints: number;
  progress: number;
  /** Position from the data alone. */
  computedPosition: number;
  /** Position after admin steps and resets — where the figure stands. */
  position: number;
};

export type ProgressInput = {
  config: SeasonConfig;
  calendar: Calendar;
  track: Track;
  series: DailySeries;
  adjustments: Adjustment[];
  asOf: string;
};

const EPS = 1e-9;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Team points up to `asOf` (FR-SCORE-4, R-1): each day goes to the team the manager was in. */
export function teamPoints(input: ProgressInput): Map<string, number> {
  const { config, series, asOf } = input;
  const weights = weightsOf(config);
  const points = new Map(config.teams.map((t) => [t.id, 0]));
  const managers = new Map(config.managers.map((m) => [m.id, m]));
  const add = (teamId: string, value: number) => points.set(teamId, (points.get(teamId) ?? 0) + value);
  for (const [managerId, days] of series) {
    const manager = managers.get(managerId);
    if (!manager) continue;
    for (const [date, values] of days) if (date <= asOf) add(teamOn(manager, date), pointsOf(values, weights));
  }
  for (const a of activeAdjustments(input.adjustments, asOf)) {
    if (a.type !== 'manager_points') continue;
    const manager = managers.get(a.managerId);
    if (manager) add(teamOn(manager, dateOf(a.at)), a.value);
  }
  return points;
}

function placeFromData(team: Team, points: number, input: ProgressInput) {
  const { config, calendar, track } = input;
  if (config.progressMode === 'absolute') {
    if (config.pointsPerStep === undefined) throw new Error('режим absolute требует pointsPerStep');
    const targetPoints = config.pointsPerStep * track.trackLength;
    return {
      targetPoints,
      progress: points / targetPoints,
      computedPosition: clamp(Math.floor(points / config.pointsPerStep + EPS), 0, track.maxPosition),
    };
  }
  const targetPoints =
    config.progressMode === 'per_capita'
      ? averageHeadcount(team.id, config, calendar) *
        config.defaultDailyTargetPoints *
        calendar.workingDays.length
      : teamTargetPoints(team.id, config, calendar, weightsOf(config));
  const progress = targetPoints > 0 ? points / targetPoints : 0;
  return {
    targetPoints,
    progress,
    computedPosition: clamp(Math.floor(progress * track.trackLength + EPS), 0, track.maxPosition),
  };
}

/** Admin steps and resets in time order on top of the computed position (FR-STEP-3, D-17). */
function adjustedPosition(teamId: string, computed: number, adjustments: Adjustment[], max: number): number {
  let removed = 0;
  let steps = 0;
  for (const a of adjustments) {
    if (a.type === 'team_reset' && a.teamId === teamId) {
      removed = a.value;
      steps = 0;
    } else if (a.type === 'season_reset') {
      removed = a.value[teamId] ?? 0;
      steps = 0;
    } else if (a.type === 'team_steps' && a.teamId === teamId) {
      steps += a.value;
    }
  }
  return clamp(computed - removed + steps, 0, max);
}

/** Progress and track position of every team on `asOf` (FR-STEP-1…3, D-17, D-24). */
export function computeTeamProgress(input: ProgressInput): TeamProgress[] {
  const points = teamPoints(input);
  const adjustments = activeAdjustments(input.adjustments, input.asOf);
  return [...input.config.teams]
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const teamPointsValue = points.get(team.id) ?? 0;
      const place = placeFromData(team, teamPointsValue, input);
      return {
        teamId: team.id,
        points: teamPointsValue,
        ...place,
        position: adjustedPosition(team.id, place.computedPosition, adjustments, input.track.maxPosition),
      };
    });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/progress`
Expected: PASS, 13 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0, coverage ≥ 90 %.

```bash
git add -A
git commit -m "Stage 1a: team progress and positions with steps, resets and point adjustments (FR-STEP-1..3, FR-SCORE-4, D-17, D-24)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Manager leaderboard

**Files:**
- Create: `src/engine/leaderboard.ts`
- Test: `tests/unit/engine/leaderboard.test.ts`

**Interfaces:**
- Consumes: `activeAdjustments` (Task 7), `dateOf`, `isFiredOn`, `teamOn`, `pointsOf`, `totalsBetween`, `weightsOf`, `DailySeries`, `MetricValues`; types `Adjustment`, `SeasonConfig`.
- Produces: `type LeaderboardRow = { managerId: string; fullName: string; teamId: string; fired: boolean; totals: MetricValues; points: number; rank: number | null }`; `type LeaderboardInput = { config: SeasonConfig; series: DailySeries; adjustments: Adjustment[]; from: string; to: string; today: string }`; `buildLeaderboard(input): LeaderboardRow[]` — ranked rows first, then fired rows with `rank: null`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/leaderboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { buildLeaderboard } from '../../../src/engine/leaderboard.ts';
import { buildDailySeries } from '../../../src/engine/scoring.ts';
import { at, daily, makeConfig, manager, managerPoints } from '../../support/builders.ts';

const config = makeConfig({
  managers: [
    manager('a', 't1'),
    manager('b', 't1'),
    manager('c', 't2'),
    manager('d', 't2', { firedAt: '2026-10-09' }),
  ],
});
const records = [
  daily('a', '2026-10-06', { pay: 2 }), // 20
  daily('b', '2026-10-06', { inv20: 5, inv6: 5 }), // 20
  daily('c', '2026-10-06', { pay: 1, inv20: 3, inv6: 1 }), // 20
  daily('d', '2026-10-06', { pay: 5 }), // 50, fired
];

function board(
  input: { records?: MetricRecord[]; adjustments?: Adjustment[]; config?: SeasonConfig; from?: string; to?: string } = {},
) {
  const c = input.config ?? config;
  return buildLeaderboard({
    config: c,
    series: buildDailySeries(input.records ?? records, c.period).series,
    adjustments: input.adjustments ?? [],
    from: input.from ?? '2026-10-05',
    to: input.to ?? '2026-10-18',
    today: '2026-10-16',
  });
}

describe('buildLeaderboard (FR-LB-1, FR-LB-5, D-16, R-5)', () => {
  it('breaks equal points by metrics of falling weight: pay, then inv20', () => {
    expect(board().map((r) => [r.managerId, r.points, r.rank])).toEqual([
      ['a', 20, 1],
      ['c', 20, 2],
      ['b', 20, 3],
      ['d', 50, null],
    ]);
  });

  it('then by name in Russian alphabetical order', () => {
    const twins = makeConfig({
      managers: [manager('x', 't1', { fullName: 'Борисов Борис' }), manager('y', 't1', { fullName: 'Алексеев Алексей' })],
    });
    const rows = board({ config: twins, records: [daily('x', '2026-10-06', { pay: 1 }), daily('y', '2026-10-06', { pay: 1 })] });
    expect(rows.map((r) => r.fullName)).toEqual(['Алексеев Алексей', 'Борисов Борис']);
  });

  it('lists fired managers last without a rank, keeping their totals', () => {
    const d = board().find((r) => r.managerId === 'd');
    expect([d?.fired, d?.rank, d?.totals]).toEqual([true, null, { pay: 5 }]);
  });

  it('counts only the range and point adjustments made in it', () => {
    const rows = board({
      records: [...records, daily('b', '2026-10-13', { pay: 1 })],
      adjustments: [managerPoints('p', 'c', 30, at('2026-10-14')), managerPoints('q', 'a', 99, at('2026-10-06'))],
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(rows.slice(0, 3).map((r) => [r.managerId, r.points])).toEqual([
      ['c', 30],
      ['b', 10],
      ['a', 0],
    ]);
  });

  it("shows the manager's current team after a transfer", () => {
    const moved = makeConfig({
      managers: [
        manager('m', 't1', {
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-12' },
          ],
        }),
      ],
    });
    expect(board({ config: moved, records: [] })[0]?.teamId).toBe('t2');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/leaderboard`
Expected: FAIL — cannot resolve `src/engine/leaderboard.ts`.

- [ ] **Step 3: Implement**

`src/engine/leaderboard.ts`:

```ts
import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { activeAdjustments } from './adjustments.ts';
import { dateOf } from './dates.ts';
import { isFiredOn, teamOn } from './roster.ts';
import { pointsOf, totalsBetween, weightsOf, type DailySeries, type MetricValues } from './scoring.ts';

export type LeaderboardRow = {
  managerId: string;
  fullName: string;
  /** Current team (on `today`). */
  teamId: string;
  fired: boolean;
  totals: MetricValues;
  points: number;
  /** 1-based; `null` for fired managers (R-5). */
  rank: number | null;
};

export type LeaderboardInput = {
  config: SeasonConfig;
  series: DailySeries;
  adjustments: Adjustment[];
  from: string;
  to: string;
  today: string;
};

/**
 * Managers by points over [from, to] (FR-LB-1). Equal points: metrics in order of falling
 * weight, then the name (FR-LB-5, D-16). Fired managers go last, without a rank (R-5).
 */
export function buildLeaderboard(input: LeaderboardInput): LeaderboardRow[] {
  const { config, series, from, to, today } = input;
  const weights = weightsOf(config);
  const bonus = new Map<string, number>();
  for (const a of activeAdjustments(input.adjustments, today)) {
    if (a.type !== 'manager_points') continue;
    const date = dateOf(a.at);
    if (date >= from && date <= to) bonus.set(a.managerId, (bonus.get(a.managerId) ?? 0) + a.value);
  }

  const rows: LeaderboardRow[] = config.managers.map((m) => {
    const totals = totalsBetween(series.get(m.id), from, to);
    return {
      managerId: m.id,
      fullName: m.fullName,
      teamId: teamOn(m, today),
      fired: isFiredOn(m, today),
      totals,
      points: pointsOf(totals, weights) + (bonus.get(m.id) ?? 0),
      rank: null,
    };
  });

  const tieMetrics = [...config.metrics]
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .map((m) => m.id);
  const compare = (a: LeaderboardRow, b: LeaderboardRow): number => {
    if (b.points !== a.points) return b.points - a.points;
    for (const metric of tieMetrics) {
      const diff = (b.totals[metric] ?? 0) - (a.totals[metric] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.fullName.localeCompare(b.fullName, 'ru') || a.managerId.localeCompare(b.managerId);
  };

  const ranked = rows
    .filter((r) => !r.fired)
    .sort(compare)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return [...ranked, ...rows.filter((r) => r.fired).sort(compare)];
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/leaderboard`
Expected: PASS, 5 tests.

- [ ] **Step 5: Type-check, lint, engine coverage, commit**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0, coverage ≥ 90 %.

```bash
git add -A
git commit -m "Stage 1a: manager leaderboard with weight-ordered tie-breaks, fired managers unranked (FR-LB-1, FR-LB-5, D-16, R-5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Game state, timeline, FR-STEP-4 and the 50 ms budget

**Files:**
- Create: `src/engine/prepare.ts`, `src/engine/timeline.ts`, `src/engine/gameState.ts`
- Test: `tests/unit/engine/gameState.test.ts`, `tests/unit/engine/perf.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `type EngineInput = { config: SeasonConfig; records: MetricRecord[]; adjustments: Adjustment[]; imports: ImportLog[] }`; `type Prepared = EngineInput & { calendar: Calendar; track: Track; series: DailySeries; warnings: string[] }`; `prepare(input): Prepared`; `type TimelineDay = { date: string; pacePosition: number; teams: TeamProgress[] }`; `buildTimeline(prepared, today): TimelineDay[]`; `type Unlock = { achievementId: string; managerId?: string; teamId?: string; unlockedAt: string; source: 'auto' | 'manual' }`; `type TeamState = TeamProgress & { pacePosition: number; deltaVsPace: number; locationIndex: number; headcount: number }`; `type ManagerState = LeaderboardRow & { weekly: Record<number, number> }`; `type GameState = { today: string; calendar: Calendar; track: Track; teams: TeamState[]; managers: ManagerState[]; unlocks: Unlock[]; dataAsOf: string | null; warnings: string[] }`; `computeGameState(input: EngineInput, now: string): GameState`. Plan 1b fills `unlocks`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/engine/gameState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MetricRecord } from '../../../src/data/schemas/records.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { prepare, type EngineInput } from '../../../src/engine/prepare.ts';
import { buildTimeline } from '../../../src/engine/timeline.ts';
import { at, daily, importLog, makeConfig, manager, team } from '../../support/builders.ts';

const input = (records: MetricRecord[], extra: Partial<EngineInput> = {}): EngineInput => ({
  config: makeConfig({ managers: [manager('a', 't1'), manager('b', 't1'), manager('c', 't2', { firedAt: '2026-10-09' })] }),
  records,
  adjustments: [],
  imports: [],
  ...extra,
});

describe('computeGameState', () => {
  it('reproduces the spec example: 990 of 1200 points → cell 33 of 40 (FR-STEP-4, D-24)', () => {
    const config = makeConfig({
      period: { start: '2026-10-05', end: '2026-10-30' }, // 20 working days → 40 cells
      teams: [team('t1', 1)],
      managers: Array.from({ length: 8 }, (_, i) => manager(`m${i + 1}`, 't1')),
    });
    const records = [
      daily('m1', '2026-10-07', { pay: 60 }),
      daily('m2', '2026-10-07', { inv20: 80 }),
      daily('m3', '2026-10-07', { inv6: 150 }),
    ];
    const state = computeGameState({ config, records, adjustments: [], imports: [] }, at('2026-10-30', '18:00'));
    expect(state.track.trackLength).toBe(40);
    const t1 = state.teams[0];
    expect([t1?.targetPoints, t1?.points, t1?.progress, t1?.position, t1?.locationIndex]).toEqual([
      1200, 990, 0.825, 33, 4,
    ]);
  });

  it('is deterministic and ignores a repeated import (FR-STEP-5)', () => {
    const records = [daily('a', '2026-10-06', { pay: 2 }), daily('b', '2026-10-07', { inv6: 5 })];
    const now = at('2026-10-12');
    expect(computeGameState(input(records), now)).toEqual(computeGameState(input(records), now));
    expect(computeGameState(input([...records, ...records]), now)).toEqual(computeGameState(input(records), now));
  });

  it('places teams against the pace line and in locations (FR-PACE-1, FR-PACE-3)', () => {
    const state = computeGameState(input([daily('a', '2026-10-06', { pay: 3 })]), at('2026-10-12')); // 30 / 150 → 4
    const t1 = state.teams.find((t) => t.teamId === 't1');
    expect([t1?.position, t1?.pacePosition, t1?.deltaVsPace, t1?.locationIndex, t1?.headcount]).toEqual([4, 10, -6, 1, 2]);
  });

  it('gives managers weekly points and hides the fired from the ranking (R-5)', () => {
    const records = [daily('a', '2026-10-06', { pay: 1 }), daily('a', '2026-10-13', { pay: 2 }), daily('c', '2026-10-06', { pay: 9 })];
    const state = computeGameState(input(records), at('2026-10-16'));
    const a = state.managers.find((m) => m.managerId === 'a');
    expect([a?.points, a?.weekly, a?.rank]).toEqual([30, { 1: 10, 2: 20 }, 1]);
    expect(state.managers.find((m) => m.managerId === 'c')?.rank).toBeNull();
  });

  it('reports the latest import as dataAsOf and warns about unknown managers', () => {
    const imports = [importLog('i1', '2026-10-12T09:00:00+03:00'), importLog('i2', '2026-10-12T07:00:00Z')];
    const state = computeGameState(input([daily('ghost', '2026-10-06', { pay: 1 })], { imports }), at('2026-10-12'));
    expect(state.dataAsOf).toBe('2026-10-12T07:00:00Z');
    expect(state.warnings.some((w) => w.includes('ghost'))).toBe(true);
    expect(state.unlocks).toEqual([]);
    expect(computeGameState(input([]), at('2026-10-12')).dataAsOf).toBeNull();
  });
});

describe('buildTimeline', () => {
  it('gives standings at the end of every completed working day', () => {
    const records = [daily('a', '2026-10-05', { pay: 3 }), daily('b', '2026-10-07', { pay: 3 })];
    const timeline = buildTimeline(prepare(input(records)), '2026-10-08');
    expect(timeline.map((d) => [d.date, d.pacePosition, d.teams[0]?.position])).toEqual([
      ['2026-10-05', 2, 4],
      ['2026-10-06', 4, 4],
      ['2026-10-07', 6, 8],
    ]);
  });
});
```

`tests/unit/engine/perf.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { prepare, type EngineInput } from '../../../src/engine/prepare.ts';
import { buildTimeline } from '../../../src/engine/timeline.ts';
import { at, daily, makeConfig, manager, team } from '../../support/builders.ts';

/** A month-long game, 6 teams, 70 managers, a record per manager and working day (NFR-LOAD-3). */
function bigInput(): EngineInput {
  const teams = Array.from({ length: 6 }, (_, i) => team(`t${i + 1}`, i + 1));
  const managers = Array.from({ length: 70 }, (_, i) =>
    manager(`m${i + 1}`, `t${(i % 6) + 1}`, { memberships: [{ teamId: `t${(i % 6) + 1}`, from: '2026-10-01' }] }),
  );
  const config = makeConfig({ period: { start: '2026-10-01', end: '2026-10-31' }, teams, managers });
  let seed = 42;
  const rand = (max: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % (max + 1);
  };
  const records = managers.flatMap((m) =>
    buildCalendar(config).workingDays.map((date) => daily(m.id, date, { inv6: rand(4), inv20: rand(2), pay: rand(1) })),
  );
  return { config, records, adjustments: [], imports: [] };
}

describe('engine performance (ARCH-2)', () => {
  it('computes the state and the timeline for 70 managers in under 50 ms', () => {
    const input = bigInput();
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      computeGameState(input, at('2026-10-31', '18:00'));
      buildTimeline(prepare(input), '2026-10-31');
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);
    expect(runs[2]).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/unit/engine/gameState tests/unit/engine/perf`
Expected: FAIL — cannot resolve `src/engine/gameState.ts` / `prepare.ts` / `timeline.ts`.

- [ ] **Step 3: Implement**

`src/engine/prepare.ts`:

```ts
import type { Adjustment, ImportLog, MetricRecord } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { buildCalendar, type Calendar } from './calendar.ts';
import { buildDailySeries, type DailySeries } from './scoring.ts';
import { buildTrack, type Track } from './track.ts';

/** Stored inputs of the engine (ARCH-2): everything else is derived. */
export type EngineInput = {
  config: SeasonConfig;
  records: MetricRecord[];
  adjustments: Adjustment[];
  imports: ImportLog[];
};

export type Prepared = EngineInput & {
  calendar: Calendar;
  track: Track;
  series: DailySeries;
  warnings: string[];
};

/** Derived inputs shared by the state, the timeline and the achievements of plan 1b. */
export function prepare(input: EngineInput): Prepared {
  const calendar = buildCalendar(input.config);
  const track = buildTrack(input.config, calendar.workingDays.length);
  const { series, warnings } = buildDailySeries(input.records, input.config.period);
  const known = new Set(input.config.managers.map((m) => m.id));
  for (const id of series.keys())
    if (!known.has(id)) warnings.push(`данные оператора ${id} не учтены: его нет в составе`);
  return { ...input, calendar, track, series, warnings };
}
```

`src/engine/timeline.ts`:

```ts
import { addDays } from './dates.ts';
import { pacePosition } from './pace.ts';
import type { Prepared } from './prepare.ts';
import { computeTeamProgress, type TeamProgress } from './progress.ts';

export type TimelineDay = { date: string; pacePosition: number; teams: TeamProgress[] };

/** Team standings at the end of every completed working day (team achievements of plan 1b, replay). */
export function buildTimeline(prepared: Prepared, today: string): TimelineDay[] {
  return prepared.calendar.workingDays
    .filter((date) => date < today)
    .map((date) => ({
      date,
      pacePosition: pacePosition(prepared.calendar, prepared.track, addDays(date, 1)),
      teams: computeTeamProgress({ ...prepared, asOf: date }),
    }));
}
```

`src/engine/gameState.ts`:

```ts
import type { ImportLog } from '../data/schemas/records.ts';
import type { Calendar } from './calendar.ts';
import { dateOf } from './dates.ts';
import { buildLeaderboard, type LeaderboardRow } from './leaderboard.ts';
import { pacePosition } from './pace.ts';
import { prepare, type EngineInput } from './prepare.ts';
import { computeTeamProgress, type TeamProgress } from './progress.ts';
import { averageHeadcount } from './targets.ts';
import { locationIndexOf, type Track } from './track.ts';

/** An achievement earned (ACH-1); filled by plan 1b. */
export type Unlock = {
  achievementId: string;
  managerId?: string;
  teamId?: string;
  unlockedAt: string;
  source: 'auto' | 'manual';
};

export type TeamState = TeamProgress & {
  pacePosition: number;
  /** Cells ahead of (+) or behind (−) the pace line (FR-PACE-3). */
  deltaVsPace: number;
  locationIndex: number;
  headcount: number;
};

export type ManagerState = LeaderboardRow & { weekly: Record<number, number> };

/** Derived state — never stored (§14). */
export type GameState = {
  today: string;
  calendar: Calendar;
  track: Track;
  teams: TeamState[];
  managers: ManagerState[];
  unlocks: Unlock[];
  dataAsOf: string | null;
  warnings: string[];
};

/** The whole game state from the stored inputs (ARCH-2, ARCH-3); `now` is a local timestamp (D-11). */
export function computeGameState(input: EngineInput, now: string): GameState {
  const today = dateOf(now);
  const p = prepare(input);
  const pace = pacePosition(p.calendar, p.track, today);
  const teams = computeTeamProgress({ ...p, asOf: today }).map((t) => ({
    ...t,
    pacePosition: pace,
    deltaVsPace: t.position - pace,
    locationIndex: locationIndexOf(p.track, t.position),
    headcount: averageHeadcount(t.teamId, p.config, p.calendar),
  }));

  const board = (from: string, to: string) => buildLeaderboard({ ...p, from, to, today });
  const weeks = p.calendar.weeks.map((w) => ({
    index: w.index,
    points: new Map(board(w.start, w.end).map((r) => [r.managerId, r.points])),
  }));
  const managers = board(p.calendar.start, p.calendar.end).map((row) => ({
    ...row,
    weekly: Object.fromEntries(weeks.map((w) => [w.index, w.points.get(row.managerId) ?? 0])),
  }));

  return {
    today,
    calendar: p.calendar,
    track: p.track,
    teams,
    managers,
    unlocks: [],
    dataAsOf: latestImport(p.imports),
    warnings: p.warnings,
  };
}

function latestImport(imports: ImportLog[]): string | null {
  let latest: string | null = null;
  for (const i of imports) if (latest === null || Date.parse(i.at) > Date.parse(latest)) latest = i.at;
  return latest;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/unit/engine/gameState tests/unit/engine/perf`
Expected: PASS, 7 tests. If the perf test exceeds 50 ms, profile before changing the budget: the likely cost is `teamTargetPoints` recomputed for every timeline day — cache targets per `prepare()` rather than relaxing the test.

- [ ] **Step 5: Full engine run**

Run: `npm run typecheck && npm run lint && npm run test:engine`
Expected: exit 0; the coverage table shows every `src/engine` file and totals ≥ 90 % on all four measures. Record the four totals for the stage report.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Stage 1a: game state, timeline, spec example FR-STEP-4 and the 50 ms budget (ARCH-2, FR-PACE-3, QA-1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Engine skill, docs, CI coverage gate

**Files:**
- Create: `.claude/skills/engine-rules/SKILL.md`
- Modify: `CLAUDE.md` (architecture, commands), `.github/workflows/deploy.yml` (coverage gate)

- [ ] **Step 1: Write the project skill (D-4)**

`.claude/skills/engine-rules/SKILL.md`:

```md
---
name: engine-rules
description: Use when changing anything in src/engine or src/data/schemas of Sales Quest — scoring, targets, track geometry, progress, pace, leaderboard, timeline, achievements, or the season config schema. Lists the invariants the engine must keep and the checks to run.
---

# Engine rules (Sales Quest)

The engine turns stored inputs (season config, records, adjustments, import log) into the game
state. It is the only place where game numbers are computed. Source of truth: `docs/SPEC.md`,
overridden by `docs/DECISIONS.md`.

## Invariants

1. **Pure.** No DOM, network, storage, React, three.js or zod at runtime in `src/engine`; schema
   types arrive with `import type` only. ESLint enforces this (`eslint.config.js`, engine block).
2. **No clock.** Never `Date.now()` or `new Date()` without arguments. "Now" is a parameter — a local
   timestamp — and the engine uses only its calendar date (`dateOf`, D-11). Dates are `YYYY-MM-DD`.
3. **Deterministic and idempotent.** Same input → same output; re-importing the same data changes
   nothing (FR-STEP-5): daily records merge with "the later value of a metric wins".
4. **No magic numbers.** Weights, cells per working day, overflow %, default daily target — only
   from the season config.
5. **Track geometry (D-24).** `cellsPerLocation = ceil(N × working days / 4)`,
   `trackLength = 4 × cellsPerLocation`, overflow `= ceil(trackLength × overflowPct / 100)`.
   Position 0 is the start; `trackLength` is the finish = 100 % of plan; 4 equal locations.
6. **Roster (R-1…R-5).** Points go to the team of the membership covering the date, else the
   nearest; targets count only working days in the team; fired managers keep their points but
   leave the ranking.
7. **Adjustments** apply on top of the computed result in time order; revoked ones are ignored;
   a reset stores the position it removes (D-17).

## Workflow

- Failing test first: `tests/unit/engine/*.test.ts`, builders in `tests/support/builders.ts`.
- `npm run test:engine` — engine and schema tests with coverage; `src/engine` stays ≥ 90 % (QA-1).
- `tests/unit/engine/perf.test.ts` stays green: state + timeline for 70 managers < 50 ms (ARCH-2).
- A change of game behaviour is a decision: record it in `docs/DECISIONS.md`, and open or close
  the matching line in `docs/OPEN_QUESTIONS.md`.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In `## Команды`, after the `npm test` line, add:

```
npm run test:engine  # тесты движка и схем с покрытием (src/engine ≥ 90 %, QA-1)
```

Replace the heading `## Архитектура (этап 0)` with `## Архитектура` and add these lines to the top of its list:

```md
- `src/data/schemas/` — zod-схемы и типы: `season.ts` (конфиг игры, состав с периодами в командах),
  `records.ts` (записи показателей, корректировки, журнал импорта), `common.ts`.
- `src/engine/` — чистый движок (ARCH-3, D-11): `dates` → `calendar` → `track`/`pace`, `roster`,
  `scoring` → `targets` → `progress` (+ `adjustments`), `leaderboard`, `prepare`, `timeline`,
  `gameState` (`computeGameState(input, now)`). Перед правкой — скилл `.claude/skills/engine-rules`.
- `tests/support/builders.ts` — построители тестовых данных (двухнедельная игра по умолчанию).
```

- [ ] **Step 3: Add the coverage gate to CI**

In `.github/workflows/deploy.yml`, after the `- run: npm test` step (and its comment), add:

```yaml
      - run: npm run test:engine # coverage of src/engine ≥ 90 % (QA-1)
```

- [ ] **Step 4: Full local check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:engine && npm run build && npm run size`
Expected: all exit 0; `npm test` passes 111 tests (29 from stage 0 + 82: schemas 15, dates/calendar 14, track/pace 6, roster 8, scoring 7, targets 7, progress 13, leaderboard 5, state/timeline/perf 7); the initial JS stays well under 600 KB (the engine is not imported by the app yet).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Stage 1a: engine-rules skill, docs, CI coverage gate (D-4, QA-1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Independent review, then push**

Dispatch the code reviewer for the range of this plan (agreed process for stage 1: one independent review per sub-plan). Fix Critical and Important findings in new commits; record deferred ones in `docs/BACKLOG.md`.
⛔ Then ask the author before `git push` (D-3); after the push, check that the `Deploy` run is green.

---

## Plan 1a acceptance

- [ ] `npm run test:engine` passes; `src/engine` coverage ≥ 90 % on lines, branches, functions, statements.
- [ ] FR-STEP-4: 990 of 1200 points over 20 working days → cell 33 of 40, location 4.
- [ ] A repeated import does not change the state; weight changes move points and targets consistently (R-4).
- [ ] Roster rules R-1…R-5 are covered by tests (transfer, late join, firing, payment after firing).
- [ ] State + timeline for 70 managers < 50 ms.
- [ ] The probe in Task 1 Step 7 showed the engine lint rules reject a value import from `src/data`, `Date.now()` and `new Date()`.
- [ ] Independent review done; findings fixed or recorded; CI green after the author-approved push.
