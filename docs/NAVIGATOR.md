# Навигатор: куда смотреть

Инструкция для Claude (и для любого, кто продолжит работу). Перед пунктом плана найдите его тему ниже и
пройдите по строкам сверху вниз: **ТЗ** (что требуется) → **решения** (они главнее ТЗ) → **код** → **тесты**
→ **команды** → **грабли**. Номера в плане (D-*, FR-*, PERF-*…) ищите поиском по `docs/SPEC.md` и
`docs/DECISIONS.md`. Открытые вопросы — `docs/OPEN_QUESTIONS.md`, отложенное — `docs/BACKLOG.md`.

## 0. Всегда

- **Процесс:** этап за этапом (D-1); в этапе — план в `docs/superpowers/plans/`, код в сессии, затем
  независимое ревью субагентом, исправления, короткий отчёт автору по-русски. Решения, меняющие игру, —
  сразу в DECISIONS / OPEN_QUESTIONS; отложенное — в BACKLOG.
- **Наружу — только после явного «да» автора (D-3):** push, деплой, настройки GitHub, скачивание ассетов.
  Локальные коммиты внутри этапа одобрены. «Да» на один пуш не переносится на следующий.
- **Приватное:** `*.xlsx` в корне (реальные ФИО, клиенты, суммы), `refs/` (арты автора), `assets-src/`
  (исходники паков) — не коммитить; субагентам не открывать `refs/` и `*.xlsx`. В публичный репозиторий —
  ни имён, ни объёмов отдела; реальная фраза доступа — никогда (демо-фраза публична, D-32). Образец новой
  выгрузки от автора (например, в «Загрузках») смотреть только скриптом, печатающим устройство без имён и чисел,
  или `npm run check-exports`; в репозиторий — только синтетическая фикстура.
- **Проверки после изменений:** `npm run typecheck && npm run lint && npm test`; для сцены — `npm run
  test:e2e`; скорость — раздел «Проверка» в CLAUDE.md (D-45). Коммит — только если `npm run lint` вышел с 0.

## 1. Движок: баллы, трек, темп, ачивки, лидерборд

- **ТЗ:** §5 (FR-SCORE, FR-TRACK, FR-PACE), §6 (ACH-*), §7 (FR-LB), §14 (модели).
- **Решения:** D-11 (даты строками, «сейчас» параметром), D-13…D-18, D-24 (сезон и длина трека), D-25,
  D-26 (своя линия темпа), D-27…D-30 (ачивки), R-1…R-5 (состав), D-54 (отпуск: `isOnVacation` в
  `roster.ts` — дни отпуска вне рабочих дней оператора; `onVacation` в рейтинге).
- **Код:** `src/engine/` — `dates` → `calendar` → `track`, `roster`, `scoring` → `targets` → `plans` →
  `progress` (+ `adjustments`), `leaderboard`, `prepare`, `timeline`, `achievements/`, `gameState`.
  Схемы — `src/data/schemas/`.
- **Тесты:** `tests/unit/engine/**`, `tests/unit/schemas/**`, `tests/perf/engine.test.ts` (ARCH-2),
  построители — `tests/support/builders.ts`.
- **Команды:** `npm run test:engine` (покрытие ≥ 90 %), `npm run test:perf` (отдельно, без параллели).
- **Грабли:** перед правкой — скилл `.claude/skills/engine-rules`; никаких `Date.now()` и DOM в движке;
  любое изменение — тест.

## 2. Данные и доставка: шифрование, синхронизация, демо

- **ТЗ:** §13.5–13.7 (SEC, SYNC), §15 (DEP).
- **Решения:** D-12 (шифрование), D-31 (стор), D-32 (демо, публичная фраза), D-33 (файлы данных), D-34
  (проверка данных в CI), D-35 (состояние на дату), D-36 (код доступа).
- **Код:** `src/data/` (`crypto`, `files`, `seal`, `storage`, `sync`, `cache`, `time`), `src/app/viewer.ts`,
  `src/app/store.ts`, `src/app/access.ts`, `AccessGate.tsx`; демо — `scripts/lib/demo.ts`, `scripts/seed-demo.ts`;
  опубликованное — `data/`.
- **Тесты:** `tests/unit/data/**`, `tests/unit/demo.test.ts`, `tests/unit/viewer.test.ts`, `tests/e2e/data.spec.ts`.
- **Команды:** `npm run seed-demo -- --phrase sales-quest-demo`, `npm run check:data`.
- **Грабли:** `data/` пишут только скрипты (Prettier её не трогает); pre-commit-хук ловит JSON в `data/`
  кроме `*.enc.json`, `version.json`, `seasons/index.json`.

## 3. Импорт выгрузок и админка (этап 2)

