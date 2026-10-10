# Stage 2a — Launching the Real Game: Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process, 06.10.2026),
> an independent review subagent checks the whole stage at the end (Task 9). Steps use checkbox
> (`- [ ]`) syntax. Before each task: its «Где смотреть» block and the matching topic of
> `docs/NAVIGATOR.md`.

**Goal:** the coordinator runs the real game from the admin panel — logs in with a GitHub token,
creates the first real season from the funnel with a secret phrase, imports the funnel and the paid
invoices, and every viewer with the new link sees the figures move.

**Architecture:** pure modules decide (parsers on cell grids, matching, applying an import, building a
season, sealing a change, the preview), thin React screens in a lazy admin chunk call them, one
`GitHubRepo` interface writes (an HTTP client for the site, an in-memory fake for tests). The engine,
the sealing (`sealSeason`) and the season loading (`openSeason`) of stage 1 are reused as they are.

**Tech stack:** React 19, TypeScript 6 strict, zod 4, SheetJS CE (from `cdn.sheetjs.com`, after the
author's «да»), WebCrypto (SHA-256, AES-GCM of D-12), the GitHub REST API (Git Data), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-stage-2a-launch-design.md` (approved 10.10.2026); SPEC §8,
§9, §13.5–13.7, §17 QA-2/QA-3, §18; DECISIONS D-7a, D-12, D-19…D-22, D-24, D-33…D-36, ADM-ROSTER;
`docs/IMPORT_FORMATS.md`.

## Global Constraints

- The admin chunk is lazy: admin code, SheetJS and the GitHub client never in the initial JS (D-7a);
  `npm run size` stays at ~381 KB of 600.
- Nothing from the real exports enters the repository, tests or logs; subagents never open `*.xlsx` in
  the root or `refs/` (CLAUDE.md). Fixtures are synthetic, with fictional people.
- The token goes only to `https://api.github.com`; the phrase never reaches the repository or logs.
- Commit messages are public: `data(<seasonId>): <action> — <counts> [by <login>]`, never names or sales
  figures.
- Timestamps through `localTimestamp` (D-11); dates are `YYYY-MM-DD` strings; the engine stays pure.
- Ids are latin (`IdSchema`): teams `team1…`, new operators `op001…`; group codes (`СР1`) live in
  `sourceCode`.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved,
  push only after «да» (D-3); downloading SheetJS needs its own «да».
- Each import supplies only its metrics (D-20); a file is complete for its period (OQ-12).

## Review Focus

1. **A name with «ё», double spaces or another case** (`«Фёдоров  иван»`) must match the existing
   operator, never create a second one — Task 4 test «matches through ё, spaces and case».
2. **The funnel with a block inserted or renamed** — an inserted block shifts columns and must not
   matter (blocks by name); a renamed one must stop the import with the block's name, not import zeros —
   Task 2 tests «finds blocks by name after a shift» and «a missing block is an error naming it».
3. **One invoice on several lines with different authors or dates** — counted once (first line), with a
   warning — Task 2 test «one invoice, several lines».
4. **The branch moved between reading and writing** (a second tab or admin) — no lost change: a
   conflict, a re-read, the action re-applied, a new preview — Task 5 test «a moved branch is a conflict,
   not an overwrite».
5. **The same file imported again, also after other imports** — positions unchanged, only a log entry;
   an older funnel after a newer one replaces only its own dates — Task 4 tests «a repeated import
   changes no record» and «an older file replaces only its period».

---

### Task 1: The demo for development and tests, `data/` for the site

**Где смотреть:** ТЗ §13.4, DEP-2; решения D-32 (демо, публичная фраза), D-33, D-34 (`check:data`), D-39;
код `scripts/lib/dataPlugin.ts`, `vite.config.ts`, `scripts/seed-demo.ts`, `scripts/check-data.ts`,
`playwright.config.ts`, `.github/workflows/deploy.yml`; навигатор §2, §14.

**Files:**
- Modify: `vite.config.ts`, `scripts/seed-demo.ts`, `scripts/check-data.ts`, `playwright.config.ts`,
  `.github/workflows/deploy.yml` (comment only), `CLAUDE.md` (commands)
- Create: `tests/fixtures/demo-data/` (a copy of today's `data/`, written by `seed-demo`)
- Test: `tests/unit/demo.test.ts` (paths), e2e unchanged

**Interfaces:**
- Produces: env `SQ_DATA_DIR` — the folder served and built as `data/`; default: `data` for
  `vite build`, `tests/fixtures/demo-data` for `vite` (dev); `seed-demo --out <dir>` (default
  `tests/fixtures/demo-data`); `check:data` checks `data/` and `tests/fixtures/demo-data/`.

- [ ] Step 1: `vite.config.ts` — `defineConfig(({ command }) => ({ … plugins: [react(), tailwindcss(),
  dataPlugin(process.env.SQ_DATA_DIR ?? (command === 'build' ? 'data' : 'tests/fixtures/demo-data'))] }))`.
- [ ] Step 2: `seed-demo` takes `--out` (default `tests/fixtures/demo-data`); run
  `npm run seed-demo -- --phrase sales-quest-demo` and check the new folder equals today's `data/`
  byte for byte except `updatedAt` (`git diff --no-index`). `data/` keeps the demo until the wizard's
  first commit (Task 7) replaces it.
- [ ] Step 3: `check:data` loops over both folders; the hook rules already allow JSON under
  `tests/fixtures/`.
- [ ] Step 4: `playwright.config.ts` — `webServer.env: { SQ_DATA_DIR: 'tests/fixtures/demo-data' }`
  (cross-platform, no shell syntax); the deploy job keeps `npm run build` → `data/`.
- [ ] Step 5: `npm run typecheck && npm run lint && npm test && npm run check:data && npm run test:e2e`
  — all green (e2e now reads the fixture folder).
- [ ] Step 6: Commit «Data: the demo moves to tests/fixtures for development and tests; data/ is the
  site's (D-32, D-34)».

### Task 2: Import profiles and the two parsers on cell grids (no SheetJS yet)

**Где смотреть:** `docs/IMPORT_FORMATS.md` целиком; решения D-19, D-20, D-22, OQ-12, OQ-13; ТЗ §9.2–9.4,
QA-2; код `src/data/schemas/season.ts` (`importProfiles: z.unknown()`); навигатор §3.

**Files:**
- Create: `src/import/grid.ts`, `src/import/parsed.ts`, `src/import/profiles.ts`,
  `src/import/funnel.ts`, `src/import/payments.ts`, `src/import/detect.ts`
- Modify: `src/data/schemas/season.ts` (`importProfiles: z.array(ImportProfileSchema).default([])`)
- Test: `tests/unit/import/funnel.test.ts`, `payments.test.ts`, `detect.test.ts`,
  `tests/support/grids.ts` (builders of synthetic grids)

**Interfaces:**
- Produces:
  ```ts
  // grid.ts
  export type Grid = unknown[][];                       // rows of cell values, 0-based
  export function cellText(v: unknown): string;          // trimmed text of a cell, '' for empty
  export function cellNumber(v: unknown): number;        // '' → 0; numbers; numeric text
  export function cellDate(v: unknown): string | null;   // Excel serial | 'DD.MM.YYYY' | Date → 'YYYY-MM-DD'
  export function column(letter: string): number;        // 'A' → 0, 'AE' → 30
  export class ImportError extends Error {}              // stops an import, message for the admin
  // profiles.ts
  export type FunnelProfile = { id: 'funnel'; kind: 'matrix'; title: string; sheet: string;
    blockRow: number; subBlockRow: number; dateRow: number; totalRow: number; firstDataRow: number;
    groupFlag: string; employeeFlag: string; nameColumn: string; groupCode: string;
    metrics: { metricId: string; block: string; subBlock: string }[] };   // rows 1-based, columns letters
  export type PaymentsProfile = { id: 'payments'; kind: 'events'; title: string; sheet: string | number;
    headerRow: number; columns: { date: string; author: string; group: string; invoice: string; product: string };
    excludeProducts: string[]; metricId: string; groupCode: string };
  export type ImportProfile = FunnelProfile | PaymentsProfile;
  export const ImportProfileSchema: z.ZodType<ImportProfile>;
  export const DEFAULT_FUNNEL: FunnelProfile;      // the values of IMPORT_FORMATS.md §1
  export const DEFAULT_PAYMENTS: PaymentsProfile;  // the values of IMPORT_FORMATS.md §2
  export const DEFAULT_PROFILES: ImportProfile[];  // [DEFAULT_FUNNEL, DEFAULT_PAYMENTS]
  // parsed.ts — what every parser returns
  export type Person = { name: string; group: string | null };      // name as written, group code
  export type ParsedRow = Person & { date: string; values: Record<string, number> };
  export type Parsed = { profileId: string; metrics: string[]; rows: ParsedRow[];
    period: [string, string]; groups: string[]; people: Person[]; warnings: string[] };
  // funnel.ts / payments.ts
  export function parseFunnel(grid: Grid, p: FunnelProfile): Parsed;
  export function parsePayments(grid: Grid, p: PaymentsProfile): Parsed;
  // detect.ts
  export function detectProfile(sheets: string[], firstRow: (sheet: string | number) => unknown[],
    profiles: ImportProfile[]): ImportProfile | null;
  ```

- [ ] Step 1: Grid builders in `tests/support/grids.ts`: `funnelGrid({ groups: [{ code, name,
  people: [{ name, days: Record<date, [inv6, inv20]> }] }], dates, extraBlockFirst?: boolean })` builds
  rows 4–6 (blocks «Средний трафик» (if `extraBlockFirst`), «Качественные счета», «Разговоры от 20
  минут», each 30 columns = 5 weeks × (5 days + week total `2026.40`)), row 7 «Общий итог» with sums,
  row 8 «Названия строк», data from row 9 with B/C flags and G names; `paymentsGrid(lines)` builds row 1
  headers (all 20 columns of IMPORT_FORMATS §2) and lines, plus the final «Сумма заказа» row.
- [ ] Step 2: Failing tests — funnel:
  ```ts
  it('reads quality invoices and 20-minute calls per employee and day', () => {
    const grid = funnelGrid({ dates: ['2026-10-05', '2026-10-06'], groups: [{ code: 'СР1',
      name: 'X_НП_СР_Город_СР1_Y', people: [{ name: 'Ершова Мария', days: { '2026-10-05': [3, 1] } }] }] });
    const p = parseFunnel(grid, DEFAULT_FUNNEL);
    expect(p.rows).toContainEqual({ name: 'Ершова Мария', group: 'СР1', date: '2026-10-05',
      values: { inv6: 3, inv20: 1 } });
    expect(p.rows).toContainEqual({ name: 'Ершова Мария', group: 'СР1', date: '2026-10-06',
      values: { inv6: 0, inv20: 0 } });                       // '' → 0
    expect(p.period).toEqual(['2026-10-05', '2026-10-06']);
    expect(p.groups).toEqual(['СР1']);
  });
  it('finds blocks by name after a shift', …extraBlockFirst: true → same rows);
  it('a missing block is an error naming it', … renamed «Качественные счета» →
    toThrow(/Качественные счета/));
  it('skips week totals, the department total and the tail', …);
  it('warns when employees do not add up to their group or the groups to the total', …);
  it('takes dates as Excel numbers and as text', …);
  ```
- [ ] Step 3: Failing tests — payments:
  ```ts
  it('one invoice = one payment on its first line, «Академия» not counted', …);
  it('one invoice, several lines with different authors or dates — counted once, warned', …);
  it('skips the final sum row and lines without a date or an author', …);
  it('the period runs from the first to the last payment date', …);
  it('never keeps clients, INN, sums or invoice numbers', () => {
    const json = JSON.stringify(parsePayments(grid, DEFAULT_PAYMENTS));
    expect(json).not.toMatch(/ИНН-ТЕСТ|123456|Счёт-7/); });
  ```
- [ ] Step 4: Implement `grid.ts`, `profiles.ts` (zod schemas + `DEFAULT_PROFILES` from IMPORT_FORMATS),
  `funnel.ts`: find each metric's block by `blockRow` text (a block runs from its column to the next
  non-empty cell of the row), the sub-block inside it by `subBlockRow`, its date columns by `dateRow`
  (`cellDate` not null; week totals are text → skipped); walk rows from `firstDataRow`: a group row
  (`groupFlag` = 1) sets the current group (code by `groupCode` regex on the name), an employee row
  (`employeeFlag` = 1) gives one `ParsedRow` per date; others stop at the tail (A, B, C = 0 and empty
  name). Self-check sums per group and per total row. `payments.ts`: headers by name in `headerRow`,
  group lines by invoice, first line wins.
- [ ] Step 5: `detect.ts` — funnel: its sheet name is in the workbook; payments: the first row of its
  sheet has its `date` and `invoice` headers. Tests for both and for an unknown file (null).
- [ ] Step 6: `season.ts` — `importProfiles: z.array(ImportProfileSchema).default([])` (the demo files
  have `[]`, still valid); schema tests stay green.
- [ ] Step 7: `npm run typecheck && npm run lint && npm test`; commit «Import: profiles of the two real
  exports and their parsers on cell grids (D-19, D-20, D-22, QA-2)».

### Task 3: SheetJS, reading in a Web Worker, synthetic xlsx fixtures, the real files checked

**Где смотреть:** ТЗ §13.2 (SheetJS с `cdn.sheetjs.com`), DATA-2, QA-2; решения D-3 (скачивание — после
«да»), D-7a; `docs/IMPORT_FORMATS.md` §5; навигатор §3, §13.

**Files:**
- Modify: `package.json` (dependency `xlsx` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`),
  `ASSETS_CREDITS.md` (not an asset — a line under «Библиотеки» with Apache-2.0), `CLAUDE.md`
- Create: `src/import/xlsx.ts`, `src/import/parse.worker.ts`, `src/import/parseFile.ts`,
  `scripts/make-fixtures.ts`, `scripts/check-exports.ts`,
  `tests/fixtures/import/funnel.xlsx`, `tests/fixtures/import/payments.xlsx`
- Test: `tests/unit/import/xlsx.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Grid`, `parseFunnel`, `parsePayments`, `detectProfile`, `DEFAULT_PROFILES`).
- Produces:
  ```ts
  // xlsx.ts — SheetJS, admin chunk and Node scripts only
  export function sheetNames(bytes: ArrayBuffer): string[];               // bookSheets: true, cheap
  export function readGrid(bytes: ArrayBuffer, sheet: string | number): Grid;  // only that sheet
  export function parseWorkbook(bytes: ArrayBuffer, profiles: ImportProfile[]):
    { profile: ImportProfile; parsed: Parsed };                           // throws ImportError
  export async function sha256(bytes: ArrayBuffer): Promise<string>;      // hex
  // parseFile.ts — the page side
  export function parseFile(file: File, profiles: ImportProfile[]):
    Promise<{ profile: ImportProfile; parsed: Parsed; sha256: string; fileName: string }>;
  ```

- [ ] Step 1: **Ask the author's «да»** for installing SheetJS CE 0.20.3 from `cdn.sheetjs.com`
  (Apache-2.0); then `npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- [ ] Step 2: `xlsx.ts` with `XLSX.read(bytes, { type: 'array', sheets: [name], dense: true })` and
  `sheet_to_json(ws, { header: 1, raw: true, defval: '' })`; `parseWorkbook` = `sheetNames` →
  `detectProfile` → `readGrid` of that sheet only → parser. Test: a workbook written by SheetJS in the
  test from `funnelGrid` (with a second sheet of 100 000 empty rows declared) reads only the funnel
  sheet and gives the same `Parsed` as the grid; merged header cells; dates as text and as numbers.
- [ ] Step 3: `parse.worker.ts` (`self.onmessage` → `parseWorkbook` → post `{ ok, profile, parsed }`
  or `{ error }`), `parseFile.ts` (`new Worker(new URL('./parse.worker.ts', import.meta.url),
  { type: 'module' })`, reads `file.arrayBuffer()`, hashes on the page, one worker per file,
  terminated after).
- [ ] Step 4: `scripts/make-fixtures.ts` writes `tests/fixtures/import/funnel.xlsx` and
  `payments.xlsx` from the grid builders with the demo's fictional operators (their names from
  `tests/fixtures/demo-data` config) plus two unknown people, «ё», double spaces, an «Академия» line, a
  three-line invoice, the final sum row; commit the generated files (the hook allows tables in
  `tests/fixtures/`).
- [ ] Step 5: `scripts/check-exports.ts <funnel.xlsx> <payments.xlsx>` — prints only aggregates: sheet
  found, groups count, people count, dates range, sums per metric, the number of self-check warnings,
  parse time. **Run it on the author's two September exports in the project root** (the author's «да»,
  10.10.2026); record only «прошло / сколько предупреждений / время» in the plan's notes, nothing
  else. A self-check mismatch → stop and look (the format differs from IMPORT_FORMATS).
