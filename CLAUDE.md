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
(QA-1), начальный JS 340 КБ gzip из 600. **Текущий этап — 3, сцена** (начат 08.10.2026, D-37…D-41):
план 3а (сцена на заглушках, HUD, QA-4), 3б (арты автора, герои KayKit, «жизнь» локаций) и 3б-2 (стол,
камера в покое по группам команд, объём на панелях, D-42…D-44) сделаны и опубликованы; идёт 3в
(сделаны: HUD в стиле фэнтези-RPG D-46, лестница качества D-45, 2D-схема D-47, мини-карта D-48; дальше
ТВ-режим, остатки 3б, QA-6) — план
`docs/superpowers/plans/2026-10-10-stage-3c-the-rest.md`. Отложенные задачи по этапам — `docs/BACKLOG.md`.

**Перед любым пунктом плана — `docs/NAVIGATOR.md`:** по теме там требования (ТЗ), решения, код, тесты,
команды и грабли.

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
- Ассеты — только CC0/CC-BY, с записью в `ASSETS_CREDITS.md`. Исходники — в `assets-src/` и `refs/` (вне git);
  в репозиторий идут только результаты `npm run assets` в `src/assets/` (D-41).
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
npm run test:perf  # замеры времени (ARCH-2: движок < 50 мс) — отдельно, без параллели и покрытия
npm run test:e2e   # Playwright (tests/e2e): установленный Chrome, программный WebGL
npm run size       # начальный JS ≤ 600 КБ gzip (после build)
npm run check:data # data/ по содержимому + правила хука по всем файлам (D-34)
npm run fetch-assets # исходники KayKit (герои, вещи, декор) в assets-src/ — скачивание, только после «да» (D-3)
npm run assets     # refs/board + assets-src → src/assets/ (панели, герои, вещи стола, декор, манифест; D-41…D-44)
npm run check:assets # бюджеты §12.1 по манифесту и файлам (CI)
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
  (код доступа, SEC-7). `src/debug/DebugPage.tsx` — `#/debug`, отдельный чанк (там же `QualitySection.tsx` —
  ступень качества и частота кадров последних ходов, «Сбросить качество»).
- `src/scene/` — сцена (этап 3, D-23, D-37, D-41): чистые модули `layout.ts` (панели в пропорциях артов,
  клетки, слоты), `themes.ts` (панели локаций: обведённые тропы, цвет дымки), `choreography.ts` (ходы → план
  пролётов и прыжков), `player.ts` (проигрывание плана), `cameraRig.ts` (позы камеры, обзор), `heroCatalog.ts`
  (герои и 10 вариантов — общий с конвейером), `heroes.ts` (слияние героя в одну скин-сетку, позы из плана,
  материал с цветом команды), `ambient.ts` (облака «жизни»), `restView.ts` (группы команд и кадр в покое),
  `table.ts` (стол, места вещей; вычитание прямоугольников), `decor.ts` (модели на панелях по артам),
  `scenery.ts` (статичные модели: расстановка, подкраска, слияние по текстуре), `props.ts` (вещи стола),
  `surfaces.ts` (дерево на холсте); компоненты `GameScene.tsx`, `Board.tsx`, `Figures.tsx`, `Ambient.tsx`,
  `Table.tsx`, `Scenery.tsx` (вещи стола и декор), `CameraRig.tsx`, `heroAssets.ts` (загрузка и риг
  героев), `assetUrls.ts`
  (`src/assets/*` по `?url`), `labels.ts` (текст в текстуру), `commands.ts` (кнопки HUD и мини-карта → камера), `viewWindow.ts` +
  `ViewWindow.tsx` (какую часть трека видит камера — для мини-карты);
  `runtime/` — тикер 30 FPS, режимы рендера (скрытая вкладка / фокус / бездействие), лестница качества (D-45),
  `RenderStats` (`window.__sqFrames`, `window.__sqStats` для тестов).
- `src/assets/` — оптимизированные ассеты и `manifest.json`: пишет только `npm run assets`, Prettier не трогает.
- `src/scheme/` — 2D-схема (GFX-6, D-47), ленивый чанк: `geometry.ts` (клетки сцены «змейкой», зум, шаги
  фишек), `Scheme.tsx`; выбор 3D/2D — `src/app/view.ts` (без WebGL 2 — схема, `?view=`, выбор зрителя).
- `src/hud/` — HUD поверх сцены: верхняя панель, карточки команд, сменяющийся рейтинг (`rating.ts`, D-38);
  мини-карта (D-48) — `minimap.ts`, `MiniMap.tsx`; стиль фэнтези-RPG (D-46) — `theme.css` (токены и классы `sq-*` в `@layer components`), рамки и фактура —
  `frames/*.svg` (нарисованы в коде), герб команды — `Crest.tsx`; тем же стилем — экран кода, загрузка, ошибки
  и таблички над героями (`src/scene/labels.ts`).
- `scripts/` — `check-size.ts`, `precommit-check.ts`, `install-hooks.ts`, `check-data.ts`, `seed-demo.ts`,
  `fetch-assets.ts`, `assets.ts`, `check-assets.ts`; чистые функции — в `scripts/lib/` (там же `dataPlugin.ts` —
  `data/` в dev-сервере и в сборке, `demo.ts`, `assets.ts` — источники, края панелей, бюджеты).
- `.github/workflows/deploy.yml` — CI и деплой на Pages (DEP-2).

## Проверка
После изменений: `npm run typecheck && npm run lint && npm test`. Для видимого — dev-сервер и браузер
(скриншот + состояние объектов). Для сцены — `npm run test:e2e` (в т.ч. перф-тест QA-4); панель
браузера в приложении рисует фоновую вкладку с редкими кадрами — анимацию проверять скриншотами Playwright.
Скорость (D-45) — приёмка на этом ПК с замедленным процессором, только перф-проект (bash):
```bash
npx playwright test --project=perf --no-deps                 # ×4 по ТЗ: ≥ 28 к/с
QA4_RATE=6 npx playwright test --project=perf --no-deps      # запас; так же QA4_RATE=8
```
Число QA-4 в CI — только динамика (программный WebGL на слабом раннере).
