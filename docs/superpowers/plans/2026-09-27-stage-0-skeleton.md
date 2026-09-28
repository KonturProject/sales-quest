# Stage 0 — Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An empty isometric 3D scene of Sales Quest, built by CI and published on GitHub Pages at https://konturproject.github.io/sales-quest/, with the toolchain, safety hook and size budget every later stage relies on.

**Architecture:** Vite + React + TypeScript SPA. A tiny hash router (`src/app/router.ts`) picks the screen; the map screen is a React Three Fiber canvas with an orthographic camera and on-demand rendering (no frames while nothing changes). Node scripts in `scripts/` (run by Node 22 directly as `.ts`) check the initial-JS budget and block secrets in commits. GitHub Actions type-checks, lints, tests, builds, checks size and deploys to Pages.

**Tech Stack:** Node ≥ 22.18, TypeScript ~6.0.3, Vite ^8.3.1, React ^19.3.0, three ^0.186.1, @react-three/fiber ^9.8.1, Tailwind CSS ^4.3.3, ESLint ^10.11.0 + typescript-eslint ^8.70.1, Prettier ^3.9.9, Vitest ^5.0.2, Playwright ^1.63.0 (installed Chrome, no browser download).

**Spec:** `docs/SPEC.md` (§13.2 stack, §13.4 layout, §15 deploy, §18 stage 0), `docs/DECISIONS.md` (D-1…D-18 override the spec), `docs/OPEN_QUESTIONS.md`.

## Global Constraints

- Project root: `C:\Users\Elder_Mikhey\Desktop\Dev Claude\stepper game` (all paths below are relative to it). Default branch `main`.
- Site base path: `/sales-quest/` (defined once in `scripts/lib/site.ts`).
- Initial JS budget: ≤ 600 KB gzip (PERF-BUDGET) — enforced by `npm run size`.
- Rendering: `frameloop="demand"`, no endless `requestAnimationFrame` (PERF-1); `antialias: false`, `preserveDrawingBuffer: false` (PERF-10, PERF-11); `MeshLambertMaterial`, no shadows, no post-processing (PERF-9).
- TypeScript: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`; relative imports carry the `.ts`/`.tsx` extension (Node runs `scripts/*.ts` without a build).
- TypeScript stays on 6.0.x: typescript-eslint 8.70 supports `typescript >=4.8.4 <6.1.0` (TS 7.0.2 is `latest` on npm but unsupported).
- UI text in Russian; code comments in English.
- Nothing leaves the machine without the author's explicit “yes” (D-3): `git commit` (ask once for the whole stage), `gh repo create`, enabling Pages, `git push`.
- Commit messages: English, reference requirement IDs, end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never commit with `--no-verify`.
- Whenever `npm run lint` reports Prettier differences in files this plan created, run `npm run format` and re-run `npm run lint` (Prettier owns code formatting; the code blocks below are not pre-formatted to the character).
- Libraries are installed when first used, not in advance: zustand, zod, date-fns — stage 1; SheetJS — stage 2; drei — stage 3.

## File map

| File | Responsibility |
|---|---|
| `package.json` | scripts, dependencies, `engines.node` |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | solution file for editors / browser code in `src` / Node code (`scripts`, `tests`, configs) |
| `eslint.config.js`, `.prettierrc.json`, `.prettierignore` | lint and format rules |
| `.gitignore`, `.gitattributes` | never commit Excel/build output; LF line endings |
| `vitest.config.ts`, `playwright.config.ts`, `vite.config.ts` | unit tests, e2e tests, build |
| `index.html`, `src/main.tsx`, `src/index.css` | entry point, Tailwind |
| `src/app/router.ts` | `parseHash`, `formatHash` — pure hash routing (D-9) |
| `src/app/useHashRoute.ts` | React hook: current route, re-renders on `hashchange` |
| `src/app/App.tsx` | picks the screen for the route |
| `src/scene/cameraRig.ts` | `cameraPosition(angles, distance, target)` — pure camera math |
| `src/scene/defaults.ts` | `DEFAULT_CAMERA` until the season config exists (stage 1) |
| `src/scene/MapScene.tsx` | R3F canvas + stage-0 placeholder track |
| `src/perf/FrameCounter.tsx` | counts drawn frames on `window.__sqFrames` |
| `scripts/lib/site.ts` | `BASE_PATH` |
| `scripts/lib/size.ts`, `scripts/check-size.ts` | initial-JS budget (pure part / CLI) |
| `scripts/lib/precommit.ts`, `scripts/precommit-check.ts`, `scripts/install-hooks.ts`, `.githooks/pre-commit` | secret/data guard (D-6) |
| `tests/unit/*.test.ts`, `tests/e2e/smoke.spec.ts` | tests |
| `.github/workflows/deploy.yml` | CI + Pages deploy (DEP-2) |
| `.claude/launch.json` | dev server for the Claude Code preview pane |
| `CLAUDE.md`, `README.md`, `ASSETS_CREDITS.md` | project docs |

---

### Task 1: Toolchain and hash router

**Files:**
- Create: `package.json` (via `npm init` + `npm install`), `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.gitattributes`, `vitest.config.ts`, `src/app/router.ts`, `src/app/useHashRoute.ts`, `CLAUDE.md`, `README.md`, `ASSETS_CREDITS.md`
- Test: `tests/unit/router.test.ts`

**Interfaces:**
- Produces: `type Route = { path: string; query: Record<string, string> }`; `parseHash(hash: string): Route`; `formatHash(route: { path: string; query?: Record<string, string> }): string`; `useHashRoute(): Route`.
- Produces: npm scripts `typecheck`, `lint`, `format`, `test`, `test:watch` (later tasks add `dev`, `build`, `preview`, `size`, `test:e2e`, `prepare`).

- [ ] **Step 1: Initialise git and npm**

```bash
cd "/c/Users/Elder_Mikhey/Desktop/Dev Claude/stepper game"
git init -b main
npm init -y
```

Then replace the generated `package.json` with:

```json
{
  "name": "sales-quest",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.18"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.app.json && tsc -p tsconfig.node.json",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react@^19.3.0 react-dom@^19.3.0 three@^0.186.1 @react-three/fiber@^9.8.1
npm install -D typescript@~6.0.3 @types/react@^19.3.0 @types/react-dom@^19.3.0 @types/three@^0.186.0 @types/node@^22.20.4 vite@^8.3.1 @vitejs/plugin-react@^6.1.1 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 eslint@^10.11.0 @eslint/js@^10.0.1 typescript-eslint@^8.70.1 eslint-plugin-react-hooks@^7.1.1 eslint-plugin-react-refresh@^0.5.7 globals@^17.12.0 prettier@^3.9.9 vitest@^5.0.2 @playwright/test@^1.63.0
```

Expected: both finish without `ERESOLVE` peer-dependency errors. (Playwright does not download browsers on install.)

- [ ] **Step 3: Write the config files**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json` (tests import pure modules from `src`, so it also has the DOM lib):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["scripts", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023 },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
]);
```

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "printWidth": 100
}
```

`.prettierignore` (Markdown is hand-formatted; SPEC.md is the author's text and is never reformatted):

```
dist
coverage
playwright-report
test-results
package-lock.json
*.md
```

`.gitignore`:

```
node_modules/
dist/
coverage/
playwright-report/
test-results/
.env*
*.local
# Source Excel files never go into the repo (SEC-10); synthetic test fixtures are the exception.
*.xlsx
*.xls
*.csv
!tests/fixtures/**
```

`.gitattributes`:

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.webp binary
*.glb binary
*.xlsx binary
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing router test**

`tests/unit/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '../../src/app/router.ts';

describe('parseHash', () => {
  it('treats an empty hash as the map route', () => {
    expect(parseHash('')).toEqual({ path: '/', query: {} });
    expect(parseHash('#')).toEqual({ path: '/', query: {} });
    expect(parseHash('#/')).toEqual({ path: '/', query: {} });
  });

  it('reads the path', () => {
    expect(parseHash('#/leaderboard')).toEqual({ path: '/leaderboard', query: {} });
  });

  it('normalises missing and trailing slashes', () => {
    expect(parseHash('#admin/')).toEqual({ path: '/admin', query: {} });
  });

  it('reads the query, including a Cyrillic access phrase (SEC-7)', () => {
    expect(parseHash('#/?k=%D0%BA%D0%BE%D0%B4-42')).toEqual({ path: '/', query: { k: 'код-42' } });
  });

  it('decodes + as a space, as URLSearchParams does', () => {
    expect(parseHash('#/?k=a+b').query.k).toBe('a b');
  });
});

describe('formatHash', () => {
  it('round-trips through parseHash', () => {
    const route = { path: '/leaderboard', query: { week: '2', k: 'код 42' } };
    expect(parseHash(formatHash(route))).toEqual(route);
  });

  it('omits an empty query', () => {
    expect(formatHash({ path: '/' })).toBe('#/');
    expect(formatHash({ path: 'admin', query: {} })).toBe('#/admin');
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../../src/app/router.ts"` (or "Cannot find module").

- [ ] **Step 6: Implement the router and the hook**

`src/app/router.ts`:

```ts
/** A parsed hash route: `#/leaderboard?week=2` → { path: '/leaderboard', query: { week: '2' } }. */
export type Route = {
  path: string;
  query: Record<string, string>;
};

