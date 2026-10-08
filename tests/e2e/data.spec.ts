import { expect, test } from '@playwright/test';

// The demo game in data/ (D-32), served by the preview build from dist/data (D-33).
const DEMO = 'sales-quest-demo';

test('the demo loads, decrypts and shows six teams; the phrase leaves the address bar', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./#/debug?k=${DEMO}`);
  await expect(page.getByTestId('team-row')).toHaveCount(6);
  expect(new URL(page.url()).hash).toBe('#/debug');
  expect(await page.evaluate(() => localStorage.getItem('sq.phrase'))).toBe(DEMO);
  await expect(page.getByText('Предупреждения (0)')).toBeVisible();
  expect(errors).toEqual([]);
});

test('without a phrase the game asks for it, a wrong one is refused (SEC-7)', async ({ page }) => {
  await page.goto('./#/debug');
  await expect(page.getByRole('heading', { name: 'Введите код доступа' })).toBeVisible();
  await page.getByLabel('Код доступа').fill('не тот');
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByRole('alert')).toHaveText('Код не подходит');
  await page.getByLabel('Код доступа').fill(DEMO);
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByTestId('team-row')).toHaveCount(6);
});

test('?date= shows the game on that day (D-35)', async ({ page }) => {
  await page.goto(`./#/debug?k=${DEMO}`);
  await expect(page.getByTestId('team-row')).toHaveCount(6);
  await page.goto('./#/debug?date=2026-10-06');
  await expect(page.getByTestId('game-day')).toHaveText('день игры: 2026-10-06');
  // On the 6th only the 5th's data has been imported (at 09:00 on the 6th).
  await expect(page.getByText(/импорт от 06\.10 09:00/)).toBeVisible();
});

test('a reload works offline from the cache (SYNC-3)', async ({ page, context }) => {
  await page.goto(`./#/debug?k=${DEMO}`);
  await expect(page.getByTestId('team-row')).toHaveCount(6);
  await context.route('**/data/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId('team-row')).toHaveCount(6);
  await expect(page.getByText(/нет связи с/)).toBeVisible();
});