- **ТЗ:** §8 (админ-панель), §9 (импорт), §13.5.
- **Решения:** D-7a (админка — отдельный lazy-чанк, бюджеты §12 к ней не применяются), D-19…D-22 (формы и
  метрики выгрузок), ADM-ROSTER-*, D-52…D-55 (состав, корректировки, отпуск, промежуточные итоги).
- **Разметка выгрузок:** `docs/IMPORT_FORMATS.md` (сами `.xlsx` — только локально, приватно: не открывать
  субагентам, имена и объёмы не переносить в репозиторий).
- **Решение этапа:** D-51 (запуск настоящей игры: профили, демо в фикстурах, фраза, публичные подписи).
- **Импорт (`src/import/`):** `grid.ts` (ячейки, даты Excel, `ImportError`), `profiles.ts` (профили трёх
  выгрузок, схема — `src/data/schemas/importProfiles.ts`), `funnel.ts` / `payments.ts` / `intraday.ts` (разбор),
  `detect.ts` (какой профиль: воронка по листу, оплаты по шапке, промежуточные итоги по группе с кодом), `xlsx.ts` (SheetJS → сетка), `parse.worker.ts` + `parseFile.ts` (разбор в воркере, SHA-256 —
  `hash.ts`), `match.ts` (кто есть кто в составе), `apply.ts` (`applyImport`: только свои метрики, полный
  период, журнал).
- **Промежуточные итоги (D-55):** `src/import/intraday.ts` (`parseIntraday`, `looksLikeList`, `onDay`),
  профиль `DEFAULT_INTRADAY` и `profilesFor` в `src/import/profiles.ts`, поле «День» в
  `src/admin/ImportFlow.tsx`; тесты `tests/unit/import/intraday.test.ts`, e2e «Промежуточные итоги» в
  `admin.spec.ts`; фикстура `tests/fixtures/import/intraday.xlsx`. **Грабли:** новый вид профиля не писать в
  конфиг идущей игры — старый код открытых экранов не прочтёт незнакомый `kind`; ошибки разбора называют строку и
  столбец, а не человека и не число (`check-exports` их печатает).
- **Админка (`src/admin/`, ленивый чанк `#/admin`):** `github.ts` (`HttpGitHubRepo`: Git Data API,
  `ConflictError`, `AuthError`), `token.ts`, `pipeline.ts` (`loadRepoState`, `previewChange`, `commitChange`,
  `launchChange`), `importStep.ts`, `newGame.ts` + `words.ts` (мастер «Новая игра», фраза), `publishing.ts`;
  экраны — `AdminPage`, `Login`, `Home`, `ImportFlow`, `Resolve`, `PreviewTable`, `NewGame`, `Publishing`.
- **Состав и команды (2б-1, D-52):** `roster.ts` (`applyRosterEdits`: правки как значения, проблемы и
  предупреждения словами, строки для экрана, `rosterCommitMessage`, `similarColors`), `rosterStep.ts`
  (`prepareRoster`, `gameDay`, `withEdit`, `withoutEdit`), экраны `Roster.tsx`, `RosterForms.tsx`,
  `RosterDraft.tsx`, `teamOptions.ts` (герои и цвета — общие с мастером); тесты
  `tests/unit/admin/roster*.test.ts`, e2e «Состав и команды» и «данные изменились» в `admin.spec.ts`.
- **Отпуск (D-54):** правки `vacation` / `unvacation` в `roster.ts`, форма `VacationForm` в
  `RosterForms.tsx`, отпуска в строке оператора (`Roster.tsx`), пометка «в отпуске» — `src/hud/rating.ts`
  (`away`) и `Hud.tsx`; тесты `tests/unit/engine/vacations.test.ts`, `tests/unit/admin/roster.test.ts`,
  `tests/unit/hud.test.ts`, e2e «Отпуск» в `admin.spec.ts`.
- **Финал (D-59):** `src/admin/finale.ts` (`canClose`, `closeGame`, `reopenGame`, `finaleMessage`),
  `FinaleAdmin.tsx` (одна строка в `BatchDraft`, пьедестал и топ-3 для проверки), кнопки на `Home.tsx`; поле
  `closedAt` в `src/data/schemas/season.ts`; тесты `tests/unit/admin/finale.test.ts`, e2e «Подвести итоги» в
  `admin.spec.ts`. Предпросмотр «Посмотреть финал» (D-60) — `previewFinale` в `finale.ts` (закрытие только в
  памяти), экран `FinalePreview.tsx` поверх админки (`FinaleLayer` с `preview`; `publishMoving(false)` — карты здесь
  нет, а часы церемонии ждут, пока фигурки стоят); e2e «Посмотреть финал» в `admin.spec.ts` (ни коммита, ни
  `sq.finale.v1`).
