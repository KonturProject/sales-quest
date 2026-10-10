import { expect, test, type Page } from '@playwright/test';

// The demo game's phrase is public (D-32); the map opens only with a phrase (SEC-7).
const MAP = './#/?k=sales-quest-demo';

const framesDrawn = (page: Page) =>
  page.evaluate(() => (window as Window & { __sqFrames?: number }).__sqFrames ?? 0);

test('the map opens with a WebGL canvas and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(MAP);
  await expect(page).toHaveTitle('Sales Quest');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => framesDrawn(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('an idle scene draws no frames (PERF-1)', async ({ page }) => {
  await page.goto(MAP);
  await expect.poll(() => framesDrawn(page)).toBeGreaterThan(0);
  // Start-up frames: the first render, a resize, and one per asset file as it arrives (eleven
  // files; a slow machine gets the last ones seconds later). Wait for a quiet 1.5 s first.
  let before = await framesDrawn(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const now = await framesDrawn(page);
    if (now === before) break;
    before = now;
  }
  await page.waitForTimeout(2000);
  expect(await framesDrawn(page)).toBe(before);
});

test('an unknown route offers the way back to the map', async ({ page }) => {
  await page.goto('./#/nowhere?k=sales-quest-demo');
  await page.getByRole('link', { name: 'На карту' }).click();
  await expect(page.locator('canvas')).toBeVisible();
});