- [ ] Step 6: `npm run size` — unchanged (SheetJS only in the worker and scripts); checks; commit
  «Import: SheetJS in a worker, synthetic xlsx fixtures, the real exports checked by aggregates
  (QA-2, D-7a, OQ-13)».

### Task 4: Matching operators and applying an import (pure)

**Где смотреть:** ТЗ DATA-5…DATA-11; решения D-20, D-21, OQ-12, ADM-ROSTER-2, R-1, R-2; код
`src/data/schemas/season.ts` (`ManagerSchema`, `MembershipSchema`), `src/data/schemas/records.ts`
(`MetricRecord`, `ImportLog`), `src/engine/roster.ts` (`membersOn`), `src/data/time.ts`; навигатор §1, §3.

**Files:**
- Create: `src/import/match.ts`, `src/import/apply.ts`
- Modify: `src/data/schemas/season.ts` (`defaultDailyNorms`, `importIgnore`)
- Test: `tests/unit/import/match.test.ts`, `tests/unit/import/apply.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Parsed`, `Person`), `EngineInput`, `SeasonConfig`.
- Produces:
  ```ts
  export function normalizeName(name: string): string;     // trim, single spaces, ё→е, lower case
  export type Unknown = { name: string; norm: string; group: string | null; suggestedTeamId: string | null };
  export type Match = { managerOf: Map<string, string>;     // norm → managerId
    unknown: Unknown[]; ignored: string[]; moved: string[] }; // moved — warnings «возможно, перевод»
  export function matchPeople(people: Person[], config: SeasonConfig, onDate: string): Match;
  export type Resolution = { kind: 'link'; managerId: string } | { kind: 'new'; teamId: string } | { kind: 'ignore' };
  export type ImportMeta = { fileName: string; sha256: string; by: string; at: string; period?: [string, string] };
  export type ImportResult = { input: EngineInput; log: ImportLog;
    summary: { rows: number; matched: number; added: number; ignored: number; period: [string, string]; warnings: string[] } };
  export function applyImport(input: EngineInput, parsed: Parsed, resolutions: Map<string, Resolution>, meta: ImportMeta): ImportResult;
  ```
  Config: `defaultDailyNorms?: Record<string, number>`, `importIgnore: string[]` (default `[]`).