- **Корректировки (2б-2, D-53):** `corrections.ts` (`applyCorrections`: шаги без долга, показатели за день
  баллами, на старт; `parseCount`, `stepsHint`, `metricText`, `metricDay`, `correctionsCommitMessage`,
  `prepareCorrections`), экраны `Corrections.tsx`, `CorrectionForms.tsx`; общие с составом — `BatchDraft.tsx`
  (черновик пачки, превью, запись, «данные изменились») и `FormParts.tsx`; тесты
  `tests/unit/admin/corrections.test.ts`, e2e «Корректировки» и «данные изменились while correcting» (часы
  закреплены `page.clock`). Подсказки на пергаменте — цветом пергамента (`sq-dim` там не читается).
- **Что меняет выгрузка и правки в превью (2б-3, D-61):** чистые `importDiff.ts` (`importChanges` — по оператору
  «было → по выгрузке» и ручной счёт через `manualCount`; `doubleCounts` — двойной счёт по чистому ручному счёту),
  `prepareImport` в `importStep.ts` берёт `{ fixes, cancels }` (`applyCorrections`, `revokeAdjustments` из
  `corrections.ts`) и отдаёт `changes`, `doubles`, `problems`, `lines`; экран — `ImportChanges.tsx` в `ImportFlow.tsx`
  (шаг пересчитывается на том же чтении при каждой правке). Тесты `tests/unit/admin/importDiff.test.ts`,
  `importStep.test.ts`, `corrections.test.ts`; e2e «2b-3» в `admin.spec.ts` (воронка разбирается в Node —
  `parseWorkbook`).
- **Журнал и отмена корректировки (2б-3, D-62):** `history` в `github.ts` (`CommitInfo`, страницы по 100),
  `loadRepoState(…, at)` — игра на любом коммите; чистый `journal.ts` (`journalOf`, `kindOf`, `entryDetails`,
  `pastDoubles`, `commitOf`, `prepareCancels`, `whoAndDay`); экран `Journal.tsx` (кэш версий на визит, отмены —
  `BatchDraft` с именем `cancels`), таблица — общая `ChangesTable.tsx`. Тесты `tests/unit/admin/journal.test.ts`,
  `github.test.ts`, `pipeline.test.ts`; e2e «Журнал», «past double count», «a history GitHub does not give» в
  `admin.spec.ts` (`journalDemo`; у фейка GitHub — `clock`, `history`, `failHistory`).
- **Тесты:** `tests/unit/import/*`, `tests/unit/admin/*`, `tests/e2e/admin.spec.ts` (QA-3: GitHub подменён в
  браузере — `tests/support/fakeGitHub.ts`, ключ — тестовое значение `test-token`); сетки — `tests/support/grids.ts`;
  синтетические xlsx — `tests/fixtures/import/` (`npm run make-fixtures`, имена — из демо).
- **Настоящие выгрузки:** `npm run check-exports -- <файлы>` — локально, печатает только счётчики.
- **Отложенное:** BACKLOG, раздел «Этап 2».

## 4. Доска: панели-арты, тропы, клетки, раскладка

- **ТЗ:** §5.3 (FR-TRACK), §11.1–11.2 (GFX-2, GFX-LOC).
- **Решения:** D-23, D-24 (клеток на день — OQ-18: 3), D-37, D-41 (арты 11:6, дымка по краям), D-42
  («лента» и «змейка» в запасе).
- **Код:** `src/scene/themes.ts` (обведённые тропы `u,v`, `PANEL_ASPECT`, цвет дымки), `layout.ts`
  (`panelPlacement`, `BOARD_ARRANGEMENT`, клетки, слоты, `cellStack`), `Board.tsx` (панели, клетки, простые
  ворота-запас), ворота из пака — `gates.ts` и `Gates` в `Scenery.tsx` (D-50).
  Арт: `refs/board/*` (приватно) → `npm run assets board` → `src/assets/board/*.webp`; выбор варианта —
  `BOARD_SOURCES` в `scripts/lib/assets.ts`.
- **Тесты:** `tests/unit/scene/layout.test.ts`.
- **Грабли:** арт другой формы конвейер отвергает (нужно 11:6); тропу обводить по сетке поверх арта
  (точки `u,v`, линия Катмулла-Рома, проверять наложением) — как в плане 3б; включить «змейку» — одна
  константа, но проверить переход между рядами и рамку стола.

## 5. Объём на панелях (декор локаций)

- **Решения:** D-44.
- **Код:** `src/scene/decor.ts` (места `u,v` по артам, масштаб, подкраска), `scenery.ts` (`bakeScenery`:
  расстановка, подкраска, слияние по текстуре), `Scenery.tsx` (`Decor`). Файл — `src/assets/decor/decor.glb`.
