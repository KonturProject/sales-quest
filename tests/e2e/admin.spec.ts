import { expect, test, type Page } from '@playwright/test';
import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { FakeGitHubRepo, serveFakeGitHub, serveSiteData } from '../support/fakeGitHub.ts';

// QA-3: the admin end to end with GitHub faked inside the browser (no token, no network); the site's
// data/ answered from the fake's head, so the viewer sees what the admin committed.
const DEMO = 'sales-quest-demo';
const FUNNEL = 'tests/fixtures/import/funnel.xlsx';
test.use({ viewport: { width: 1280, height: 800 } });

async function login(page: Page, fake: FakeGitHubRepo) {
  await serveFakeGitHub(page, fake);
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

test('a file → preview → commit → the viewer sees the figures move (QA-3)', async ({ page }) => {
  test.setTimeout(120_000);
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  const before = await cells(page, '2026-10-13');

  await page.goto('./#/admin');
  await page.getByRole('button', { name: 'Войти' }).click();
  await importFunnel(page);
  await expect(page.getByTestId('resolve-list')).toBeVisible();
  await page
    .getByLabel('Кто это: Новикова Фёкла')
    .selectOption({ label: 'новый — команда Алина Смирнова' });
  await page.getByLabel('Кто это: Тестов Тест').selectOption('ignore');
  await page.getByRole('button', { name: 'Показать превью' }).click();
  await expect(page.getByTestId('preview-table')).toBeVisible();
  await page.getByTestId('commit-button').click();
  await expect(page.getByTestId('publishing')).toHaveText(/Опубликовано/, { timeout: 30_000 });

  expect(fake.commits).toHaveLength(2);
  expect(fake.last.message).toMatch(/^data\(demo\): импорт: воронка по дням 05\.10–12\.10/);
  for (const name of ['Новикова', 'Тестов', 'Алина', 'Смирнова'])
    expect(fake.last.message).not.toContain(name);
  expect(await cells(page, '2026-10-13')).not.toEqual(before);
});
