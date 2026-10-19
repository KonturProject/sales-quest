import { expect, test, type Page } from '@playwright/test';
import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { loadRepoState } from '../../src/admin/pipeline.ts';
import { computeGameState, type GameState } from '../../src/engine/gameState.ts';
import type { EngineInput } from '../../src/engine/prepare.ts';
import { teamOn } from '../../src/engine/roster.ts';
import { FakeGitHubRepo, serveFakeGitHub, serveSiteData } from '../support/fakeGitHub.ts';
import { commitDemo } from '../support/closedDemo.ts';
import { closeGame } from '../../src/admin/finale.ts';
import { readFileSync } from 'node:fs';
import { applyCorrections, revokeAdjustments } from '../../src/admin/corrections.ts';
import { prepareImport } from '../../src/admin/importStep.ts';
import { DEFAULT_PROFILES } from '../../src/import/profiles.ts';
import { parseWorkbook } from '../../src/import/xlsx.ts';

// QA-3: the admin end to end with GitHub faked inside the browser (no token, no network); the site's
// data/ answered from the fake's head, so the viewer sees what the admin committed.
const DEMO = 'sales-quest-demo';
const FUNNEL = 'tests/fixtures/import/funnel.xlsx';
const INTRADAY = 'tests/fixtures/import/intraday.xlsx';
test.use({ viewport: { width: 1280, height: 800 } });

async function login(
  page: Page,
  fake: FakeGitHubRepo,
  opts: { beforeMove?: () => void; moveDelayMs?: number } = {},
) {
  await serveFakeGitHub(page, fake, opts);
  await serveSiteData(page, fake);
  await page.goto('./#/admin');
  await page.getByLabel('Ключ GitHub').fill('test-token');
  await page.getByLabel('Фраза доступа к данным игры').fill(DEMO);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByTestId('admin-home')).toBeVisible();
}

/**
 * The map on a day, reloaded as a viewer would. It shows the data cached in this browser at once and the
 * published ones after its check (`sync.start`): read the cards with `cells`, and poll them for a change.
 */
async function openDay(page: Page, date: string) {
  await page.goto(`./#/?date=${date}&view=2d`);
  await page.reload();
}

/** «клетка N» of every team card as the map shows them now. */
async function cells(page: Page): Promise<string[]> {
  const cards = page.getByRole('list', { name: 'Команды' }).getByText(/^клетка \d+/);
  await expect(cards).toHaveCount(6);
  return cards.allTextContents();
}

async function importFunnel(page: Page) {
  await page.getByRole('button', { name: 'Загрузить выгрузку' }).click();
  await page.getByTestId('import-file').setInputFiles(FUNNEL);
}

/**
 * The fixture's stranger with numbers joins a team; «Тестов Тест» has none in the file and is not
 * asked about at all (review 2a).
 */
async function resolveAndPreview(page: Page) {
  await expect(page.getByTestId('resolve-list')).toBeVisible();
  await expect(page.getByLabel('Кто это: Тестов Тест')).toHaveCount(0);
  await page
    .getByLabel('Кто это: Новикова Фёкла')
    .selectOption({ label: 'новый — команда Алина Смирнова' });
  await page.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('preview-table')).toBeVisible();
}

/** Paths whose text differs between two commits of the fake. */
function changed(fake: FakeGitHubRepo, a: number, b: number): string[] {
  const x = fake.commits[a]?.files ?? new Map<string, string>();
  const y = fake.commits[b]?.files ?? new Map<string, string>();
  return [...new Set([...x.keys(), ...y.keys()])].filter((p) => x.get(p) !== y.get(p)).sort();
}