/**
 * Parses `location.hash`. GitHub Pages has no index.html fallback for deep links, so all
 * routing lives in the fragment (DEP-3). The fragment also carries the access phrase
 * `#/?k=...` (SEC-7), which the browser never sends to the server.
 */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const pathPart = q === -1 ? raw : raw.slice(0, q);
  const queryPart = q === -1 ? '' : raw.slice(q + 1);
  return {
    path: normalizePath(pathPart),
    query: Object.fromEntries(new URLSearchParams(queryPart)),
  };
}

export function formatHash(route: { path: string; query?: Record<string, string> }): string {
  const qs = new URLSearchParams(route.query ?? {}).toString();
  return `#${normalizePath(route.path)}${qs ? `?${qs}` : ''}`;
}

function normalizePath(path: string): string {
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}
```

`src/app/useHashRoute.ts`:

```ts
import { useMemo, useSyncExternalStore } from 'react';
import { parseHash, type Route } from './router.ts';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getHash(): string {
  return window.location.hash;
}

/** The current hash route; re-renders on `hashchange`. */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return useMemo(() => parseHash(hash), [hash]);
}
```

- [ ] **Step 7: Run the tests, type-check and lint**

Run: `npm test`
Expected: PASS, 7 tests.

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: exit 0. If Prettier reports files, run `npm run format` and re-run `npm run lint`.

- [ ] **Step 8: Write the project docs**

`CLAUDE.md`:

````md
# CLAUDE.md — Sales Quest

Шагалка отдела продаж: 6 команд (фигурка = руководитель группы) идут по треку через 4 локации
(= недели месяца) по реальным показателям из Excel. Статический SPA на GitHub Pages; общее
состояние — зашифрованные JSON в этом же репозитории.

## Источники правды
- `docs/SPEC.md` — ТЗ. Ссылайся на ID требований (FR-*, PERF-*, ...) в коммитах.
- `docs/DECISIONS.md` — отступления от ТЗ и уточнения (D-*, ADM-ROSTER-*, R-*). При расхождении с ТЗ действует он.
- `docs/OPEN_QUESTIONS.md` — незакрытые вопросы. Ответы не выдумывать: дефолт через конфиг + строка там.
- `docs/IMPORT_FORMATS.md` — разметка реальных выгрузок (воронка по дням, оплаченные счета). Реальные
  `.xlsx` лежат в корне только локально и в git не попадают.
- `docs/superpowers/plans/` — планы этапов.

## Этапы
Порядок 0 → 1 → 3 → 2 → 4 → 5 (D-1). Этап N+1 — только после критериев приёмки этапа N и «ок» автора.
Текущий этап: **0 — каркас**.

## Правила
- Игровые числа — только из SeasonConfig, без магических констант. Заглушки этапа 0 помечены как заглушки.
- `src/engine` (с этапа 1) — чистые функции без DOM/сети/`Date.now()`; даты — строки `YYYY-MM-DD`,
  «сейчас» передаётся параметром (D-11). Любое изменение — тесты.
- Целевое железо: i3 4–5 поколения, Intel HD, 6 ГБ ОЗУ. Бюджеты — SPEC §12. Рендер по требованию
  (`frameloop="demand"`), никаких бесконечных `requestAnimationFrame`. Постпроцессинг, реалтайм-тени
  статики, физика — запрещены по умолчанию.
- Не коммитить: токены, фразу доступа, исходные Excel, незашифрованные данные с ФИО. Это проверяет
  pre-commit-хук (`.githooks/pre-commit`, D-6); `--no-verify` не использовать.
- Ассеты — только CC0/CC-BY, с записью в `ASSETS_CREDITS.md`.
- Всё, что уходит наружу (commit, push, деплой, настройки GitHub, скачивание ассетов), — только после
  явного «да» автора (D-3).
- Относительные импорты — с расширением `.ts`/`.tsx`: скрипты в `scripts/` Node запускает напрямую, без сборки.
- TypeScript держим на 6.0.x, пока typescript-eslint не поддержит 7.x.

## Команды
```bash
npm run dev        # dev-сервер http://localhost:5173/sales-quest/
npm run build      # сборка в dist/
npm run preview    # собранная версия на http://localhost:4173/sales-quest/
npm run typecheck  # tsc для src и для scripts/tests/конфигов
npm run lint       # ESLint + Prettier --check
npm run format     # Prettier --write
npm test           # Vitest (tests/unit)
npm run test:e2e   # Playwright (tests/e2e): установленный Chrome, программный WebGL
npm run size       # начальный JS ≤ 600 КБ gzip (после build)
```

## Архитектура (этап 0)
- `src/app/` — `router.ts` (свой хэш-роутер, D-9), `useHashRoute.ts`, `App.tsx`.
- `src/scene/` — `MapScene.tsx` (R3F, ортокамера, заглушка трека), `cameraRig.ts` (позиция камеры по pitch/yaw), `defaults.ts`.
- `src/perf/FrameCounter.tsx` — счётчик кадров `window.__sqFrames` для тестов «в покое кадров нет».
- `scripts/` — `check-size.ts`, `precommit-check.ts`, `install-hooks.ts`; чистые функции — в `scripts/lib/`.
- `.github/workflows/deploy.yml` — CI и деплой на Pages (DEP-2).

## Проверка
После изменений: `npm run typecheck && npm run lint && npm test`. Для видимого — dev-сервер и браузер
(скриншот + состояние объектов). Для сцены — `npm run test:e2e`.
````

`README.md`:

````md
# Sales Quest — шагалка отдела продаж

Сайт: https://konturproject.github.io/sales-quest/

Требования — [`docs/SPEC.md`](docs/SPEC.md), решения — [`docs/DECISIONS.md`](docs/DECISIONS.md),
открытые вопросы — [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

## Запуск

Нужен Node 22.18 или новее.

```bash
npm install
npm run dev
```

Откроется http://localhost:5173/sales-quest/. Остальные команды — в [`CLAUDE.md`](CLAUDE.md).

## Окружение Claude Code (ставится вручную, D-5)

В терминальном `claude`:

```bash
npm install -g typescript-language-server typescript
```

```
/plugin install typescript-lsp@claude-plugins-official
```

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

Инструкция для администратора игры появится на этапе 5 (DEP-8).
````

`ASSETS_CREDITS.md`:

```md
# Ассеты и лицензии