- [ ] Step 1: Failing tests — match:
  ```ts
  it('matches through ё, spaces and case, and through aliases', () => {
    expect(normalizeName('  Фёдоров   ИВАН ')).toBe('федоров иван');
    const m = matchPeople([{ name: 'Фёдоров  иван', group: 'СР1' }], config, '2026-10-05');
    expect(m.managerOf.get('федоров иван')).toBe('m02'); expect(m.unknown).toEqual([]); });
  it('suggests the team by the group code; an ignored name is not asked again', …);
  it('warns when the export lists an operator in another group than the roster', …);
  ```
- [ ] Step 2: Failing tests — apply:
  ```ts
  it('upserts only the file\'s metrics by operator and day', () => {
    // a record { inv6: 2, inv20: 1, pay: 3 } + a funnel with inv6 5, inv20 0 → { inv6: 5, inv20: 0, pay: 3 } });
  it('a repeated import changes no record', () => {
    const once = applyImport(input, parsed, none, meta);
    const twice = applyImport(once.input, parsed, none, { ...meta, at: later });
    expect(twice.input.records).toEqual(once.input.records);
    expect(twice.input.config).toEqual(once.input.config);
    expect(twice.summary.warnings).toContain('этот файл уже загружался 06.10 09:00'); });
  it('an older file replaces only its period', …);
  it('fills 0 for the operators of the file\'s groups on days of the period without payments (OQ-12)', …);
  it('drops days outside the game with a warning (DATA-7)', …);
  it('links, adds and ignores by the resolutions; a new operator gets the season\'s default norms', () => {
    // 'new' → manager { id: 'op001', fullName, aliases: [], dailyNorms: config.defaultDailyNorms,
    //   memberships: [{ teamId, from: max(first file date, season start) }] }; 'link' → alias added;
    //   'ignore' → config.importIgnore gets the norm });
  it('writes the log entry: file, hash, kind, period, counts, warnings', …);
  it('keeps records sorted by date and operator, so an unchanged file serialises the same', …);
  ```