test('a file → preview → commit → the viewer sees the figures move (QA-3)', async ({ page }) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await openDay(page, '2026-10-13');
  const before = await cells(page);

  await page.goto('./#/admin');
  await page.getByRole('button', { name: 'Войти' }).click();
  await importFunnel(page);
  await resolveAndPreview(page);
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect(fake.last.message).toMatch(/^data\(demo\): импорт: воронка по дням 05\.10–12\.10/);
  for (const name of ['Новикова', 'Тестов', 'Алина', 'Смирнова'])
    expect(fake.last.message).not.toContain(name);
  // A slow site (CI under load): the cached day shows first, the published one after the check.
  await page.route('**/sales-quest/data/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fallback();
  });
  await openDay(page, '2026-10-13');
  await expect.poll(() => cells(page), { timeout: 15_000 }).not.toEqual(before);
});

test('«Новая игра»: the funnel → teams → the phrase → one commit; the demo is gone, the new phrase opens the game and the demo one does not (QA-3, D-32)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Новая игра' }).click();
  await page.getByTestId('new-game-file').setInputFiles(FUNNEL);
  for (let i = 1; i <= 6; i++)
    await page.getByLabel(`Руководитель СР${i}`).fill(`Руководитель ${i}`);
  await expect(page.getByTestId('launch-button')).toBeDisabled();
  await page.getByLabel('Фраза сохранена в надёжном месте').check();
  await expect(page.getByTestId('new-game-summary')).toContainText('6. СР6 · Руководитель 6');
  const phrase = await page.getByLabel('Фраза доступа новой игры').inputValue();
  await page.getByTestId('launch-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect([...fake.last.files.keys()].filter((f) => f.includes('/demo/'))).toEqual([]);
  expect(fake.last.message).toMatch(
    /^data\(\d{4}-\d\d-\d\d\): новая игра \d\d\.\d\d–\d\d\.\d\d, 6 команд, \d+ операторов \[by koordinator\]$/,
  );
  // The map of this browser opens the new game: the phrase changed with the publication.
  expect(await page.evaluate(() => localStorage.getItem('sq.phrase'))).toBe(phrase);
  await page.goto('./#/debug');
  await page.reload();
  await expect(page.getByTestId('team-row')).toHaveCount(6);
  await expect(page.getByText('Руководитель 1', { exact: false }).first()).toBeVisible();
  // The demo's public phrase opens nothing any more.
  await page.goto(`./#/debug?k=${DEMO}`);
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('Код не подходит');
});

test('the same file again moves nothing: the teams stay, only the import log changes (QA-3, DATA-11)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await importFunnel(page);
  await resolveAndPreview(page);
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
  expect(fake.commits).toHaveLength(2);

  await importFunnel(page);
  // Both people are known now: one joined, one is ignored for good.
  await expect(page.getByTestId('resolve-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Показать превью' }).click();
  const preview = page.getByTestId('preview-table');
  await expect(preview).toContainText('этот файл уже загружался');
  const moves = await preview
    .locator('table')
    .first()
    .locator('tbody td:nth-child(2)')
    .allTextContents();
  expect(moves).toHaveLength(6);
  for (const m of moves) expect(m).not.toContain('→');
  // The site has not rebuilt yet: the banner of this commit says so, not the last one's «Опубликовано».
  const published = fake.last.files;
  await serveSiteData(page, fake, { files: () => published });
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/^Публикуется/);
  expect(fake.commits).toHaveLength(3);
  expect(changed(fake, 1, 2)).toEqual(['data/seasons/demo/imports.enc.json', 'data/version.json']);
});

