# Stage 1c — Data, Encryption and Delivery Implementation Plan

> **For agentic workers:** executed inline in the authoring session (stage 1 process, 06.10.2026); an
> independent review subagent checks the result. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The demo game is generated, encrypted into `data/`, served by Pages, loaded and decrypted by
the viewer (with the access phrase from the link), kept fresh by polling, and shown on `#/debug` —
the stage 1 acceptance criterion.

**Architecture:** `src/data/` gets the storage side: `crypto.ts` (WebCrypto, shared by the browser and
Node scripts), `files.ts` (file schemas, paths, fingerprints), `seal.ts` (season data → file texts),
`storage.ts` (byte-level read adapters), `sync.ts` (load a season, poll, fall back to the cache),
`cache.ts`, `time.ts`. `src/app/` gets a tiny store, the access gate and the viewer wiring;
`src/debug/DebugPage.tsx` is a lazy chunk. `scripts/` gets `seed-demo` and `check-data`, and the Vite
config a plugin that serves and copies `data/`.

**Tech Stack:** TypeScript ~6.0.3, WebCrypto (browser and Node 22), zod ^4.6.5, React 19, Vite 8,
Vitest 5, Playwright 1.63. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-stage-1c-data-delivery-design.md`; `docs/SPEC.md` §13.1,
§13.5–13.7, §14, §15; `docs/DECISIONS.md` D-9, D-11, D-12, D-31…D-34.

## Global Constraints

- Encryption: AES-GCM 256, key = PBKDF2-SHA-256 of the phrase, **250 000 iterations** in data files
  (`check:data` refuses fewer than 100 000); one salt per write; the derived key is cached per
  (phrase, salt, iterations) (D-12).
- Envelope: `{v: 1, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter, salt, iv, ciphertext}`, base64 fields.
- Files: `data/version.json`, `data/seasons/index.json`, `data/seasons/<id>/{config,records,adjustments,imports}.enc.json`.
- `version.json` is fetched with `?t=<ms>` and `cache: "no-store"`; season files with `?v=<fingerprint>`.
- The phrase lives in localStorage key `sq.phrase`; the offline cache in `sq.cache.v1` (encrypted texts only).
- Demo: season id `demo`, phrase `sales-quest-demo` (public by the author's decision, D-32), two weeks
  from Monday of the current week, volumes are round order-of-magnitude numbers only.
- `src/engine` stays pure; clocks, storage and `fetch` live in `src/data` and `src/app` only.
- Admin-visible messages in Russian, code comments in English, relative imports with `.ts`/`.tsx`.
- Local commits approved for stage 1; push only after the author's "yes" (D-3); never `--no-verify`;
  commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Responsibility |
|---|---|
| `src/data/crypto.ts` | `encryptJson`, `decryptJson`, `KeyCache`, `DecryptError`, base64 |
| `src/data/files.ts` | `EnvelopeSchema`, `VersionSchema`, `SeasonIndexSchema`, file schemas, `SEASON_FILES`, `dataPath`, `fingerprint`, `revOf`, `parseSeasonFile`, `DataVersionError` |
| `src/data/seal.ts` | `sealSeason(data, phrase, meta)` → file texts; `seasonIndexText` |
| `src/data/storage.ts` | `DataSource` (`read(path, mode)`), `PagesSource`, `MemorySource`, `StorageError` |
| `src/data/sync.ts` | `loadSeason`, `createSync` (poll, backoff, cache, phrase errors) |
| `src/data/cache.ts` | `readCache`, `writeCache`, `readPhrase`, `writePhrase`, `forgetPhrase` (try/catch) |
| `src/data/time.ts` | `localTimestamp(date)`, `localDate(date)` (D-11) |
| `src/app/store.ts` | `createStore`, `useStore` |
| `src/app/access.ts` | `takePhrase(route)` — phrase from `?k=` and the hash without it |
| `src/app/viewer.ts` | the viewer: sync → engine → store; recompute on a new day |
| `src/app/AccessGate.tsx` | «Введите код доступа» screen |
| `src/app/App.tsx` | routes `/` and `/debug` (lazy), gate |
| `src/debug/DebugPage.tsx` | `#/debug` |
| `scripts/lib/demo.ts`, `scripts/seed-demo.ts` | demo season generator and CLI |
| `scripts/lib/checkData.ts`, `scripts/check-data.ts` | `check:data` |
| `scripts/lib/dataPlugin.ts`, `vite.config.ts` | serve `data/` in dev, copy into `dist/data` |
| `.github/workflows/deploy.yml` | `npm run check:data` |