- **Тесты:** `tests/unit/scene/decor.test.ts` (≥ 1 ед. от тропы, ≤ 15 000 треугольников на локацию).
- **Добавить модель:** путь в `MODEL_SOURCES` (`scripts/lib/assets.ts`) → `npm run fetch-assets` (если пак
  новый — сначала «да» автора) → место в `DECOR` → `npm run assets models` → тесты.

## 6. Стол и вещи на нём

- **Решения:** D-43.
- **Код:** `src/scene/table.ts` (`tablePlan`, `rectMinus`, `panelRows`, `PROPS`, `propSpot`), `Table.tsx`
  (рамки с дырами, стенки без крышек), `surfaces.ts` (дерево на холсте), `props.ts` + `Scenery.tsx` (`Props`).
- **Тесты:** `tests/unit/scene/table.test.ts`.
- **Грабли:** большая поверхность под другой — двойная закраска, в программном WebGL это −8 к/с: делать
  дыру (`rectMinus`); перед доской — только плоские вещи.

## 7. Герои

- **ТЗ:** §11.3 (GFX-CHAR-1…4).
- **Решения:** D-41 (KayKit, 10 вариантов, ≤ 3 000 треугольников, одна скин-сетка, цвет на плаще, позы из
  плана хода).
- **Код:** `src/scene/heroCatalog.ts` (общий с конвейером), `heroes.ts` (`mergeHero`, `heroAction` — в т.ч.
  прыжок на месте в такте баллов, D-57, `heroYaw`, `settleYaw` — поворот к зрителю за 0,3 с, `heroMaterial`), `heroAssets.ts` (загрузка, риг, `poseRig`), `Figures.tsx`.
- **Тесты:** `tests/unit/scene/heroes.test.ts`.
- **Грабли:** при обрезке клипов удалять и их сэмплеры (иначе файл ×6); удалять узлы, а не общие сетки.

## 8. Ходы и хореография

- **ТЗ:** §5.5 (FR-MOVE-1…4).
- **Решения:** D-23, D-40 («+N шагов», ходы на 30 к/с), D-41 (прыжок, бег, радость после ворот), D-56
  (FR-MOVE-4 изменено: страница после перерыва проигрывает шаги с запомненных клеток), D-57 (такты баллов, салюты).
- **Код:** `src/scene/choreography.ts` (`planMoves`, `TIMING`), `player.ts` (`ScenePlayer`), `Figures.tsx`.
- **Тесты:** `tests/unit/scene/choreography.test.ts`, `player.test.ts`; e2e «a new day plays the moves».
- **Ходы с моментами (D-57):** такты в `planMoves` (прыжок `jumps`, считающая всплывашка `count`, салюты
  `bursts`), `jumpAt`, `burstsAt`, `BURST_MS`; правила обгона и лидера — `trackMoves` (`src/moments/events.ts`);
  искры — `src/scene/fireworks.ts` (чистые) и `Fireworks.tsx`; живая табличка — `counterLabel` (`labels.ts`);
  схема — `.sq-jump`, `.sq-spark` (`theme.css`), `sparkOffsets`; «фигурки идут» — `src/scene/moving.ts`
  (+ проба `window.__sqMoving`); тесты `tests/unit/scene/choreography.test.ts`, `fireworks.test.ts`, e2e
  «a daytime portion without steps» в `moments.spec.ts`, «QA-4 with moments» в `perf.spec.ts`.
- **Грабли:** позиции сравниваются вместе с баллами (`samePositions`) — дневная порция без шагов тоже даёт тур;
  план длится, пока жив последний салют (`duration`), иначе искры зависают после тура; тур шести команд —
  20–30 с: e2e ждут его конца по состоянию, а не фиксированным окном; салюты — обычная прозрачность с альфой и
  каймой (аддитивные терялись на облаках и льду), проверять скриншотом в момент салюта.

## 9. Камера: обзор, полёты, покой

- **ТЗ:** GFX-3, FR-MOVE-3.
- **Решения:** D-23 (перспектива), D-40 (пределы, сдвиг вдоль ленты), D-42 (покой = группа команд, смена
  раз в минуту, пауза после зрителя).
- **Код:** `src/scene/cameraRig.ts` (`overviewPose` — честная проекция под любым углом), `CameraRig.tsx`,
  `restView.ts` (`teamGroups`, `groupBounds`, `positionsKey`, `cycleStep`, `restCycle` — группы раз в минуту
  или на ТВ команды по очереди раз в 20 с, D-49), цикл — `GameScene.tsx`,
  кнопки и мини-карта — `commands.ts` (`'overview' | 'leader' | { team }`).