test('an answer changed after the preview hides it: nothing stale is written (review 2a)', async ({
  page,
}) => {
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await importFunnel(page);
  await resolveAndPreview(page);
  await expect(page.getByTestId('commit-button')).toBeVisible();
  await page.getByLabel('Кто это: Новикова Фёкла').selectOption('ignore');
  await expect(page.getByTestId('preview-table')).toHaveCount(0);
  await expect(page.getByTestId('commit-button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('preview-table')).not.toContainText('новых');
});

test('a token without the right to write is refused at the login (SEC-2)', async ({ page }) => {
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  fake.canPush = false;
  await serveFakeGitHub(page, fake);
  await page.goto('./#/admin');
  await page.getByLabel('Ключ GitHub').fill('test-token');
  await page.getByLabel('Фраза доступа к данным игры').fill(DEMO);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('alert')).toContainText('нет права записи');
  await expect(page.getByTestId('admin-home')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sq.admin.token'))).toBeNull();
});

test('the branch moved between the preview and the commit: a fresh preview, then nothing is lost (SEC-4, ADM-2)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  let other = true;
  // Another admin commits once, right before our first attempt moves `main`.
  await login(page, fake, {
    beforeMove: () => {
      if (other) fake.advance();
      other = false;
    },
  });
  await importFunnel(page);
  await resolveAndPreview(page);
  await page.getByTestId('commit-button').click();
  await expect(page.getByRole('status').filter({ hasText: 'данные изменились' })).toHaveText(
    'данные изменились, пока вы смотрели превью — проверьте ещё раз',
  );
  expect(fake.commits.map((c) => c.message)).toEqual(['начало', 'другой админ']);
  await expect(page.getByTestId('preview-table')).toBeVisible();
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
  expect(fake.commits).toHaveLength(3);
  expect(fake.last.parent).toBe('c1');
  expect(fake.last.message).toMatch(/^data\(demo\): импорт: воронка по дням/);
  expect(changed(fake, 1, 2)).toContain('data/seasons/demo/records.enc.json');
});

test('«Состав и команды»: a firing, a transfer, a new operator and a colour are one commit of counts (ADM-ROSTER)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  const roster = page.getByTestId('roster');
  const alina = roster.getByRole('region', { name: 'Команда Алина Смирнова' });
  await alina.getByText(/^Операторы/).click();
  const [fired, moved] = (await alina.getByTestId('operator-name').allTextContents()) as [
    string,
    string,
  ];

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
  const lines = draft.getByRole('list', { name: 'Изменения' }).getByRole('listitem');
  await expect(lines).toHaveCount(4);
  // #123456 is close to Борис Кузнецов's navy: a warning, not a refusal.
  await expect(draft.getByRole('list', { name: 'Предупреждения' })).toContainText('похож на');
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
  await expect(page.getByTestId('roster-draft')).toHaveCount(0);
});

test('«данные изменились» between the preview and «Записать»: the batch is applied again and written (ADM-2)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  let other = true;
  // Another admin commits once, right before our first attempt moves `main`.
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
  await expect(draft.getByRole('list', { name: 'Изменения' }).getByRole('listitem')).toHaveCount(1);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
  expect(fake.commits).toHaveLength(3);
  expect(fake.last.parent).toBe('c1');
  expect(fake.last.message).toBe('data(demo): команды: 1 изменена [by koordinator]');
});

/** One team colour in the batch — the smallest change of the roster screen. */
async function colourBatch(page: Page, leader: string) {
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  await page
    .getByTestId('roster')
    .getByRole('region', { name: `Команда ${leader}` })
    .getByRole('button', { name: 'Изменить команду' })
    .click();
  await page.getByLabel('Цвет', { exact: true }).fill('#123456');
  await page.getByRole('button', { name: 'В изменения' }).click();
}

test('while «Записываю…» the roster screen is frozen: nothing can be added and lost (review 2b-1)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake, { moveDelayMs: 3_000 });
  await colourBatch(page, 'Егор Лебедев');
  const draft = page.getByTestId('roster-draft');
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByTestId('roster-commit')).toHaveText('Записываю…');
  const roster = page.getByTestId('roster');
  await expect(roster.getByRole('button', { name: 'Добавить оператора' })).toBeDisabled();
  await expect(roster.getByRole('button', { name: 'Назад' })).toBeDisabled();
  await expect(
    roster.getByRole('region', { name: 'Команда Алина Смирнова' }).getByRole('button', {
      name: 'Изменить команду',
    }),
  ).toBeDisabled();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
});