---

### Task 1: Encryption

**Files:** create `src/data/crypto.ts`; test `tests/unit/data/crypto.test.ts`.

**Interfaces — produces:**
```ts
export const KDF_ITERATIONS = 250_000;
export type Envelope = { v: 1; alg: 'AES-GCM'; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ciphertext: string };
export class DecryptError extends Error {} // «код не подходит или файл повреждён»
export type KeyCache = Map<string, Promise<CryptoKey>>;
export function newSalt(): Uint8Array; // 16 random bytes
export async function encryptJson(value: unknown, phrase: string, opts: { salt: Uint8Array; iterations?: number; keys?: KeyCache }): Promise<Envelope>;
export async function decryptJson(envelope: Envelope, phrase: string, keys?: KeyCache): Promise<unknown>;
export function toBase64(bytes: Uint8Array): string; export function fromBase64(text: string): Uint8Array;
```
- [ ] Tests: round trip of nested JSON with Cyrillic; envelope fields (`v`, `alg`, `kdf`, `iter`, 12-byte iv);
  wrong phrase → `DecryptError`; one flipped ciphertext byte → `DecryptError`; two files with one salt
  derive one key (cache size 1); base64 round trip of 0…255 bytes. Tests use 1 000 iterations for speed.
- [ ] Implement with `globalThis.crypto.subtle` (PBKDF2 → AES-GCM 256, random 12-byte iv per file).
- [ ] typecheck, lint, test; commit `Stage 1c: AES-GCM + PBKDF2 encryption of data files (SEC-6, D-12)`.

### Task 2: File schemas, sealing and the CI data check

**Files:** create `src/data/files.ts`, `src/data/seal.ts`, `scripts/lib/checkData.ts`, `scripts/check-data.ts`;
modify `package.json` (`check:data`), `.github/workflows/deploy.yml`; tests `tests/unit/data/files.test.ts`,
`tests/unit/checkData.test.ts`.

**Interfaces — produces:**
```ts
export const SEASON_FILES = ['config', 'records', 'adjustments', 'imports'] as const;
export type SeasonFile = (typeof SEASON_FILES)[number];
export const dataPath = { version: 'version.json', index: 'seasons/index.json', season: (id: string, file: SeasonFile) => `seasons/${id}/${file}.enc.json` };
export type Version = z.output<typeof VersionSchema>; // {schemaVersion: 1, rev, seasonId, updatedAt, lastImportAt: string | null, files: Record<SeasonFile, string>}
export class DataVersionError extends Error {} // «данные новее этой версии сайта — обновите страницу»
export function parseSeasonFile(file: SeasonFile, value: unknown): ...; // config → SeasonConfig; others → arrays
export async function fingerprint(text: string): Promise<string>; // SHA-256 hex
export async function revOf(files: Record<SeasonFile, string>): Promise<string>;
// seal.ts
export async function sealSeason(data: EngineInput, phrase: string, meta: { updatedAt: string; iterations?: number; keys?: KeyCache }): Promise<Map<string, string>>; // dataPath → text, incl. version.json
export function seasonIndexText(seasons: SeasonSummary[]): string;
// scripts/lib/checkData.ts
export async function checkDataTree(files: Map<string, string>): Promise<string[]>; // problems, Russian
export function scanTrackedFiles(files: { path: string; text: string | null }[]): string[];
```
- [ ] Tests (files): schemas accept sealed output; `schemaVersion: 2` → `DataVersionError`; a plain JSON
  named `*.enc.json` fails `EnvelopeSchema`; `fingerprint` is stable hex.
