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