test('an unsaved batch is not lost silently: «Карта» asks first, closing the page warns (review 2b-1)', async ({
  page,
}) => {
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await colourBatch(page, 'Егор Лебедев');
  const asked: string[] = [];
  page.once('dialog', (d) => {
    asked.push(d.message());
    void d.dismiss();
  });
  await page.getByRole('link', { name: 'Карта' }).click();
  expect(asked[0]).toMatch(/несохранённые изменения/);
  await expect(page.getByTestId('roster-draft')).toBeVisible();
  const kinds: string[] = [];
  page.once('dialog', (d) => {
    kinds.push(d.type());
    void d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => kinds).toEqual(['beforeunload']);
});

test('an open form stays with its new person when another new person is removed (review 2b-1)', async ({
  page,
}) => {
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  const roster = page.getByTestId('roster');
  for (const name of ['Аа Тестов', 'Бб Тестов', 'Вв Тестов']) {
    await roster.getByRole('button', { name: 'Добавить оператора' }).click();
    await page.getByLabel('ФИО', { exact: true }).fill(name);
    await page.getByLabel('Команда', { exact: true }).selectOption({ label: 'Вера Соколова' });
    await page.getByRole('button', { name: 'В изменения' }).click();
  }
  const vera = roster.getByRole('region', { name: 'Команда Вера Соколова' });
  await vera.getByText(/^Операторы/).click();
  await vera.getByRole('button', { name: 'Изменить: Бб Тестов' }).click();
  await page.getByLabel('ФИО', { exact: true }).fill('Бб Тестовый');
  await page.getByRole('button', { name: /^Убрать: Новый: Аа Тестов/ }).click();
  await page.getByRole('button', { name: 'В изменения' }).click();
  const lines = page
    .getByTestId('roster-draft')
    .getByRole('list', { name: 'Изменения' })
    .getByRole('listitem');
  await expect(lines.filter({ hasText: 'ФИО: Бб Тестов → Бб Тестовый' })).toHaveCount(1);
  await expect(lines.filter({ hasText: 'ФИО: Вв Тестов' })).toHaveCount(0);
});

test('«Корректировки»: a bonus to a team and +1 payment for yesterday are one commit of the adjustments only (ADM-STEPS, D-25)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The admin's today is pinned: the default day and the cells must not depend on when the test runs.
  const NOW = '2026-10-14T12:00:00+03:00';
  await page.clock.setFixedTime(new Date(NOW));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const before = (await loadRepoState(fake, DEMO, new Map())).input;
  const operator = before.config.managers.find(
    (m) => m.firedAt === undefined && teamOn(m, '2026-10-13') === 't3',
  );
  if (!operator) throw new Error('в демо нет оператора команды t3');
  await login(page, fake);
  await page.getByRole('button', { name: 'Корректировки' }).click();
  const screen = page.getByTestId('corrections');

  const steps = screen.getByRole('form', { name: 'Шаги команде' });
  await steps.getByLabel('Команда', { exact: true }).selectOption({ label: 'Егор Лебедев' });
  await steps.getByLabel('Шаги', { exact: true }).fill('+2');
  await steps.getByLabel('Причина', { exact: true }).fill('конкурс');
  await expect(steps.getByText(/^Егор Лебедев: клетка \d+ → \d+$/)).toBeVisible();
  await steps.getByRole('button', { name: 'В корректировки' }).click();

  const metric = screen.getByRole('form', { name: 'Показатели оператора за день' });
  await expect(metric.getByLabel('День', { exact: true })).toHaveValue('2026-10-13');
  await metric.getByLabel('Оператор', { exact: true }).selectOption(operator.id);
  await metric.getByLabel('Показатель', { exact: true }).selectOption({ label: 'Оплаты' });
  await metric.getByLabel('Сколько', { exact: true }).fill('1');
  await metric.getByLabel('Причина', { exact: true }).fill('поздняя оплата');
  await expect(metric.getByText('Оплаты +1 = +10 баллов')).toBeVisible();
  await expect(metric.getByText(/посчита\S* дважды/)).toBeVisible();
  await metric.getByRole('button', { name: 'В корректировки' }).click();

  const draft = page.getByTestId('corrections-draft');
  await expect(draft.getByRole('list', { name: 'Изменения' }).getByRole('listitem')).toHaveCount(2);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('corrections-preview')).toBeVisible();
  await page.getByTestId('corrections-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect(fake.last.message).toBe(
    'data(demo): корректировки: 1 — шаги, 1 — показатели [by koordinator]',
  );
  expect(changed(fake, 0, 1)).toEqual([
    'data/seasons/demo/adjustments.enc.json',
    'data/version.json',
  ]);
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  expect(after.adjustments.slice(before.adjustments.length)).toMatchObject([
    { type: 'team_steps', teamId: 't6', value: 2, reason: 'конкурс', by: 'koordinator' },
    {
      type: 'manager_points',
      managerId: operator.id,
      date: '2026-10-13',
      value: 10,
      reason: 'Оплаты +1: поздняя оплата',
    },
  ]);
  const was = computeGameState(before, NOW);
  const now = computeGameState(after, NOW);
  const cell = (s: GameState) => s.teams.find((t) => t.teamId === 't6')?.position ?? -1;
  const points = (s: GameState) => s.managers.find((m) => m.managerId === operator.id)?.points ?? 0;
  expect(cell(now)).toBe(cell(was) + 2);
  expect(points(now) - points(was)).toBeCloseTo(10);
});