- **Тесты:** `tests/unit/scene/player.test.ts`, `restView.test.ts`; e2e «a resize keeps the camera».
- **Грабли:** эффекты дочернего компонента идут раньше родительского — пролёт сцены уступает ходам
  (`ScenePlayer.load`); пролёт туда, где камера уже стоит, не запускать (кадры зря).

## 10. Рендер и производительность

- **ТЗ:** §12 (PERF-1…12, бюджеты, уровни качества), §17 (QA-4).
- **Решения:** D-7, D-7a, D-8, D-39, D-40, D-45 (приёмка скорости и лестница качества).
- **Код:** `src/scene/runtime/` (`ticker.ts` — 30 к/с по расписанию, `policy.ts` — режимы, `quality.ts` —
  лестница качества 0…7 (D-45: ступени, губернатор окон, хранение на неделю, журнал окон для `#/debug`), `useRenderMode.ts`, `RenderStats.tsx` — `window.__sqFrames`, `__sqStats`); проба хода —
  `window.__sqMoving` (`src/scene/moving.ts`).
- **Тесты:** `tests/unit/scene/runtime.test.ts`; e2e `smoke.spec.ts`, `scene.spec.ts`, `perf.spec.ts` (QA-4 и
  «QA-4 with moments» — живая порция с моментами; проверяет, что мерил ход, `walking: true`),
  скриншоты `visual.spec.ts` (QA-6; эталоны — `visual.spec.ts-snapshots/*-win32.png`, обновить:
  `npx playwright test visual --update-snapshots` и посмотреть картинки до коммита).
- **Команды:** раздел «Проверка» в CLAUDE.md (`QA4_RATE=4/6/8`).
- **ТВ-режим (D-49):** `?mode=tv` → `isTv` (`src/app/view.ts`) → `GameScene tv` (правила рендера, цикл
  покоя), HUD без кнопок, `useIdleCursor` (указатель прячется), на нижней ступени — схема сама.
- **Грабли:** «покой» в e2e судить после всех 11 файлов сцены, скачанных **и применённых**
  (`window.__sqLoading` = 0, `src/scene/runtime/loading.ts`): каждый рисует кадр, а раннер CI разбирает
  героев секундами позже их прихода; новый загрузчик сцены — через `beginLoad()`; и покой — это «кадры не
  растут **и ни один не ждёт**» (`window.__sqPending()` — счётчик R3F запрошенных кадров): на раннере CI
  запрошенный кадр может ждать процессор секунды; обычные e2e не проверяют частоту кадров (D-39); число QA-4 из CI — только динамика (D-45);
  панель браузера в приложении — фоновая вкладка с редкими кадрами, анимацию снимать Playwright'ом;
  `BoxGeometry` с массивом материалов — 6 вызовов отрисовки; анизотропия и прозрачность дороги в
  программном WebGL. При ×8 кадр стоит на грани двух обновлений экрана: замер скачет между ~27 и ~30
  к/с при одних и тех же условиях (D-46) — сравнивать версии, чередуя их (`git stash` / `git stash pop`), по
  2–4 прогона на каждую; причину искать трассой Chrome (CDP `Tracing`) и временем процессов
  (`SystemInfo.getProcessInfo`), а не по одному числу. Сравнивать парным прогоном (оба теста перф-проекта
  подряд): тест, запущенный один (`-g`), идёт первым на холодном браузере и читает на 2–4 к/с меньше. Чтобы
  найти, что стоит кадров, — выключить подозреваемое на время одного прогона (D-56: моменты HUD во время хода
  стоили 4–5 к/с, лечилось ожиданием конца хода).

## 11. HUD: верхняя панель, карточки команд, рейтинг, стиль

- **ТЗ:** GFX-5, FR-PACE-3, FR-LB-3.
- **Решения:** D-38 (рейтинг каждые 15 с: команды по очереди, затем топ-10), D-46 (стиль фэнтези-RPG по
  референсу Divinity: тёмные панели, бронзовые рамки, пергамент, гербы; системный шрифт; рамки — SVG в коде),
  D-48 (обновлять HUD после ходов), D-56 (моменты на панелях), D-58 (ачивки всегда на виду: значки у имени,
  строка команды, «Доска почёта»).
- **Код:** `src/hud/Hud.tsx`, `rating.ts`, `src/text.ts` (склонения); мини-карта (D-48) — `minimap.ts`
  (полосы, маркеры, доли трека), `MiniMap.tsx`, окно камеры — `src/scene/viewWindow.ts` и `ViewWindow.tsx`;
  стиль — `src/hud/theme.css` (токены и
  классы `sq-*`), `src/hud/frames/*.svg`, `Crest.tsx`; тот же стиль — `AccessGate.tsx`, экраны в `App.tsx`,
  `ErrorBoundary.tsx`, таблички в сцене — `src/scene/labels.ts`.
