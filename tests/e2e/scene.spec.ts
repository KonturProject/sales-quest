import { expect, test, type Page } from '@playwright/test';

// The demo game (D-32); `?date=` moves the game to another day (D-35), which plays the moves.
const DEMO = 'sales-quest-demo';
type Probe = Window & {
  __sqFrames?: number;
  __sqStats?: { calls: number; triangles: number };
};
const frames = (page: Page) => page.evaluate(() => (window as Probe).__sqFrames ?? 0);
const stats = (page: Page) => page.evaluate(() => (window as Probe).__sqStats ?? null);

/** The first two working days of the demo, from its period on the debug page. */
async function demoDays(page: Page): Promise<[string, string]> {
  await page.goto(`./#/debug?k=${DEMO}`);
  const heading = await page.getByRole('heading').first().textContent();
  const start = heading?.match(/(\d{4}-\d{2}-\d{2}) …/)?.[1] ?? '';
  const next = (d: string, n: number) => {
    const day = new Date(`${d}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + n);
    return day.toISOString().slice(0, 10);
  };
  // Data of a day is imported the next morning: on day 3 the first two days are in.
  return [next(start, 2), next(start, 3)];
}

/** Waits until no frame has been drawn for `quietMs`. */
async function settle(page: Page, quietMs = 1500) {
  let last = await frames(page);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(quietMs);
    const now = await frames(page);
    if (now === last) return now;
    last = now;
  }
  throw new Error('the scene never came to rest');
}

test.use({ viewport: { width: 1366, height: 768 } });

test('the board draws within the budgets and rests at 0 frames (PERF-1, §12.1)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./#/?k=${DEMO}`);
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => frames(page)).toBeGreaterThan(0);
  const rest = await settle(page);
  await page.waitForTimeout(2000);
  expect(await frames(page)).toBe(rest);
  const s = await stats(page);
  expect(s?.calls).toBeLessThanOrEqual(120);
  expect(s?.triangles).toBeLessThanOrEqual(80_000);
  expect(errors).toEqual([]);
});

test('a new day plays the moves, then the scene rests again (FR-MOVE-1)', async ({ page }) => {
  const [day, next] = await demoDays(page);
  await page.goto(`./#/?date=${day}`);
  await expect(page.locator('canvas')).toBeVisible();
  const rest = await settle(page);
  await page.goto(`./#/?date=${next}`);
  await page.waitForTimeout(3000);
  const moving = (await frames(page)) - rest;
  expect(moving).toBeGreaterThan(40); // ~30 FPS for 3 s
  await settle(page);
});

test('a hidden tab draws nothing, even when new data comes (PERF-3)', async ({ page }) => {
  const [day, next] = await demoDays(page);
  await page.goto(`./#/?date=${day}`);
  await expect(page.locator('canvas')).toBeVisible();
  const rest = await settle(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate((d) => (window.location.hash = `#/?date=${d}`), next);
  await page.waitForTimeout(3000);
  expect(await frames(page)).toBeLessThanOrEqual(rest + 1); // at most the one render of the new data
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(2000);
  expect(await frames(page)).toBeGreaterThan(rest + 20); // the moves play once visible
});