test('«данные изменились» while correcting: the batch is applied to the fresh season and written (ADM-2)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  let other = true;
  // Another admin commits once, right before our first attempt moves `main`.
  await login(page, fake, {
    beforeMove: () => {
      if (other) fake.advance();
      other = false;
    },
  });
  await page.getByRole('button', { name: 'Корректировки' }).click();
  const steps = page.getByTestId('corrections').getByRole('form', { name: 'Шаги команде' });
  await steps.getByLabel('Команда', { exact: true }).selectOption({ label: 'Егор Лебедев' });
  await steps.getByLabel('Шаги', { exact: true }).fill('−1');
  await steps.getByLabel('Причина', { exact: true }).fill('штраф');
  await steps.getByRole('button', { name: 'В корректировки' }).click();
  const draft = page.getByTestId('corrections-draft');
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('corrections-commit').click();
  await expect(page.getByRole('status').filter({ hasText: 'данные изменились' })).toBeVisible();
  expect(fake.commits.map((c) => c.message)).toEqual(['начало', 'другой админ']);
  await expect(draft.getByRole('list', { name: 'Изменения' }).getByRole('listitem')).toHaveCount(1);
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('corrections-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });
  expect(fake.commits).toHaveLength(3);
  expect(fake.last.parent).toBe('c1');
  expect(fake.last.message).toBe('data(demo): корректировки: 1 — шаги [by koordinator]');
});

test('a day cleared or half-typed in «Показатели оператора за день» never takes the admin down (review 2b-2)', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Корректировки' }).click();
  const metric = page
    .getByTestId('corrections')
    .getByRole('form', { name: 'Показатели оператора за день' });
  const day = metric.getByLabel('День', { exact: true });
  // Backspace in a date field empties it; typing a year passes through 0002, 0020…
  await day.fill('');
  await expect(metric.getByLabel('Оператор', { exact: true })).toBeVisible();
  await day.fill('0002-10-09');
  await expect(metric.getByLabel('Оператор', { exact: true })).toBeVisible();
  await day.fill('2026-10-12');
  await expect(day).toHaveValue('2026-10-12');
  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0);
});