- [ ] Step 3: Implement `match.ts` and `apply.ts`: records keyed `${managerId}|${date}`; for each day of
  the period inside the game: the file's metrics from the row or 0 for operators of the file's groups
  (members of a team whose `sourceCode` is in `parsed.groups` on that day, `membersOn`); a repeated hash
  → the warning with the earlier import's time; new ids `op001…` (the next free); `importId` = the log's
  id `imp-<YYYYMMDDHHmm>-<sha6>`.
- [ ] Step 4: Schema: `defaultDailyNorms` optional, `importIgnore` default `[]`; old files valid.
- [ ] Step 5: Checks; commit «Import: matching operators and applying an import — only its metrics, the
  complete period, idempotent (DATA-5…DATA-11, D-20, OQ-12)».

### Task 5: The GitHub client and the write path

**Где смотреть:** ТЗ §8 (ADM-2, ADM-PREVIEW), §13.5 SEC-1…SEC-5, SYNC-4; решения D-12 (соль, ключи), D-33
(файлы, отпечатки); BACKLOG «Этап 2» (`sealSeason` с `salt` и `reuse`); код `src/data/seal.ts`,
`src/data/sync.ts` (`openSeason`), `src/data/files.ts`, `src/engine/gameState.ts`; навигатор §2.

**Files:**
- Create: `src/admin/github.ts`, `src/admin/token.ts`, `src/admin/pipeline.ts`,
  `tests/support/fakeGitHub.ts`