Только CC0 / CC-BY (SPEC §11.4, GFX-SRC-1). CC-BY — с атрибуцией на экране «Об игре».

| Пак | Автор | URL | Лицензия | Где используется |
|---|---|---|---|---|
```

- [ ] **Step 9: Commit** (the author approves commits for the whole stage once, before execution starts)

```bash
git add -A
git status --short
git commit -m "Stage 0: toolchain, hash router, project docs (DEP-3, D-9)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected `git status --short` before the commit: no `node_modules/`, no `dist/`.

---

### Task 2: Pre-commit guard against secrets and unencrypted data (D-6)

**Files:**
- Create: `scripts/lib/precommit.ts`, `scripts/precommit-check.ts`, `scripts/install-hooks.ts`, `.githooks/pre-commit`
- Modify: `package.json` (add `prepare` script)
- Test: `tests/unit/precommit.test.ts`

**Interfaces:**
- Produces: `type StagedFile = { path: string; addedLines: string[] }`; `parseStagedDiff(diff: string): StagedFile[]`; `findViolations(files: StagedFile[]): string[]` (one Russian message per problem, empty = OK).

- [ ] **Step 1: Write the failing tests**

`tests/unit/precommit.test.ts` (fake tokens are assembled from pieces so this file never contains one):

```ts
import { describe, expect, it } from 'vitest';
import { findViolations, parseStagedDiff } from '../../scripts/lib/precommit.ts';

const classicToken = 'gh' + 'p_' + 'a1B2'.repeat(9);
const oauthToken = 'gh' + 'o_' + 'Z9y8'.repeat(9);
const fineGrainedToken = 'github' + '_pat_' + 'A'.repeat(22) + '_' + 'b'.repeat(59);

describe('parseStagedDiff', () => {
  it('collects added lines per file and skips deleted files', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,0 +2,2 @@',
      '+const x = 1;',
      '+++ content that starts with two pluses',
      'diff --git a/old.txt b/old.txt',
      'deleted file mode 100644',
      '--- a/old.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
      'diff --git a/data/x.json b/data/x.json',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/data/x.json',
      '@@ -0,0 +1 @@',
      '+{}',
    ].join('\n');

    expect(parseStagedDiff(diff)).toEqual([
      { path: 'src/a.ts', addedLines: ['const x = 1;', '++ content that starts with two pluses'] },
      { path: 'data/x.json', addedLines: ['{}'] },
    ]);
  });

  it('unquotes paths that git quotes and drops a trailing tab', () => {
    const diff = ['diff --git "a/x y.ts" "b/x y.ts"', '--- "a/x y.ts"', '+++ "b/x y.ts"\t', '@@ -0,0 +1 @@', '+1'].join('\n');
    expect(parseStagedDiff(diff)).toEqual([{ path: 'x y.ts', addedLines: ['1'] }]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseStagedDiff('')).toEqual([]);
  });
});

describe('findViolations', () => {
  it('flags classic, OAuth and fine-grained GitHub tokens, once per file', () => {
    const problems = findViolations([
      { path: 'a.ts', addedLines: [`const t = '${classicToken}';`, `// ${classicToken}`] },
      { path: 'b.ts', addedLines: [oauthToken] },
      { path: 'c.env', addedLines: [`TOKEN=${fineGrainedToken}`] },
    ]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('a.ts');
    expect(problems[0]).toContain('токен');
  });

  it('does not flag ordinary code or the detection patterns themselves', () => {
    expect(
      findViolations([
        {
          path: 'scripts/lib/precommit.ts',
          addedLines: ['const x = 1;', '/gh[pousr]_[A-Za-z0-9]{36}/', '/github_pat_[A-Za-z0-9_]{40,}/'],
        },
      ]),
    ).toEqual([]);
  });

  it('blocks unencrypted JSON in data/ and allows the public files', () => {
    const files = [
      'data/seasons/2026-10/records.json',
      'data/seasons/2026-10/records.enc.json',
      'data/version.json',
      'data/seasons/index.json',
      'package.json',
    ].map((path) => ({ path, addedLines: ['{}'] }));

    const problems = findViolations(files);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('data/seasons/2026-10/records.json');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/unit/precommit.test.ts`
Expected: FAIL — cannot resolve `../../scripts/lib/precommit.ts`.

- [ ] **Step 3: Implement the pure part**

`scripts/lib/precommit.ts`:

```ts
export type StagedFile = { path: string; addedLines: string[] };

/**
 * Splits `git diff --cached -U0` output into files with their added lines.
 * `+++` counts as a file header only between `diff --git` and the first `@@`,
 * so content lines that start with `++` are not mistaken for headers.
 * Deleted files (`+++ /dev/null`) are skipped.
 */
export function parseStagedDiff(diff: string): StagedFile[] {
  const files: StagedFile[] = [];
  let current: StagedFile | null = null;
  let inHeader = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      current = null;
      continue;
    }
    if (inHeader) {
      if (line.startsWith('+++ ')) {
        const target = unquote(line.slice(4).replace(/\t$/, ''));
        current = target === '/dev/null' ? null : { path: target.replace(/^b\//, ''), addedLines: [] };
        if (current) files.push(current);
      } else if (line.startsWith('@@')) {
        inHeader = false;
      }
      continue;
    }
    if (current && line.startsWith('+')) current.addedLines.push(line.slice(1));
  }
  return files;
}

function unquote(path: string): string {
  return path.length >= 2 && path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

// Classic (ghp_), OAuth (gho_), user-to-server (ghu_), server-to-server (ghs_), refresh (ghr_)
// and fine-grained (github_pat_) tokens. The patterns are written so they do not match their own
// source text — this file passes through the hook too.
const TOKEN_PATTERNS = [/gh[pousr]_[A-Za-z0-9]{36}/, /github_pat_[A-Za-z0-9_]{40,}/];

// data/ is published on a public site: only encrypted files and the two PII-free indexes (SEC-6).
const PUBLIC_DATA_JSON = [/\.enc\.json$/, /^data\/version\.json$/, /^data\/seasons\/index\.json$/];

export function findViolations(files: StagedFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (/^data\/.*\.json$/.test(file.path) && !PUBLIC_DATA_JSON.some((re) => re.test(file.path))) {
      problems.push(
        `${file.path}: в data/ коммитятся только зашифрованные *.enc.json, version.json и seasons/index.json (SEC-6)`,
      );
    }
    if (file.addedLines.some((line) => TOKEN_PATTERNS.some((re) => re.test(line)))) {
      problems.push(`${file.path}: похоже на GitHub-токен — токены не коммитятся (SEC-2)`);
    }
  }
  return problems;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/unit/precommit.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the CLI, the hook and its installer**

`scripts/precommit-check.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { findViolations, parseStagedDiff } from './lib/precommit.ts';

const diff = execFileSync('git', ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const problems = findViolations(parseStagedDiff(diff));
if (problems.length > 0) {
  console.error(`pre-commit: коммит остановлен\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
```

`scripts/install-hooks.ts`:

```ts
import { execFileSync } from 'node:child_process';

// Runs on `npm install` / `npm ci` (the `prepare` script). Outside a git checkout
// (for example an unpacked tarball) there is nothing to install.
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  // not a git checkout
}
```

`.githooks/pre-commit`:

```sh
#!/bin/sh
# Blocks GitHub tokens and unencrypted data files (docs/DECISIONS.md, D-6).
exec node scripts/precommit-check.ts
```

Add to `package.json` → `scripts`:

```json
"prepare": "node scripts/install-hooks.ts"
```

Then install the hook and mark it executable in git (so it also runs on Linux/macOS clones):

```bash
npm run prepare
git config core.hooksPath
git add .githooks/pre-commit
git update-index --chmod=+x .githooks/pre-commit
```

Expected: `git config core.hooksPath` prints `.githooks`.

- [ ] **Step 6: Prove the hook blocks a token and a plain data file**

```bash
node -e "require('fs').writeFileSync('leak.txt', 'token=' + 'gh' + 'p_' + 'x'.repeat(36) + '\n')"
git add leak.txt
git commit -m "should be blocked"; echo "exit=$?"
git rm --cached -q leak.txt && rm leak.txt

mkdir -p data && echo '{}' > data/plain.json
git add data/plain.json
git commit -m "should be blocked"; echo "exit=$?"
git rm --cached -q data/plain.json && rm -r data
```

Expected both times: `pre-commit: коммит остановлен` with the matching message and `exit=1`; `git log --oneline` still shows only the Task 1 commit.

- [ ] **Step 7: Type-check, lint, test, commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all exit 0; 13 tests pass.

```bash
git add -A
git commit -m "Stage 0: pre-commit guard for tokens and unencrypted data (D-6, SEC-2, SEC-6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the commit succeeds (the hook ran and found nothing).

---

### Task 3: The empty isometric scene

**Files:**
- Create: `scripts/lib/site.ts`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/index.css`, `src/app/App.tsx`, `src/scene/cameraRig.ts`, `src/scene/defaults.ts`, `src/scene/MapScene.tsx`, `src/perf/FrameCounter.tsx`, `.claude/launch.json`
- Modify: `package.json` (add `dev`, `build`, `preview`)
- Test: `tests/unit/cameraRig.test.ts`

**Interfaces:**
- Consumes: `useHashRoute()` from Task 1.
- Produces: `BASE_PATH = '/sales-quest/'`; `type CameraAngles = { pitchDeg: number; yawDeg: number }`; `cameraPosition(angles: CameraAngles, distance: number, target?: readonly [number, number, number]): [number, number, number]`; `DEFAULT_CAMERA: CameraAngles`; `MapScene` component; `window.__sqFrames?: number` (frames drawn since load).

- [ ] **Step 1: Write the failing camera test**

`tests/unit/cameraRig.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cameraPosition } from '../../src/scene/cameraRig.ts';

function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 6));
}