test('«Отпуск»: a vacation through the roster batch is one commit of the config; the team plan loses the days (D-54)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const NOW = '2026-10-14T12:00:00+03:00';
  await page.clock.setFixedTime(new Date(NOW));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const before = (await loadRepoState(fake, DEMO, new Map())).input;
  await login(page, fake);
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  const boris = page.getByTestId('roster').getByRole('region', { name: 'Команда Борис Кузнецов' });
  await boris.getByText(/^Операторы/).click();
  const name = (await boris.getByTestId('operator-name').first().textContent()) ?? '';
  await boris.getByRole('button', { name: `Отпуск: ${name}` }).click();
  await page.getByLabel('Начало отпуска', { exact: true }).fill('2026-10-12');
  await page.getByLabel('Конец отпуска', { exact: true }).fill('2026-10-16');
  await page.getByRole('button', { name: 'В изменения' }).click();
  await expect(boris.getByText('в отпуске до 16.10')).toBeVisible();
  const draft = page.getByTestId('roster-draft');
  await expect(draft.getByRole('list', { name: 'Изменения' })).toContainText(
    `Отпуск: ${name} 12.10–16.10 (5 раб. дн.)`,
  );
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('roster-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.last.message).toBe('data(demo): состав: 1 отпуск [by koordinator]');
  expect(changed(fake, 0, 1)).toEqual(['data/seasons/demo/config.enc.json', 'data/version.json']);
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  expect(after.config.managers.find((m) => m.fullName === name)?.vacations).toEqual([
    { from: '2026-10-12', to: '2026-10-16' },
  ]);
  const t2 = (i: EngineInput) => computeGameState(i, NOW).teams.find((t) => t.teamId === 't2');
  expect(t2(after)?.targetPoints ?? 0).toBeLessThan(t2(before)?.targetPoints ?? 0);
  expect(t2(after)?.position ?? 0).toBeGreaterThanOrEqual(t2(before)?.position ?? 0);
});

test('«Изменить отпуск» opens with the dates of the vacation; «Отпуск» stays open before a later firing (review D-54)', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Состав и команды' }).click();
  const boris = page.getByTestId('roster').getByRole('region', { name: 'Команда Борис Кузнецов' });
  await boris.getByText(/^Операторы/).click();
  const [first, second] = (await boris.getByTestId('operator-name').allTextContents()) as [
    string,
    string,
  ];
  await boris.getByRole('button', { name: `Отпуск: ${first}`, exact: true }).click();
  await page.getByLabel('Начало отпуска', { exact: true }).fill('2026-10-12');
  await page.getByLabel('Конец отпуска', { exact: true }).fill('2026-10-16');
  await page.getByRole('button', { name: 'В изменения' }).click();
  // A new vacation's form first, then «Изменить отпуск» on the same row: the dates are the vacation's.
  await boris.getByRole('button', { name: `Отпуск: ${first}`, exact: true }).click();
  await boris.getByRole('button', { name: `Изменить отпуск: ${first} с 12.10` }).click();
  await expect(page.getByLabel('Начало отпуска', { exact: true })).toHaveValue('2026-10-12');
  await expect(page.getByLabel('Конец отпуска', { exact: true })).toHaveValue('2026-10-16');
  await page.getByRole('button', { name: 'Отмена' }).click();

  await boris.getByRole('button', { name: `Уволить: ${second}` }).click();
  await page.getByLabel('Дата увольнения', { exact: true }).fill('2026-10-16');
  await page.getByRole('button', { name: 'В изменения' }).click();
  await expect(boris.getByRole('button', { name: `Отпуск: ${second}`, exact: true })).toBeEnabled();
});

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

test('«Подвести итоги»: the podium for a check, one public commit of the config; «Вернуть игру» undoes it (D-59)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The demo's game ends 18.10: from that day on the game can be closed.
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Подвести итоги' }).click();
  await page.getByTestId('finale-draft').getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('finale-preview')).toContainText('1 место');
  await page.getByTestId('finale-commit').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.last.message).toBe('data(demo): итоги игры 05.10–18.10 [by koordinator]');
  expect(changed(fake, 0, 1)).toEqual(['data/seasons/demo/config.enc.json', 'data/version.json']);
  const closed = (await loadRepoState(fake, DEMO, new Map())).input.config;
  expect(closed.status).toBe('closed');
  // The moment of the pinned clock, written in the browser's own zone (CI runs in UTC): compare the instant.
  expect(Date.parse(closed.closedAt ?? '')).toBe(Date.parse('2026-10-19T12:00:00+03:00'));

  await page.getByRole('button', { name: 'Вернуть игру' }).click();
  await page.getByTestId('finale-draft').getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('finale-commit').click();
  // The banner of the first commit still reads «Опубликовано»: wait for the second commit itself.
  await expect
    .poll(() => fake.last.message, { timeout: 30_000 })
    .toBe('data(demo): игра снова идёт: 05.10–18.10 [by koordinator]');
  const reopened = (await loadRepoState(fake, DEMO, new Map())).input.config;
  expect(reopened.status).toBe('active');
  expect(reopened.closedAt).toBeUndefined();
});