- Test: `tests/unit/admin/github.test.ts`, `token.test.ts`, `pipeline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // github.ts
  export type RepoRef = { owner: string; repo: string; branch: string };
  export const REPO: RepoRef;                        // KonturProject / sales-quest / main
  export class ConflictError extends Error {}        // the branch moved
  export class AuthError extends Error {}            // 401/403: the token is wrong or has no rights
  export interface GitHubRepo {
    head(): Promise<string>;
    read(path: string, commit: string): Promise<string | null>;
    commit(base: string, changes: Map<string, string | null>, message: string): Promise<string>;
    whoAmI(): Promise<{ login: string; canPush: boolean; expiresAt: string | null }>;
  }
  export class HttpGitHubRepo implements GitHubRepo {
    constructor(token: string, ref?: RepoRef, fetchFn?: typeof fetch);
  }
  // token.ts
  export function readToken(): string | null; export function writeToken(t: string): void;
  export function forgetToken(): void;
  export function expiryWarning(expiresAt: string | null, today: string): string | null; // ≤ 14 days
  // pipeline.ts
  export type RepoState = { head: string; version: Version; texts: Record<SeasonFile, string>;
    index: string; input: EngineInput };
  export function loadRepoState(repo: GitHubRepo, phrase: string, keys: KeyCache): Promise<RepoState>;
  export type Preview = { teams: { teamId: string; leaderName: string; before: number; after: number }[];
    top: { name: string; before: number | null; after: number }[] };
  export function previewChange(before: EngineInput, after: EngineInput, now: string): Preview;
  export function commitChange(repo: GitHubRepo, state: RepoState, after: EngineInput,
    opts: { phrase: string; keys: KeyCache; message: string; by: string; now: string }):
    Promise<{ commit: string; rev: string } | 'unchanged'>;          // throws ConflictError
  ```
  `tests/support/fakeGitHub.ts`: `class FakeGitHubRepo implements GitHubRepo` (commits as maps of
  path → text, `advance()` to simulate another admin), and `serveFakeGitHub(route, fake)` for Playwright.