- **Тесты:** `tests/unit/hud.test.ts`, `minimap.test.ts`, `scene/viewWindow.test.ts`; e2e находят кнопки и поля по ролям и подписям — не менять их тексты.
- **Моменты (D-56):** `src/moments/` (`snapshot.ts` — снимок показанного без имён, `events.ts` — события
  «было → стало», `seen.ts` — память браузера `sq.seen.v1`, `heroes.ts` — «Герои дня», `tracker.ts` — порции
  «since» / «live»), в зрителе — `moments`, `heroes` (`src/app/viewer.ts`); HUD — `src/hud/cards.ts` («до шага»,
  отсчёт), `clock.ts` (`RunClocks`, `useRunClock`: одни часы на порцию вне компонентов — перемонтаж не
  проигрывает порцию снова; тикают 10 раз в секунду, только при видимой вкладке и пока фигурки стоят),
  `moments.ts` (что и когда показать, `showPhase` — перерисовка только на границах показа), `Moments.tsx`
  (надпись, тосты, баннеры), слайд «Герои дня» в `rating.ts`; проигрывание с запомненных клеток —
  `ScenePlayer.load(…, from)`, `firstMoves` (`src/scheme/geometry.ts`); «фигурки идут» — `src/scene/moving.ts`
  (моменты ждут конца хода, D-48); QA-4 с моментами — второй тест `tests/e2e/perf.spec.ts`. Тесты `tests/unit/moments/*`,
  `tests/unit/hudMoments.test.ts`, e2e `tests/e2e/moments.spec.ts` (снимок кладётся в хранилище через
  `addInitScript`, время — `page.clock.setFixedTime`).
- **Финал (D-59, D-60):** чистые `src/finale/results.ts` (`podiumOf`, `podiumColumns` — ступени с ничьими рядом,
  `bestInTeams` — группа и руководитель отдельно, `topOperators`, `significantOf`, `departmentTotals`,
  `manualCount`, `finaleOf`), `ceremony.ts` (`STEPS`, `phaseAt`, `CEREMONY_MS`), `seen.ts`
  (`sq.finale.v1`); показ — `src/hud/Finale.tsx` (`FinaleLayer`: церемония на `useRunClock`, итоговый экран; `preview`
  — для админки: без памяти, салютов и камеры),
  включается в `Hud.tsx` пропом `finale` из `App.tsx` (только живой просмотр); салюты — `requestCelebration`
  (`src/scene/commands.ts`) → `ScenePlayer.celebrate` и `useCelebration` схемы; ступени пьедестала — `.sq-step-*`.
  Тесты `tests/unit/finale/*`, `tests/unit/scene/player.test.ts`; e2e `tests/e2e/finale.spec.ts` (закрытое демо —
  `tests/support/closedDemo.ts`: `commitDemo` через настоящий `commitChange` и `serveSiteData`; минута церемонии —
  `page.clock.install` + `runFor`, не `fastForward`), эталон `finale` в `visual.spec.ts`.
- **Ачивки на виду (D-58):** `src/hud/badges.ts` (чистые: `managerBadges`, `teamBadges`, `badgeLine`, `honorBoard`,
  `honorPages`, `holdersParts`; свежие — `freshOf`, `unlockId`, `Glints`), `src/hud/Badges.tsx` (`Gems`, `TeamLine`,
  `HonorView`), слайд `honor` в `rating.ts`, `useRunOver` в `clock.ts` (часы показа читаются, не запускаются),
  `.sq-badge` в `theme.css`; `shortName` — в `src/text.ts`. Тесты `tests/unit/hudBadges.test.ts`, `hud.test.ts`;
  e2e — `data-held` у рейтинга в `moments.spec.ts`, эталон `honor` в `visual.spec.ts` (слайды листает
  `page.clock.install` + `fastForward`).
- **Грабли:** то, что HUD обновляет во время ходов, стоит кадров (D-48) — обновлять по окончании; новый
  элемент HUD — из классов `sq-*`, а не своими цветами; без `backdrop-filter` и размытых
  теней (D-46); `theme.css` — обычный CSS в `@layer components`: вне слоя он перебил бы утилиты Tailwind. HUD не импортирует из
  `src/scheme` (ленивый чанк) — общее кладём в `src/text.ts`. Подписи списков и областей HUD не должны содержать
  чужую подпись: Playwright ищет имя по подстроке (D-58: «Ачивки команды» совпало со списком «Команды»).

## 12. «Жизнь» локаций