test('«Подвести итоги» on a stale read: the conflict refuses it, never turns it into «Вернуть игру» (review D-59)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Подвести итоги' }).click();
  // Another admin tab closed the game meanwhile.
  await commitDemo(
    fake,
    (i) => closeGame(i, '2026-10-19T11:30:00+03:00'),
    '2026-10-19T11:30:00+03:00',
  );
  const commits = fake.commits.length;
  const draft = page.getByTestId('finale-draft');
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await page.getByTestId('finale-commit').click();
  await expect(draft.getByRole('alert')).toContainText('итоги уже подведены', { timeout: 15_000 });
  await draft.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('finale-commit')).toBeDisabled();
  expect(fake.commits.length).toBe(commits);
});

test('«Посмотреть финал»: the results and the ceremony on the data now, for the admin alone — nothing written (D-60)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The demo's game runs 05.10–18.10: on the 15th it cannot be closed yet, but it can be previewed.
  await page.clock.install({ time: new Date('2026-10-15T12:00:00+03:00') });
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  const commits = fake.commits.length;
  await expect(page.getByRole('button', { name: 'Подвести итоги' })).toBeDisabled();
  await page.getByRole('button', { name: 'Посмотреть финал' }).click();
  const screen = page.getByTestId('finale-preview-screen');
  await expect(screen).toContainText('видите только вы');
  const results = screen.getByRole('region', { name: 'Итоги игры' });
  await expect(results.getByRole('list', { name: 'Пьедестал' }).getByRole('listitem')).toHaveCount(
    3,
  );
  await expect(page.getByRole('button', { name: 'Посмотреть церемонию ещё раз' })).toHaveCount(0);
  await screen.getByRole('button', { name: 'Проиграть церемонию' }).click();
  await expect(screen.getByRole('region', { name: 'Церемония' })).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(results).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sq.finale.v1'))).toBeNull();
  await screen.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByTestId('admin-home')).toBeVisible();
  expect(fake.commits.length).toBe(commits);
});

/** The funnel fixture as the admin's screen parses it, in Node. */
function funnelFile() {
  const bytes = readFileSync(FUNNEL);
  const { profile, parsed } = parseWorkbook(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    DEFAULT_PROFILES,
    '2026-10-13',
  );
  return { profile, parsed, sha256: 'f'.repeat(64), fileName: 'funnel.xlsx' };
}

test('the funnel’s preview shows what it changes per operator; a fix there is one commit with the import (2b-3)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await importFunnel(page);
  await resolveAndPreview(page);
  const table = page.getByRole('table', { name: 'Что меняет файл' });
  const first = table.getByRole('row').nth(1);
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: /^Поправить/ }).click();
  const form = page.getByRole('form', { name: 'Правка в этой записи' });
  await form.getByLabel('Показатель').selectOption({ label: 'Качественные счета' });
  await form.getByLabel('Сколько').fill('1');
  await expect(form.getByLabel('День')).toHaveValue('2026-10-12');
  await form.getByLabel('Причина').fill('нет в воронке');
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect(first).toContainText('с правкой');
  await expect(page.getByRole('list', { name: 'Правки в этой записи' })).toContainText(
    'нет в воронке',
  );
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.last.message).toMatch(/, корректировок: 1 \[by koordinator\]$/);
  // The config too: the file's new operator joins the roster (resolveAndPreview).
  expect(changed(fake, 0, 1)).toEqual([
    'data/seasons/demo/adjustments.enc.json',
    'data/seasons/demo/config.enc.json',
    'data/seasons/demo/imports.enc.json',
    'data/seasons/demo/records.enc.json',
    'data/version.json',
  ]);
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  expect(after.adjustments.at(-1)).toMatchObject({
    type: 'manager_points',
    date: '2026-10-12',
    reason: 'Качественные счета +1: нет в воронке',
  });
});

