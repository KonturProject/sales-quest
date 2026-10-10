import { expect, test, type Page } from '@playwright/test';
import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { FakeGitHubRepo, serveFakeGitHub, serveSiteData } from '../support/fakeGitHub.ts';

// QA-3: the admin end to end with GitHub faked inside the browser (no token, no network); the site's
// data/ answered from the fake's head, so the viewer sees what the admin committed.
const DEMO = 'sales-quest-demo';
const FUNNEL = 'tests/fixtures/import/funnel.xlsx';
test.use({ viewport: { width: 1280, height: 800 } });

async function login(page: Page, fake: FakeGitHubRepo, opts: { beforeMove?: () => void } = {}) {
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