- **Решения:** D-41 (облако точек на панель, время только на нарисованных кадрах), D-45 (выключается на
  слабой машине).
- **Код:** `src/scene/ambient.ts`, `Ambient.tsx`. **Тесты:** `tests/unit/assets.test.ts` (облака).

## 13. Конвейер ассетов

- **ТЗ:** §11.4–11.5 (GFX-SRC, GFX-PIPE).
- **Решения:** D-41, D-43, D-44.
- **Код:** `scripts/fetch-assets.ts` (паки KayKit на закреплённых коммитах), `scripts/assets.ts` (`board`,
  `heroes`, `models`), `scripts/lib/assets.ts` (`PACKS`, `MODEL_SOURCES`, края панелей, бюджеты, лицензии),
  `scripts/check-assets.ts`; результат — `src/assets/` + `manifest.json`; авторы — `ASSETS_CREDITS.md`.
- **Команды:** `npm run fetch-assets` (скачивание — после «да»), `npm run assets [board|heroes|models]`,
  `npm run check:assets`.
- **Грабли:** лицензии — строгий список (CC0-1.0, CC-BY-x.y, собственный арт); файл в `src/assets/` без
  записи в манифесте — ошибка проверки.

## 14. CI и деплой

- **ТЗ:** §15 (DEP-1…6).
- **Решения:** D-2, D-8, D-8a, D-10, D-39.
- **Код:** `.github/workflows/deploy.yml` (сборка и unit — держат деплой; e2e с QA-4 — нет).
- **Команды:** `gh run list`, `gh run view <id> --log-failed`; QA-4 из лога: строки `QA-4 {...}` и `QA-4 moments
  {...}`.
- **Грабли:** перф-проект зависит от e2e: упал любой e2e — QA-4 в CI не запускается вовсе; красный e2e-джоб в CI —
  смотреть `--log-failed`, не только число QA-4 (слабый раннер: ~10–12 к/с — норма, D-45).

## 15а. 2D-схема

- **ТЗ:** GFX-6, §19.2 R-4. **Решения:** D-47 (вид, ходы, когда), D-45 (предложение на нижней ступени), D-57
  (прыжок фишки и искры — CSS-анимации один раз).
- **Код:** `src/scheme/geometry.ts` (раскладка «змейкой», складывание клеток сверх плана, `zoomOn`,
  `tokenCell`, `shortName`), `Scheme.tsx` (ленивый чанк), выбор вида — `src/app/view.ts` и `MapPage` в
  `App.tsx`, предложение и «Объёмная карта» — `src/hud/Hud.tsx`.
- **Тесты:** `tests/unit/scheme/geometry.test.ts`, `tests/unit/view.test.ts`, e2e `tests/e2e/scheme.spec.ts`
  (`?view=2d`, без WebGL — подмена `getContext`, предложение на ступени 7, ходы клетка за клеткой).
- **Грабли:** выбор из ссылки (`?view=`) — в состояние, когда параметр появляется (не на каждом рендере:
  иначе кнопка зрителя при `?view=` в ссылке ничего не делает, ревью 3в), и не только в хранилище (иначе без
  параметра страница возвращается к 3D); ходы схемы — `nextMoves` / `firstMoves` (позиции сравниваются вместе с
  баллами; новый трек — без ходов); фишка со всплывашкой рисуется последней, ширина пергамента — по тексту.

## 15. Маршруты, доступ, отладка

- **Решения:** D-9 (свой хэш-роутер), D-36 (код доступа).
- **Код:** `src/app/router.ts`, `useHashRoute.ts`, `App.tsx`, `AccessGate.tsx`, `src/debug/DebugPage.tsx`
  (`#/debug`; `QualitySection.tsx` — ступень качества, окна ходов, «Сбросить качество»), параметр карты
  `?view=2d|3d` (D-47), параметры карты `?date=`, `?cells=`.
- **Грабли:** зритель (`getViewer`) — один на страницу: переход по хэшу (`#/debug` → `#/`) его не пересоздаёт, и
  он помнит показанное; для чистого состояния в тесте — перезагрузка страницы. `#/debug` без `?date=` — тоже
  «живой» просмотр: он запоминает снимок «Что нового» (BACKLOG).

## 16. Ближайшие пункты: этап 2