/**
 * A «показатели» correction committed for an operator and a day the funnel fixture raises a metric of —
 * found with the screen's own pure step; its id.
 */
async function handAddedDouble(fake: FakeGitHubRepo): Promise<string> {
  const state = await loadRepoState(fake, DEMO, new Map());
  const now = '2026-10-12T09:00:00+03:00';
  const step = prepareImport(state, funnelFile(), new Map(), { by: 'test', at: now, now });
  const known = new Set(state.input.config.managers.map((m) => m.id));
  const raise = step.changes
    .filter((r) => known.has(r.managerId))
    .flatMap((r) =>
      r.days.flatMap((d) =>
        d.metrics
          .filter((m) => m.file > m.before)
          .map((m) => ({ managerId: r.managerId, date: d.date, metricId: m.metricId })),
      ),
    )[0];
  if (!raise) throw new Error('the funnel fixture raises nothing');
  await commitDemo(
    fake,
    (input) =>
      applyCorrections(
        input,
        [{ kind: 'metric', ...raise, count: 1, reason: 'добавлено вручную' }],
        { now, by: 'test' },
      ).input,
    now,
  );
  const id = (await loadRepoState(fake, DEMO, new Map())).input.adjustments.at(-1)?.id;
  if (id === undefined) throw new Error('no correction');
  return id;
}

test('a correction the funnel now brings: the hint, the tick, the correction cancelled in the same commit (2b-3)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const id = await handAddedDouble(fake);

  await login(page, fake);
  await importFunnel(page);
  await resolveAndPreview(page);
  await expect(page.getByText(/^Похоже, это уже было добавлено вручную/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Отменить эту корректировку в этой записи' }).check();
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.last.message).toMatch(/, отменено корректировок: 1 \[by koordinator\]$/);
  const after = (await loadRepoState(fake, DEMO, new Map())).input;
  expect(after.adjustments.find((a) => a.id === id)?.revoked?.reason).toBe(
    'пришло в выгрузке 12.10',
  );
});

test('an intraday file: what it changes per operator, no «Поправить» (2b-3)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00+03:00'));
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  await page.getByRole('button', { name: 'Загрузить выгрузку' }).click();
  await page.getByTestId('import-file').setInputFiles(INTRADAY);
  await page.getByLabel('День', { exact: true }).fill('2026-10-13');
  await page.getByRole('button', { name: 'Показать превью' }).click();
  const table = page.getByRole('table', { name: 'Что меняет файл' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await expect(table.getByRole('button', { name: /^Поправить/ })).toHaveCount(0);
});

test('a ticked cancel is listed with «Убрать»; cancelled meanwhile elsewhere, it is a problem there and «Убрать» lets the import through (review 2b-3)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  const id = await handAddedDouble(fake);
  await login(page, fake);
  await importFunnel(page);
  await resolveAndPreview(page);
  await page.getByRole('checkbox', { name: 'Отменить эту корректировку в этой записи' }).check();
  const listed = page.getByRole('list', { name: 'Отменяются в этой записи' });
  await expect(listed).toContainText('добавлено вручную');

  // Another tab cancelled the same correction meanwhile: «Записать» meets a conflict and a fresh read.
  await commitDemo(
    fake,
    (input) =>
      revokeAdjustments(input, [id], {
        by: 'test',
        at: '2026-10-12T10:00:00+03:00',
        reason: 'другая вкладка',
      }).input,
    '2026-10-12T10:00:00+03:00',
  );
  const commits = fake.commits.length;
  await page.getByTestId('commit-button').click();
  await expect(listed.getByRole('alert')).toContainText('корректировка уже отменена', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('commit-button')).toBeDisabled();
  await listed.getByRole('button', { name: 'Убрать' }).click();
  await expect(listed).toHaveCount(0);
  await page.getByTestId('commit-button').click();
  await expect.poll(() => fake.commits.length, { timeout: 30_000 }).toBe(commits + 1);
  expect(fake.last.message).not.toContain('отменено');
});
