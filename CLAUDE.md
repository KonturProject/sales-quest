# CLAUDE.md — Sales Quest

Шагалка отдела продаж: 6 команд (фигурка = руководитель группы) идут по треку через 4 локации
по реальным показателям из Excel. Игра длится заданный срок (по умолчанию 2 недели), длина трека
считается от числа рабочих дней (D-24). Статический SPA на GitHub Pages; общее состояние —
зашифрованные JSON в этом же репозитории.

## Источники правды
- `docs/SPEC.md` — ТЗ. Ссылайся на ID требований (FR-*, PERF-*, ...) в коммитах.
- `docs/DECISIONS.md` — отступления от ТЗ и уточнения (D-*, ADM-ROSTER-*, R-*). При расхождении с ТЗ действует он.
- `docs/OPEN_QUESTIONS.md` — незакрытые вопросы. Ответы не выдумывать: дефолт через конфиг + строка там.
- `docs/IMPORT_FORMATS.md` — разметка реальных выгрузок (воронка по дням, оплаченные счета). Реальные
  `.xlsx` лежат в корне только локально и в git не попадают.
- `docs/superpowers/plans/` — планы этапов.

## Этапы
Порядок 0 → 1 → 3 → 2 → 4 → 5 (D-1). Этап N+1 — только после критериев приёмки этапа N и «ок» автора.
Этап 0 принят 28.09.2026 (сайт на Pages, CI зелёный). Этап 1 — движок и данные — принят 08.10.2026:
демо-игра грузится с Pages и расшифровывается (`#/debug?k=sales-quest-demo`), движок покрыт тестами
(QA-1), начальный JS 340 КБ gzip из 600. Следующий по D-1 — **этап 3, сцена**: начинается после «ок»
автора. Отложенные задачи по этапам — `docs/BACKLOG.md`.

## Правила
- Игровые числа — только из SeasonConfig, без магических констант. Заглушки этапа 0 помечены как заглушки.
- `src/engine` (с этапа 1) — чистые функции без DOM/сети/`Date.now()`; даты — строки `YYYY-MM-DD`,
  «сейчас» передаётся параметром (D-11). Любое изменение — тесты.
- Целевое железо зрителей: i3 4–5 поколения, Intel HD, 6 ГБ ОЗУ. Бюджеты — SPEC §12. Рендер по требованию
  (`frameloop="demand"`), никаких бесконечных `requestAnimationFrame`. Постпроцессинг, реалтайм-тени
  статики, физика — запрещены по умолчанию. Админка работает только у координатора (i5 12-го поколения),
  бюджеты §12 к ней не применяются, но её код — отдельный lazy-чанк (D-7a).
- Не коммитить: токены, фразу доступа, исходные Excel/CSV, незашифрованные данные с ФИО.
  Pre-commit-хук (`.githooks/pre-commit`, D-6) ловит GitHub-токены, таблицы (xlsx/xls/xlsm/csv/ods)
  вне `tests/fixtures/` и JSON в `data/`, кроме `*.enc.json`, `version.json`, `seasons/index.json`.
  Фразу доступа и ФИО внутри других файлов он не распознаёт — за этим следить самим.
  `--no-verify` не использовать. Коммиты через GitHub API (админка, этап 2) хук не видит — см. `docs/BACKLOG.md`.
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
npm run test:engine  # тесты движка и схем с покрытием (src/engine ≥ 90 %, QA-1)
npm run test:e2e   # Playwright (tests/e2e): установленный Chrome, программный WebGL
npm run size       # начальный JS ≤ 600 КБ gzip (после build)
npm run check:data # data/ по содержимому + правила хука по всем файлам (D-34)
npm run seed-demo -- --phrase sales-quest-demo  # пересоздать демо-игру в data/ (D-32)
```

## Архитектура
- `src/data/schemas/` — zod-схемы и типы: `season.ts` (конфиг игры, состав с периодами в командах),
  `achievements.ts` (ачивки и их правила), `records.ts` (записи показателей, корректировки, журнал
  импорта), `common.ts`. `src/data/defaults/achievements.ts` — стартовый набор ачивок (D-27).
- `src/data/` — хранение и доставка (план 1в): `crypto` (AES-GCM + PBKDF2, браузер и Node), `files`
  (схемы файлов `data/`, отпечатки), `seal` (игра → тексты файлов), `storage` (`PagesSource`,
  `MemorySource`), `sync` (загрузка, опрос, офлайн-кэш), `cache` (localStorage), `time` (`localTimestamp`).
- `data/` — опубликованные данные: `version.json`, `seasons/index.json`, `seasons/<id>/*.enc.json`
  (D-33); сейчас там демо-игра. Пишется только скриптами/админкой, Prettier её не трогает.
- `src/engine/` — чистый движок (ARCH-3, D-11): `dates` → `calendar` → `track`, `roster`,
  `scoring` → `targets` → `plans` (цели, численность и линии темпа команд — один раз на игру) →
  `progress` (+ `adjustments`), `leaderboard`, `prepare`, `timeline`, `achievements/` (обработчик на
  каждый тип правила в `rules/`, `evaluateAchievements`), `gameState` (`computeGameState(input, now)`,
  `computeGameStateFrom(prepared, today)`). Перед правкой — скилл `.claude/skills/engine-rules`.
- `tests/support/builders.ts` — построители тестовых данных (двухнедельная игра по умолчанию).
- `src/app/` — `router.ts` (свой хэш-роутер, D-9), `useHashRoute.ts`, `App.tsx`, `viewer.ts`
  (одна на страницу связка «данные → движок → стор»), `store.ts` (D-31), `access.ts` и `AccessGate.tsx`
  (код доступа, SEC-7). `src/debug/DebugPage.tsx` — `#/debug`, отдельный чанк.
- `src/scene/` — `MapScene.tsx` (R3F, ортокамера, заглушка трека), `cameraRig.ts` (позиция камеры по pitch/yaw), `defaults.ts`.
- `src/perf/FrameCounter.tsx` — счётчик кадров `window.__sqFrames` для тестов «в покое кадров нет».
- `scripts/` — `check-size.ts`, `precommit-check.ts`, `install-hooks.ts`, `check-data.ts`, `seed-demo.ts`;
  чистые функции — в `scripts/lib/` (там же `dataPlugin.ts` — `data/` в dev-сервере и в сборке, `demo.ts`).
- `.github/workflows/deploy.yml` — CI и деплой на Pages (DEP-2).

## Проверка
После изменений: `npm run typecheck && npm run lint && npm test`. Для видимого — dev-сервер и браузер
(скриншот + состояние объектов). Для сцены — `npm run test:e2e`.