Этап 3 принят 10.10.2026. Этап 2а — запуск настоящей игры (D-51): спецификация
`docs/superpowers/specs/2026-10-10-stage-2a-launch-design.md`, план
`docs/superpowers/plans/2026-10-10-stage-2a-launch.md` — у каждой задачи свой блок «Где смотреть».
Игра запущена 11.10.2026 (12.10–25.10). План 2б-1 — состав и команды (D-52): спецификация
`docs/superpowers/specs/2026-10-11-stage-2b1-roster-design.md`, план
`docs/superpowers/plans/2026-10-11-stage-2b1-roster.md`. План 2б-2 — корректировки (D-53): спецификация
`docs/superpowers/specs/2026-10-11-stage-2b2-corrections-design.md`, план
`docs/superpowers/plans/2026-10-11-stage-2b2-corrections.md`. Отпуск оператора (D-54): спецификация
`docs/superpowers/specs/2026-10-12-vacations-design.md`, план `docs/superpowers/plans/2026-10-12-vacations.md`.
Моменты восторга в течение дня — спецификация `docs/superpowers/specs/2026-10-13-engagement-moments-design.md`:
часть 0 — «Промежуточные итоги» (D-55), план `docs/superpowers/plans/2026-10-13-intraday-import.md`; часть А —
моменты на панелях и «Что нового» (D-56), план `docs/superpowers/plans/2026-10-13-moments-panels.md`;
часть Б — сцена: подлёт, счётчик над фигуркой, салюты (D-57), план `docs/superpowers/plans/2026-10-13-moments-scene.md`.
Все три части на сайте с 14.10.2026. Ачивки на виду (D-58) — с 14.10. Финал игры (D-59): спецификация
`docs/superpowers/specs/2026-10-18-game-finale-design.md`, план `docs/superpowers/plans/2026-10-18-game-finale.md`;
26.10 — последняя загрузка, проверка, «Подвести итоги». Предпросмотр финала в админке и правки карточки и ничьей
(D-60) — план `docs/superpowers/plans/2026-10-19-finale-preview.md`. Дальше 2б-3 — журнал, отмена, веса, смена фразы (BACKLOG
«Этап 2»); после игры — приёмка этапа 2 и этап 4.

## Грабли среды (уроки сессий)

- Правки файлов — Python-скриптами из папки черновиков с `newline=''` (иначе CRLF); heredoc в bash с
  кавычками ломается.
- Апостроф в заголовке теста (`'the art's …'`) ломает строку TypeScript — перефразировать.
- Playwright «Timed out waiting … from config.webServer»: на этом ПК с 12.10.2026 петля IPv6 (`[::1]`, куда
  первым резолвится `localhost`) не принимает соединения между процессами — сервер e2e на `127.0.0.1`
  (`playwright.config.ts`). Если порт 4173 «занят» — висит node от прошлой попытки (`Get-NetTCPConnection
  -LocalPort 4173`).
- Не запускать в bash `cat > файл` без heredoc — ждёт ввода и висит до тайм-аута.
- React-линт: не мутировать значения из хуков (`useMemo`/`useState`) прямо в компоненте — через ref или
  внешнюю функцию; ссылки на объекты three — через `useThree((s) => s.get)`.
- R3F: смена материала с цветом на материал с картой — разные `key`, иначе панель чёрная.
- Таймерные тесты — только отдельно (`tests/perf`, свой vitest-конфиг), иначе меряют соседей.
- Временные тесты-снимки — `tests/e2e/zz-*.spec.ts`, не коммитить и удалять сразу после снимков.
- Обратные косые в Python из heredoc bash теряются: двойная косая приходит одинарной, а escape-код минуса
  превращается в сам символ «−». Регэкспы и экранирования — правкой файла (Edit) или скриптом-файлом из черновиков.
- **Настоящие имена людей — никогда в репозитории**, даже как пример в комментарии, тесте или подписи коммита:
  примеры — только вымышленные имена демо (ревью 2б-1 нашло имя руководителя в публичной истории).
- Проверку перед коммитом не пропускать через `| tail`: код выхода — от `tail`, и `&& git commit` идёт
  дальше при упавшем линте.
- Админка в браузере проверяется только Playwright-ом: GitHub подменяется `page.route` (`serveFakeGitHub`);
  в панели браузера приложения — настоящий GitHub без ключа.
- Субагенты иногда не стартуют (ошибка 403) — помогает перезапуск сессии; без них ревью делать самому и
  честно писать об этом в плане и отчёте.
- `/tmp` в bash — не тот, что видит Python под Windows: копии и временные файлы — в папку черновиков (путь
  Windows). Правки с регулярными выражениями и обратными слэшами — файлом-скриптом с сырыми строками
  (`r"""…"""`), а не во встроенном heredoc.
- Playwright `getByRole(…, { name })` ищет подстроку: «Изменить» найдёт и «Изменить отпуск» — `exact: true`.
- Эффект на сцене (салют, прыжок) проверять скриншотом **в его момент**: временная проба (`window.__dbg` в
  компоненте) + опрос из теста `zz-*.spec.ts`; пробу и тест удалить сразу после снимков.