- [ ] Step 1: Failing tests — `HttpGitHubRepo` against a stubbed `fetch`: `head` reads
  `GET /repos/o/r/git/ref/heads/main`; `read` uses `GET /repos/o/r/contents/<path>?ref=<sha>` with
  `Accept: application/vnd.github.raw+json` (404 → null); `commit` posts blobs, one tree with
  `base_tree` (a `null` change → `{ path, mode: '100644', type: 'blob', sha: null }` deletes), a commit
  with one parent, then `PATCH /git/refs/heads/main { sha, force: false }` — a 422 «not a fast forward» →
  `ConflictError`; 401/403 → `AuthError`; every request carries `Authorization: Bearer <token>` and
  `X-GitHub-Api-Version: 2022-11-28`, and goes to `https://api.github.com` only; `whoAmI` reads
  `/user` and `/repos/o/r` (`permissions.push`) and the header `github-authentication-token-expiration`.
- [ ] Step 2: Failing tests — token: storage in try/catch, `expiryWarning('2026-10-20 10:00:00 +0300',
  '2026-10-10')` → «ключ GitHub истекает через 10 дн.», `null` past 14 days or without a date.
- [ ] Step 3: Failing tests — pipeline (with `FakeGitHubRepo` seeded from `tests/fixtures/demo-data`):
  ```ts
  it('reads the season at the head of main and opens it with the phrase', …);
  it('previews the teams before → after and the top 10', …);
  it('commits only changed files, the others byte for byte, version.json with the new fingerprints', () => {
    // change only records → config/adjustments/imports texts identical, one salt, iterations kept });
  it('an unchanged input is not committed', … → 'unchanged');
  it('a moved branch is a conflict, not an overwrite', async () => {
    const state = await loadRepoState(fake, PHRASE, keys); fake.advance();
    await expect(commitChange(fake, state, after, opts)).rejects.toBeInstanceOf(ConflictError);
    expect(fake.commits).toHaveLength(2); });            // the seed and the other admin's only
  it('the commit message carries counts and the login, never a name', …);
  ```
- [ ] Step 4: Implement (`commitChange`: `serialize(seasonFileValue(file, after[file]))` vs before →
  `reuse` the old text; the salt from the current envelope; `sealSeason(after, phrase, { salt, reuse,
  keys, updatedAt: now })`; message `data(<seasonId>): <message> [by <login>]`).
- [ ] Step 5: Checks; commit «Admin: the GitHub client and one write path — preview, sealed changed
  files only, a commit on the base, a conflict on a moved branch (SEC-1…SEC-5, ADM-2)».

### Task 6: The admin chunk: login, start screen, the import screen

**Где смотреть:** ТЗ §8 (общий путь), SEC-2, SEC-3, SYNC-4, DATA-10; решения D-7a, D-46 (стиль `sq-*`),
ADM-ROSTER-4; код `src/app/App.tsx` (маршруты, ленивые чанки), `src/app/router.ts`, `src/hud/theme.css`,
`src/data/storage.ts` (`PagesSource` — для «опубликовано»); навигатор §11, §15.

**Files:**
- Create: `src/admin/AdminPage.tsx` (lazy entry), `Login.tsx`, `Home.tsx`, `ImportFlow.tsx`,
  `Resolve.tsx`, `PreviewTable.tsx`, `Publishing.tsx`, `src/admin/useAdmin.ts` (state: repo, phrase,
  login, current `RepoState`)