describe('cameraPosition', () => {
  it('puts a 90° pitch straight above the target', () => {
    expectClose(cameraPosition({ pitchDeg: 90, yawDeg: 0 }, 10), [0, 10, 0]);
  });

  it('puts pitch 0, yaw 0 on the +Z axis', () => {
    expectClose(cameraPosition({ pitchDeg: 0, yawDeg: 0 }, 10), [0, 0, 10]);
  });

  it('gives the classic isometric-style view for pitch 45°, yaw 45° (GFX-1)', () => {
    expectClose(cameraPosition({ pitchDeg: 45, yawDeg: 45 }, 10), [5, Math.SQRT2 * 5, 5]);
  });

  it('keeps the distance and offsets by the target', () => {
    const [x, y, z] = cameraPosition({ pitchDeg: 30, yawDeg: 120 }, 7, [1, 2, 3]);
    expect(Math.hypot(x - 1, y - 2, z - 3)).toBeCloseTo(7, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/unit/cameraRig.test.ts`
Expected: FAIL — cannot resolve `../../src/scene/cameraRig.ts`.

- [ ] **Step 3: Implement the camera math and the default**

`src/scene/cameraRig.ts`:

```ts
export type CameraAngles = { pitchDeg: number; yawDeg: number };

/**
 * Where to put a camera that looks at `target` from `distance` away, `pitchDeg` above the
 * ground plane and turned `yawDeg` around the vertical axis (yaw 0 = camera on +Z).
 * For an orthographic camera the distance only has to keep the scene between the near
 * and far planes; the on-screen size comes from `zoom`.
 */
export function cameraPosition(
  angles: CameraAngles,
  distance: number,
  target: readonly [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const pitch = (angles.pitchDeg * Math.PI) / 180;
  const yaw = (angles.yawDeg * Math.PI) / 180;
  const horizontal = distance * Math.cos(pitch);
  return [
    target[0] + horizontal * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + horizontal * Math.cos(yaw),
  ];
}
```

`src/scene/defaults.ts`:

```ts
import type { CameraAngles } from './cameraRig.ts';

/** Until the season config exists (stage 1): the SPEC default `ui.camera` (GFX-1, §14). */
export const DEFAULT_CAMERA: CameraAngles = { pitchDeg: 45, yawDeg: 45 };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/cameraRig.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add Vite, the entry point and Tailwind**

`scripts/lib/site.ts`:

```ts
/** GitHub Pages serves the project site under the repository name (DEP-1). */
export const BASE_PATH = '/sales-quest/';
```

`vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BASE_PATH } from './scripts/lib/site.ts';

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
});
```

Add to `package.json` → `scripts`:

```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview"
```

`index.html` (the empty `data:,` icon stops the browser from requesting a missing favicon):

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>Sales Quest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import 'tailwindcss';

html,
body,
#root {
  height: 100%;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Add the frame counter, the scene and the app shell**

`src/perf/FrameCounter.tsx`:

```tsx
import { useFrame } from '@react-three/fiber';

declare global {
  interface Window {
    /** Frames drawn since page load; e2e tests check it stays flat while nothing changes. */
    __sqFrames?: number;
  }
}

function countFrame() {
  window.__sqFrames = (window.__sqFrames ?? 0) + 1;
}

/** With `frameloop="demand"` useFrame runs only for frames that are actually drawn. */
export function FrameCounter() {
  useFrame(countFrame);
  return null;
}
```

`src/scene/MapScene.tsx`:

```tsx
import { Canvas, type RootState } from '@react-three/fiber';
import { useMemo } from 'react';
import { FrameCounter } from '../perf/FrameCounter.tsx';
import { cameraPosition, type CameraAngles } from './cameraRig.ts';
import { DEFAULT_CAMERA } from './defaults.ts';

// Stage-0 placeholder, replaced by the real track and theme packs in stage 3:
// four location tiles (village, city, castle, port) and six team markers at the start.
const LOCATION_COLORS = ['#7cb342', '#90a4ae', '#8d6e63', '#4fc3f7'];
const TEAM_COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e44ad'];
const TILE = { width: 10, depth: 6, gap: 0.5 };
const CAMERA_DISTANCE = 60;
// World units visible across the window at load. Stage 0 fits once; stage 3 brings the real camera.
const CAMERA_FIT_WIDTH = 48;

function Placeholder({ yawDeg }: { yawDeg: number }) {
  const count = LOCATION_COLORS.length;
  const stripLength = count * TILE.width + (count - 1) * TILE.gap;
  const firstX = -stripLength / 2 + TILE.width / 2;
  return (
    // Turning the group by the camera yaw lays the strip along the screen: left → right.
    <group rotation={[0, (yawDeg * Math.PI) / 180, 0]}>
      {LOCATION_COLORS.map((color, i) => (
        <mesh key={color} position={[firstX + i * (TILE.width + TILE.gap), -0.2, 0]}>
          <boxGeometry args={[TILE.width, 0.4, TILE.depth]} />
          <meshLambertMaterial color={color} />
        </mesh>
      ))}
      {TEAM_COLORS.map((color, i) => (
        <mesh key={color} position={[firstX - TILE.width / 2 + 1, 0.4, -2.5 + i]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshLambertMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function lookAtOrigin(state: RootState) {
  state.camera.lookAt(0, 0, 0);
  state.invalidate();
}

export function MapScene({ angles = DEFAULT_CAMERA }: { angles?: CameraAngles }) {
  const camera = useMemo(
    () => ({
      position: cameraPosition(angles, CAMERA_DISTANCE),
      zoom: window.innerWidth / CAMERA_FIT_WIDTH,
      near: 0.1,
      far: 500,
    }),
    [angles],
  );
  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={1}
      gl={{ antialias: false, preserveDrawingBuffer: false }}
      camera={camera}
      onCreated={lookAtOrigin}
    >
      <FrameCounter />
      <color attach="background" args={['#dfe9f3']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 20, 5]} intensity={1.8} />
      <Placeholder yawDeg={angles.yawDeg} />
    </Canvas>
  );
}
```

`src/app/App.tsx`:

```tsx
import { MapScene } from '../scene/MapScene.tsx';
import { useHashRoute } from './useHashRoute.ts';

export function App() {
  const route = useHashRoute();
  if (route.path !== '/') return <NotFound />;
  return (
    <main className="relative h-full w-full">
      <MapScene />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-white/85 px-3 py-2 text-sm text-slate-800 shadow">
        Sales Quest · каркас (этап 0)
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-800">
      <p>Такой страницы нет.</p>
      <a className="text-blue-700 underline" href="#/">
        На карту
      </a>
    </main>
  );
}
```

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "sales-quest-dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 7: Type-check, lint, test, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all exit 0; 17 tests pass; `dist/index.html` references `/sales-quest/assets/...`.

- [ ] **Step 8: Look at it in the browser**

Start the `sales-quest-dev` preview, open `http://localhost:5173/sales-quest/`.
Expected: four coloured tiles running left → right across the screen at a 45° view, six small cubes at the left end, the “Sales Quest · каркас (этап 0)” badge top-left, no console errors (`read_console_messages`).
Then open `http://localhost:5173/sales-quest/#/nowhere` → “Такой страницы нет.” with a link “На карту” that returns to the scene.
Check `window.__sqFrames` twice two seconds apart (javascript_tool): the value must not change.
If the lighting is too dark or bright, adjust only the two `intensity` values. Take a screenshot for the author.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Stage 0: empty isometric scene with on-demand rendering (GFX-1, PERF-1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Initial-JS size budget (PERF-BUDGET, D-10)

**Files:**
- Create: `scripts/lib/size.ts`, `scripts/check-size.ts`
- Modify: `package.json` (add `size`)
- Test: `tests/unit/size.test.ts`

**Interfaces:**
- Consumes: `BASE_PATH` from Task 3.
- Produces: `INITIAL_JS_BUDGET_BYTES = 614400`; `collectInitialJs(html: string): string[]`; `toDistPath(url: string, basePath: string): string`; npm script `size`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/size.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collectInitialJs, toDistPath } from '../../scripts/lib/size.ts';

describe('collectInitialJs', () => {
  it('finds module scripts and modulepreload links in any attribute order', () => {
    const html = `
      <script type="module" crossorigin src="/sales-quest/assets/index-a1.js"></script>
      <link crossorigin href="/sales-quest/assets/vendor-b2.js" rel="modulepreload">
      <script src="/sales-quest/assets/late-c3.js" type="module"></script>`;
    expect(collectInitialJs(html)).toEqual([
      '/sales-quest/assets/index-a1.js',
      '/sales-quest/assets/vendor-b2.js',
      '/sales-quest/assets/late-c3.js',
    ]);
  });

  it('ignores stylesheets, classic scripts and duplicates', () => {
    const html = `
      <link rel="stylesheet" href="/sales-quest/assets/index.css">
      <script src="/sales-quest/legacy.js"></script>
      <script type="module" src="/sales-quest/assets/index-a1.js"></script>
      <link rel="modulepreload" href="/sales-quest/assets/index-a1.js">`;
    expect(collectInitialJs(html)).toEqual(['/sales-quest/assets/index-a1.js']);
  });
});

describe('toDistPath', () => {
  it('strips the site base', () => {
    expect(toDistPath('/sales-quest/assets/index-a1.js', '/sales-quest/')).toBe('assets/index-a1.js');
  });

  it('rejects a URL outside the base', () => {
    expect(() => toDistPath('/other/x.js', '/sales-quest/')).toThrow('outside the site base');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/unit/size.test.ts`
Expected: FAIL — cannot resolve `../../scripts/lib/size.ts`.

- [ ] **Step 3: Implement the pure part**

`scripts/lib/size.ts`:

```ts
/** JS the browser must load before the first render: ≤ 600 KB gzip (PERF-BUDGET). */
export const INITIAL_JS_BUDGET_BYTES = 600 * 1024;

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

/** URLs of `<script type="module" src>` and `<link rel="modulepreload" href>` in the built index.html. */
export function collectInitialJs(html: string): string[] {
  const urls: string[] = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const isModuleScript = tag.startsWith('<script') && attr(tag, 'type') === 'module';
    const isPreload = tag.startsWith('<link') && attr(tag, 'rel') === 'modulepreload';
    const url = isModuleScript ? attr(tag, 'src') : isPreload ? attr(tag, 'href') : undefined;
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

/** `/sales-quest/assets/x.js` → `assets/x.js` (its path inside dist/). */
export function toDistPath(url: string, basePath: string): string {
  if (!url.startsWith(basePath)) throw new Error(`${url} is outside the site base ${basePath}`);
  return url.slice(basePath.length);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/unit/size.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the CLI**

`scripts/check-size.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BASE_PATH } from './lib/site.ts';
import { INITIAL_JS_BUDGET_BYTES, collectInitialJs, toDistPath } from './lib/size.ts';

const DIST = 'dist';
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const files = collectInitialJs(html).map((url) => toDistPath(url, BASE_PATH));
if (files.length === 0) {
  console.error('size: no initial JS in dist/index.html — run `npm run build` first');
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const gz = gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
  total += gz;
  console.log(`${kb(gz).padStart(10)}  ${file}`);
}
console.log(`initial JS (gzip): ${kb(total)} of ${kb(INITIAL_JS_BUDGET_BYTES)}`);
if (total > INITIAL_JS_BUDGET_BYTES) {
  console.error('size: over the PERF-BUDGET limit for initial JS');
  process.exit(1);
}
```

Add to `package.json` → `scripts`:

```json
"size": "node scripts/check-size.ts"
```

- [ ] **Step 6: Run it on the real build**

Run: `npm run build && npm run size`
Expected: a list of JS files and `initial JS (gzip): … KB of 600.0 KB`, exit 0. Record the number (expected roughly 250–350 KB: React + three + R3F) — it goes into the stage report.

- [ ] **Step 7: Type-check, lint, test, commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all exit 0; 21 tests pass.

```bash
git add -A
git commit -m "Stage 0: initial JS size budget check (PERF-BUDGET, D-10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser smoke tests (Playwright)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (add `test:e2e`)

**Interfaces:**
- Consumes: `BASE_PATH` (Task 3), `window.__sqFrames` (Task 3), the “На карту” link (Task 3).

- [ ] **Step 1: Configure Playwright**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
import { BASE_PATH } from './scripts/lib/site.ts';

const PORT = 4173;
const url = `http://localhost:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  use: {
    baseURL: url,
    // The installed Chrome: no Playwright browser download. Software WebGL (SwiftShader) works
    // without a GPU and is a pessimistic stand-in for Intel HD graphics (D-7).
    channel: 'chrome',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

Add to `package.json` → `scripts`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 2: Write the smoke tests**

`tests/e2e/smoke.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

const framesDrawn = (page: Page) =>
  page.evaluate(() => (window as Window & { __sqFrames?: number }).__sqFrames ?? 0);

test('the map opens with a WebGL canvas and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('./');
  await expect(page).toHaveTitle('Sales Quest');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => framesDrawn(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('an idle scene draws no frames (PERF-1)', async ({ page }) => {
  await page.goto('./');
  await expect.poll(() => framesDrawn(page)).toBeGreaterThan(0);
  await page.waitForTimeout(500); // let the start-up frames (first render, resize) settle
  const before = await framesDrawn(page);
  await page.waitForTimeout(2000);
  expect(await framesDrawn(page)).toBe(before);
});

test('an unknown route offers the way back to the map', async ({ page }) => {
  await page.goto('./#/nowhere');
  await page.getByRole('link', { name: 'На карту' }).click();
  await expect(page.locator('canvas')).toBeVisible();
});
```

- [ ] **Step 3: Run them**

Run: `npm run test:e2e`
Expected: 3 passed.
If Playwright cannot load `playwright.config.ts` because of the `.ts` import, inline `const BASE_PATH = '/sales-quest/';` in the config with a comment pointing to `scripts/lib/site.ts`.
If the first test fails with a WebGL context error, the Chrome flags did not take: check `chrome://gpu`-style output via `page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))` in a scratch test and adjust `launchOptions.args` — do not weaken the assertions.

- [ ] **Step 4: Prove the idle test can fail**

Temporarily change `frameloop="demand"` to `frameloop="always"` in `src/scene/MapScene.tsx`, run `npm run test:e2e`.
Expected: `an idle scene draws no frames` FAILS (frames keep growing). Revert the change and re-run: 3 passed.

- [ ] **Step 5: Type-check, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: exit 0.

```bash
git add -A
git commit -m "Stage 0: Playwright smoke tests, idle scene draws no frames (PERF-1, D-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: CI and GitHub Pages deploy (DEP-1, DEP-2)

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `CLAUDE.md` (stage status)

**Interfaces:**
- Consumes: npm scripts `typecheck`, `lint`, `test`, `build`, `size`.
- Produces: https://konturproject.github.io/sales-quest/ serving `dist/`; stage 1 adds a `data/` copy step to the build.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# One deploy at a time; a newer push waits instead of cancelling the running one (DEP-2).
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # the data-only check below compares with the previous push

      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Detect a data-only push
        id: changes
        run: |
          before="${{ github.event.before }}"
          if [ -z "$before" ] || [ "$before" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$before" 2>/dev/null; then
            echo "code=true" >> "$GITHUB_OUTPUT"
          elif git diff --name-only "$before" "${{ github.sha }}" | grep -qv '^data/'; then
            echo "code=true" >> "$GITHUB_OUTPUT"
          else
            echo "code=false" >> "$GITHUB_OUTPUT"
          fi

      - run: npm run typecheck
      - run: npm run lint

      - name: Unit tests (skipped when only data/ changed)
        if: steps.changes.outputs.code == 'true'
        run: npm test

      - run: npm run build
      - run: npm run size

      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 2: Verify the workflow's commands pass locally, then commit**

Run: `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run size`
Expected: all exit 0 (this is exactly what CI runs).

```bash
git add -A
git commit -m "Stage 0: CI and GitHub Pages deploy workflow (DEP-1, DEP-2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: ⛔ Ask the author: create the public repository `KonturProject/sales-quest`?** On “yes”:

```bash
gh repo create KonturProject/sales-quest --public --source . --remote origin --description "Sales Quest — шагалка отдела продаж (3D, GitHub Pages)"
```

Expected: `✓ Created repository KonturProject/sales-quest`, `git remote -v` shows `origin`.

- [ ] **Step 4: ⛔ Ask the author: enable GitHub Pages (source: GitHub Actions) and push `main`?** On “yes”:

```bash
gh api -X POST repos/KonturProject/sales-quest/pages -f build_type=workflow
git push -u origin main
```

Expected: the API returns JSON with `"build_type": "workflow"`; the push succeeds.

- [ ] **Step 5: Wait for the run and check it**

```bash
gh run list --repo KonturProject/sales-quest --commit "$(git rev-parse HEAD)" --json databaseId,status --jq '.[0]'
```

If it prints nothing, the run has not been registered yet — repeat in a few seconds. Then, with the printed `databaseId`:

```bash
gh run watch <databaseId> --repo KonturProject/sales-quest --exit-status
```

Expected: both jobs (`build`, `deploy`) succeed. If `build` fails on Linux but passes locally, fix the cause (path case, line endings, missing file) in a new commit — ask before pushing it.

- [ ] **Step 6: Verify the live site**

```bash
curl -s "https://konturproject.github.io/sales-quest/?t=$(date +%s)" | grep -o '<title>[^<]*</title>'
```

Expected: `<title>Sales Quest</title>`. Then open https://konturproject.github.io/sales-quest/ in the browser pane: the same scene as in Task 3, no console errors, `window.__sqFrames` flat over two seconds. Screenshot for the author.

- [ ] **Step 7: Close the stage in the docs**

In `CLAUDE.md` change `Текущий этап: **0 — каркас**.` to:

```md
Текущий этап: **1 — движок и данные** (этап 0 принят <дата>: сайт на Pages, CI зелёный, начальный JS <N> КБ gzip).
```

(fill in the actual date and the size from Task 4 Step 6 — only after the author accepts stage 0).

```bash
git add CLAUDE.md
git commit -m "Docs: stage 0 accepted" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

⛔ Push only after the author says so.

---

## Stage 0 acceptance (SPEC §18 + agreed design)

- [ ] https://konturproject.github.io/sales-quest/ opens the empty isometric scene.
- [ ] The `Deploy` workflow run on `main` is green.
- [ ] Locally: `npm run typecheck`, `lint`, `test` (21 tests), `build`, `size` (≤ 600 KB gzip) and `test:e2e` (3 tests) all pass.
- [ ] The pre-commit hook blocks a token and a plain `data/*.json` (Task 2 Step 6).
