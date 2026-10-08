# Stage 1c — data, encryption and delivery: design

Approved by the author on 08.10.2026. Requirements: SPEC §13.1 (ARCH-1, ARCH-2), §13.5–13.7 (SEC-6…10,
SYNC-1…4), §14 (DATA-15, DATA-16), §15 (DEP-2, DEP-4), D-12; decisions D-31…D-34 in `docs/DECISIONS.md`.
Stage 1 acceptance: the demo game loads from GitHub Pages and decrypts.

## 1. Files in `data/` (public on Pages)

| Path | Open? | Content |
|---|---|---|
| `data/version.json` | open | `{schemaVersion: 1, rev, seasonId, updatedAt, lastImportAt, files: {config, records, adjustments, imports}}` — `files` are SHA-256 fingerprints of the encrypted files, `rev` is the fingerprint of all of them |
| `data/seasons/index.json` | open | `{schemaVersion: 1, seasons: [{id, title, status, period}]}` — no names |
| `data/seasons/<id>/config.enc.json` | encrypted | `SeasonConfig` (already has `schemaVersion: 1`) |
| `data/seasons/<id>/records.enc.json` | encrypted | `{schemaVersion: 1, records: MetricRecord[]}` |
| `data/seasons/<id>/adjustments.enc.json` | encrypted | `{schemaVersion: 1, adjustments: Adjustment[]}` |
| `data/seasons/<id>/imports.enc.json` | encrypted | `{schemaVersion: 1, imports: ImportLog[]}` |

Encrypted file = envelope `{v: 1, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter: 250000, salt, iv, ciphertext}`
(base64). One salt per write, so a client derives the key once per write (D-12). An unknown
`schemaVersion` is an error with a clear message; migrations (`src/data/migrations/`) arrive with the
first change of a schema.

## 2. Viewer flow

1. `#/?k=<phrase>`: the phrase goes to localStorage (try/catch) and leaves the address bar. No phrase
   or a phrase that does not decrypt → screen «Введите код доступа» (with «код не подходит»).
2. Load: `version.json?t=<now>` with `cache: "no-store"` → files of the season by fingerprint
   (`<file>?v=<fingerprint>`, cacheable) → decrypt → validate with zod → `prepare` → `computeGameStateFrom`.
3. Every `ui.pollIntervalSec` (default 60 s) the version is checked; a new `rev` reloads only the
   changed files. The state is also recomputed when the local date changes.
4. Network error: the last good encrypted files from localStorage, banner «нет связи, данные от ЧЧ:ММ»,
   retries with a growing pause (×2 up to 5 min); the next success restores the normal interval.
5. "Now" for the engine is a local timestamp with offset (`localTimestamp`, D-11).

## 3. `#/debug` (lazy chunk)

Data rev and season, timings (fetch, key, decrypt, engine), teams (position, pace, delta, location),
leaderboard top 10, unlocks, warnings. `?date=YYYY-MM-DD` shows the game on that day. Viewers never
load this chunk.

## 4. Demo game — `npm run seed-demo`

- 6 teams with fictional leaders, ~50 fictional operators, teams of 5–12; no daily norms (default 7.5).
- Two weeks from Monday of the current week (`--start` to override); data for all 10 working days — the
  engine ignores days after today, so the demo unfolds in real time and then shows its result.
- Volumes: order of magnitude only (author, 08.10.2026) — round per-operator rates, an "ability" factor
  per operator, a seeded PRNG (repeatable output).
- Roster life: a transfer, a firing, a newcomer mid-game; two admin step adjustments, a manual
  «Звонок недели»; the starter achievements.
- The demo phrase is public (author, 08.10.2026): README, passed to the script as an argument or env var.

## 5. Build and protection

- A Vite plugin serves `data/` on the dev server and copies it into `dist/data` (same locally and in CI).
- `npm run check:data` (CI): every file in `data/` checked by content — envelopes for `*.enc.json`, schemas
  for the open files, only allowed paths; the hook rules (tokens, spreadsheets) over every tracked file.
  Covers `--no-verify`, clones without hooks and the admin's API commits (stage 2).

## 6. Code

`src/data/`: `crypto.ts` (browser and Node), `files.ts` (file schemas, paths, envelope), `storage.ts`
(`StorageAdapter` read side: `PagesAdapter` over `fetch`, `MemoryAdapter` for tests and Node), `sync.ts`
(loader and poller with injected fetch / clock / timers), `cache.ts`, `time.ts`. `src/app/`: a tiny store
(`useSyncExternalStore`, no Zustand — D-31), the access gate, the viewer bootstrap. `src/debug/DebugPage.tsx`.
`commit()` of `StorageAdapter` is stage 2 (admin).

## 7. Tests

Crypto round trip, wrong phrase, tampered file, key cache; file schemas and `check:data`; sync with a
fake network (rev change → only changed files, error → cache and backoff, wrong phrase); seed-demo is
repeatable and its game moves every team and unlocks achievements; e2e: `#/debug?k=<demo>` on the
preview build shows six teams.
