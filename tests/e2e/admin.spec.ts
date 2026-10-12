import { expect, test, type Page } from '@playwright/test';
import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { loadRepoState } from '../../src/admin/pipeline.ts';
import { computeGameState, type GameState } from '../../src/engine/gameState.ts';
import type { EngineInput } from '../../src/engine/prepare.ts';
import { teamOn } from '../../src/engine/roster.ts';
import { FakeGitHubRepo, serveFakeGitHub, serveSiteData } from '../support/fakeGitHub.ts';

// QA-3: the admin end to end with GitHub faked inside the browser (no token, no network); the site's
// data/ answered from the fake's head, so the viewer sees what the admin committed.
const DEMO = 'sales-quest-demo';
const FUNNEL = 'tests/fixtures/import/funnel.xlsx';
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

/** «клетка N» of every team card on the map on a day. */
async function cells(page: Page, date: string): Promise<string[]> {
  await page.goto(`./#/?date=${date}&view=2d`);
  // A hash link keeps the page: reload, as a viewer would, for the publication to show at once.
  await page.reload();
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
  const before = await cells(page, '2026-10-13');

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
  expect(await cells(page, '2026-10-13')).not.toEqual(before);
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