- [ ] Tests (seal): seal → decrypt each file → `parseSeasonFile` → equals the input; `version.files` are
  the fingerprints of the texts; all four files share one salt.
- [ ] Tests (checkData): accepts a sealed tree; reports an open JSON in `*.enc.json`, `iter < 100 000`, a
  stray path, a fingerprint mismatch, `version.seasonId` without its folder; `scanTrackedFiles` reports a
  token and a spreadsheet outside `tests/fixtures/` (reuses `findViolations`).
- [ ] `scripts/check-data.ts`: reads `data/**` from disk and `git ls-files` texts; exit 1 with the list.
  CI: `npm run check:data` after `npm run lint`.
- [ ] Commit `Stage 1c: data file schemas, sealing, CI data check by content (DATA-15, D-33, D-34)`.

### Task 3: Read adapters, loader and sync

**Files:** create `src/data/storage.ts`, `src/data/cache.ts`, `src/data/time.ts`, `src/data/sync.ts`;
tests `tests/unit/data/sync.test.ts`, `tests/unit/data/time.test.ts`.

**Interfaces — produces:**
```ts
export interface DataSource { read(path: string, mode: { fresh: true } | { fingerprint: string }): Promise<string> }
export class PagesSource implements DataSource { constructor(baseUrl: string, fetchFn?: typeof fetch, clock?: () => number) }
export class MemorySource implements DataSource { constructor(files: Map<string, string>) }
export class StorageError extends Error { constructor(path: string, status: number | null) }
export type Loaded = { version: Version; texts: Record<SeasonFile, string>; input: EngineInput; timings: { fetchMs: number; decryptMs: number } };
export async function loadSeason(source: DataSource, phrase: string, keys: KeyCache, previous?: Loaded): Promise<Loaded>;
export type SyncState =
  | { phase: 'need-phrase' } | { phase: 'loading' } | { phase: 'wrong-phrase' }
  | { phase: 'ready'; loaded: Loaded; offline: { since: string } | null; checkedAt: string }
  | { phase: 'error'; message: string };
export function createSync(deps: SyncDeps): { start(): void; stop(): void; refresh(): void };
export function localTimestamp(date: Date): string; // 2026-10-08T19:05:00+03:00
export function localDate(date: Date): string;      // 2026-10-08
```
`SyncDeps`: `source`, `phrase(): string | null`, `cache: { read(): CachedSeason | null; write(c): void }`,
`keys`, `intervalSec`, `setTimer(fn, ms)`, `clearTimer(id)`, `now(): Date`, `onState(s)`.
- [ ] Tests (loader): loads a sealed `MemorySource`; reuses unchanged files (counts reads); a fingerprint
  mismatch is a `StorageError`; wrong phrase → `DecryptError`.
- [ ] Tests (sync, fake timers): `need-phrase` without a phrase; `ready` then next check after the interval;
  a new `rev` reloads only changed files; network error with a previous load → `ready` + `offline`, next
  try after ×2 up to 300 s, success clears `offline`; start with a cache → `ready` from the cache first;
  wrong phrase → `wrong-phrase`, no polling.
- [ ] Tests (time): offsets `+03:00`, `-05:30`, `+00:00` (D-11).
- [ ] Commit `Stage 1c: read adapters, season loader and polling with an offline cache (ARCH-1, SYNC-1…4)`.

### Task 4: Serving `data/`, the demo season

**Files:** create `scripts/lib/dataPlugin.ts`, `scripts/lib/demo.ts`, `scripts/seed-demo.ts`, `data/**`;
modify `vite.config.ts`, `package.json` (`seed-demo`); tests `tests/unit/demo.test.ts`.