- Modify: `src/app/App.tsx` (`#/admin` → `lazy(() => import('../admin/AdminPage.tsx'))`)
- Create: `src/admin/publishing.ts` — `export function isPublished(expectedRev: string, version:
  Version): boolean` and `export const PUBLISH_POLL_MS = 10_000`
- Test: `tests/unit/admin/publishing.test.ts`, e2e in Task 8

**Interfaces:**
- Consumes: Tasks 3–5 (`parseFile`, `matchPeople`, `applyImport`, `HttpGitHubRepo`, `loadRepoState`,
  `previewChange`, `commitChange`, token helpers).
- Produces: route `#/admin`; screens in the `sq-*` style; `data-testid` for e2e: `admin-login`,
  `admin-home`, `import-file`, `resolve-list`, `preview-table`, `commit-button`, `publishing`.

- [ ] Step 1: Login: token field (password type) with the instructions «Создайте ключ: GitHub →
  Settings → Developer settings → Fine-grained tokens → только репозиторий sales-quest, Contents: Read and
  write» and a link; the phrase field (prefilled from this browser's phrase); «Войти» → `whoAmI` (no push
  → «у ключа нет права записи»), `loadRepoState` (wrong phrase → «фраза не подходит»); «Выйти».
- [ ] Step 2: Home: the launch checklist (token ✓, game ✓/«Новая игра», last imports with dates),
  buttons «Загрузить выгрузку», «Новая игра», the expiry warning.
- [ ] Step 3: Import: file input (`.xlsx`) → `parseFile` (spinner «разбираю…», the file stays here) →
  kind and period (payments: editable period) → `matchPeople` → `Resolve` for the unknown (three choices
  per person, the team preselected by the group) → `applyImport` → `PreviewTable` (period, matched /
  new / ignored, warnings, teams before → after, top 10) → «Записать» → `commitChange` → a
  `ConflictError` re-reads, re-applies the same resolutions, shows the new preview with «данные
  изменились — проверьте ещё раз» → `Publishing` polls the site's `version.json` (fresh) every 10 s until
  the new `rev` → «Опубликовано».
- [ ] Step 4: `npm run size` — unchanged (the admin is its own chunk); checks; commit «Admin: login,
  start screen and the import from a file to a commit (§8, DATA-10, SEC-2, SYNC-4)».

### Task 7: The «Новая игра» wizard and the secret phrase

**Где смотреть:** спецификация §3; решения D-24 (трек от рабочих дней), D-27 (ачивки), D-32 (демо-фраза
публична), D-41 (герои, 10 вариантов), OQ-14; BACKLOG «Этап 2» (состав из воронки — только активные);
код `scripts/lib/demo.ts` (конфиг демо), `src/data/defaults/achievements.ts`, `src/scene/heroCatalog.ts`
(`VARIANTS`), `src/data/seal.ts` (`seasonIndexText`); навигатор §2, §3.

**Files:**
- Create: `src/data/defaults/season.ts`, `src/admin/newGame.ts`, `src/admin/NewGame.tsx`,
  `src/admin/words.ts` (a list of ~300 simple Russian words in latin transliteration for phrases)
- Modify: `scripts/lib/demo.ts` (uses `seasonDefaults`), `src/admin/Home.tsx`, `src/admin/pipeline.ts`
  (`launchChange`)
- Test: `tests/unit/admin/newGame.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // data/defaults/season.ts
  export function seasonDefaults(): Omit<SeasonConfig, 'id' | 'title' | 'status' | 'period' | 'teams' | 'managers'>;
  // admin/newGame.ts
  export type TeamDraft = { code: string; leaderName: string; color: string; characterId: string; order: number };
  export type NewGameDraft = { start: string; end: string; holidays: string[]; title: string;
    teams: TeamDraft[]; operators: Person[]; norms: Record<string, number> };
  export function draftFromFunnel(parsed: Parsed): { groups: string[]; active: Person[]; check: Person[] };
  export function buildSeason(d: NewGameDraft): EngineInput;           // config + empty records/adjustments/imports
  export function generatePhrase(random?: (n: number) => Uint32Array): string;  // 4 words + 2 digits, '-'
  export function phraseProblem(phrase: string): string | null;        // < 16 chars; the demo phrase
  export function viewerLinks(phrase: string): { viewers: string; tv: string };
  // pipeline.ts
  export function launchChange(repo: GitHubRepo, base: string, input: EngineInput,
    opts: { phrase: string; by: string; now: string; removeSeasons: string[] }): Promise<string>;
  ```