**Interfaces — produces:**
```ts
export function dataPlugin(dir?: string): Plugin; // dev: `${base}data/*` from disk, no-store; build: emit into dist/data
export function demoSeason(opts: { start: string; seed?: number }): EngineInput; // pure, repeatable
// CLI: node scripts/seed-demo.ts --phrase <p> [--start YYYY-MM-DD] [--seed N]   (or SQ_DEMO_PHRASE)
```
Demo shape: 6 teams (sizes 12, 9, 8, 7, 6, 5), fictional leaders and operators; per working day
Poisson means inv6 ≈ 2.5, inv20 ≈ 1, pay ≈ 0.2 × operator ability (0.6–1.5) × team factor (0.85–1.25);
~5 % days off; a transfer and a newcomer on the second Monday, a firing on day 7; a team step, a point
correction, two «Звонок недели» grants; import log entries; starter achievements.
- [ ] Tests: same seed → same output; the config parses; `computeGameState` at the end: six teams,
  positions differ, at least 8 different achievements unlocked, no warnings.
- [ ] Run `npm run seed-demo -- --phrase sales-quest-demo`; `npm run check:data` passes; `npm run build`
  puts `dist/data/version.json`.
- [ ] Commit `Stage 1c: demo season generator and encrypted demo data (DATA-16, D-32)`.

### Task 5: Viewer — store, access gate, debug page

**Files:** create `src/app/store.ts`, `src/app/access.ts`, `src/app/viewer.ts`, `src/app/AccessGate.tsx`,
`src/debug/DebugPage.tsx`; modify `src/app/App.tsx`; tests `tests/unit/store.test.ts`,
`tests/unit/access.test.ts`, `tests/e2e/data.spec.ts`.

**Interfaces — produces:**
```ts
export function createStore<T>(initial: T): { get(): T; set(next: T): void; subscribe(fn: () => void): () => void };
export function useStore<T, S>(store: Store<T>, select: (t: T) => S): S;
export function takePhrase(route: Route): { phrase: string | null; route: Route }; // strips `k`
export type ViewerState = { sync: SyncState; game: GameState | null; computeMs: number | null; asOf: string | null };
export function startViewer(opts?: { date?: string }): Store<ViewerState>;
```
- [ ] Tests: store notifies subscribers and skips equal sets; `takePhrase` strips `k` and keeps other
  query keys; e2e on the preview build: `#/debug?k=sales-quest-demo` shows six team rows and the phrase
  leaves the address bar; `#/debug` without a phrase shows «Введите код доступа»; a wrong phrase shows
  «Код не подходит»; `?date=` changes «на дату».
- [ ] `size`: the debug page is a separate chunk; initial JS stays ≤ 600 KB gzip.
- [ ] Commit `Stage 1c: viewer with the access gate, polling and the #/debug page (SEC-7, SYNC-1…4)`.

### Task 6: Docs, review, publication

- [ ] README: how to open the demo (`https://konturproject.github.io/sales-quest/#/debug?k=sales-quest-demo`),
  how to reseed; CLAUDE.md architecture and commands; BACKLOG (close the stage 0 items now done).
- [ ] `npm run typecheck && npm run lint && npm test && npm run test:engine && npm run check:data && npm run build && npm run size && npm run test:e2e`.
- [ ] Independent review subagent; fix findings; report; push after "yes"; check the live site
  (stage 1 acceptance).

## Review fixes (08.10.2026)

Critical: a cache under an old phrase locked viewers out after a phrase change — the cache now never
decides, the site does. Major: D-35 visibility by import profile and date range (a monthly re-import
re-stamps records), revokes from their day; engine errors and impossible `?date=` no longer stop
polling or blank the page (error state, `isDate`, `ErrorBoundary`). Minor: a stopped sync is silent;
one check at a time; damaged data is not «wrong phrase»; 15 s fetch timeout; mismatched files refetched
past the browser cache; iteration ceiling; `sealSeason` reuse guarded; `check:data` wants the current
game in the index and one salt per publication; seed-demo keeps other games in the index;
deterministic sync tests; the gate input off spell-check and autofill; D-36 on the shared Pages origin.