- [ ] Step 1: Failing tests:
  ```ts
  it('groups of the funnel become teams; people with activity are ticked, the rest to check', …);
  it('builds a valid season: ids team1…, sourceCode СР<n>, norms on everyone and as the default,
     the demo\'s metrics, locations, achievements and profiles', () => {
    const input = buildSeason(draft);
    expect(() => SeasonConfigSchema.parse(input.config)).not.toThrow();
    expect(input.config.id).toBe('2026-10-19');
    expect(input.config.teams.map((t) => [t.id, t.sourceCode])).toEqual([['team1', 'СР1'], …]);
    expect(input.config.defaultDailyNorms).toEqual(draft.norms);
    expect(input.config.importProfiles).toEqual(DEFAULT_PROFILES); });
  it('a phrase: random, long enough, never the demo one', () => {
    expect(phraseProblem('sales-quest-demo')).toMatch(/демо/);
    expect(phraseProblem('short')).toMatch(/короткая/);
    expect(generatePhrase(fixedRandom)).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d\d$/); });
  it('the launch commit writes the season, points version and index at it, removes the demo', async () => {
    // FakeGitHubRepo: after launchChange, data/seasons/demo/* gone, index lists only the new season,
    // version.json.seasonId = the new id, the files open with the new phrase and not with the demo one });
  ```
- [ ] Step 2: Implement; `NewGame.tsx` — steps: dates → funnel file (`parseFile`) → teams (leader,
  colour from a palette, hero from `VARIANTS` with a small preview name, order) → operators (ticked /
  «проверьте») → norms → phrase (generate / own, «Сохраните фразу…», the links with a copy button) →
  preview (teams, operators per team, the track length) → «Создать игру» → `launchChange` →
  `Publishing`. The wizard refuses to run over an existing non-demo active season (2b/5 handle the next
  games).
- [ ] Step 3: Checks; commit «Admin: the «Новая игра» wizard — teams from the funnel, the secret phrase,
  one launch commit that replaces the demo (§10, D-24, D-32, OQ-14)».

### Task 8: QA-3 — the admin end to end with a fake GitHub

**Где смотреть:** ТЗ QA-3, §18 (критерии этапа 2); решения D-39 (e2e в CI не держит деплой); код
`tests/support/fakeGitHub.ts` (`serveFakeGitHub`), `tests/e2e/data.spec.ts` (как открывается демо);
навигатор §14.

**Files:**
- Create: `tests/e2e/admin.spec.ts`
- Modify: `tests/support/fakeGitHub.ts` (also answers the site's `/data/*` from the fake's head, so the
  viewer sees what the admin committed)

- [ ] Step 1: Test «a file → preview → commit → the viewer sees the figures move»: route
  `https://api.github.com/**` and `**/data/**` to a `FakeGitHubRepo` seeded from the demo; `#/admin` →
  token `test-token` (a test value of this app), the demo phrase → «Загрузить выгрузку» →
  `tests/fixtures/import/funnel.xlsx` → resolve the two unknown (link one, ignore one) → the preview shows
  a team «было → станет» → «Записать» → the fake has a commit whose message has no fixture name →
  `#/?date=…` shows a team card with the new cell.
- [ ] Step 2: Test «the same file again moves nothing» — second import → the preview's teams all equal,
  the commit changes only `imports`.
- [ ] Step 3: Test «Новая игра» — on a fake seeded with the demo: the wizard with the fixture funnel,
  a generated phrase → «Создать игру» → the fake has no `data/seasons/demo/` → the viewer with the new
  phrase sees six teams of the new season, the demo phrase gets «Код не подходит».
- [ ] Step 4: Test «a token without push rights» and «the branch moved» (the fake advances between
  preview and commit → «данные изменились — проверьте ещё раз», no lost change).
- [ ] Step 5: `npm run test:e2e` — all green, QA-4 unchanged; commit «e2e: the admin with a fake GitHub
  — import to the viewer, a repeated import, the new game, a moved branch (QA-3)».

### Task 9: Docs and stage 2a acceptance

**Где смотреть:** ТЗ §18 (этап 2: QA-2, QA-3, повторный импорт не двигает фигурки); CLAUDE.md
«Проверка»; навигатор §0, §3.

- [ ] DECISIONS: D-51 (stage 2 for the launch: approach A, the ready profiles instead of the generic
  wizard, the demo in `tests/fixtures`, the secret phrase rules, public commit messages); OQ-13 —
  the result of the real files' check; OQ-14 — answered by the author in the wizard (at the launch);
  BACKLOG «Этап 2» — items done or moved to 2b; NAVIGATOR §3 (the admin: where to look);
  CLAUDE.md (current stage, commands `make-fixtures`, `check-exports`, `SQ_DATA_DIR`).
- [ ] Independent review of 2a (subagent; never opens the root `*.xlsx` or `refs/`); fixes; report to
  the author; push after «да».
- [ ] With the author: create the token → «Новая игра» → import the funnel and the payments → open the
  site with the new link → send the links. Then 2b.
