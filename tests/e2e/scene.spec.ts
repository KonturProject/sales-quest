import { expect, test, type Page } from '@playwright/test';

// The demo game (D-32); `?date=` moves the game to another day (D-35), which plays the moves.
const DEMO = 'sales-quest-demo';
type Probe = Window & {
  __sqFrames?: number;
  __sqStats?: {
    calls: number;
    triangles: number;
    camera: [number, number, number];
    look: [number, number];
  };
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

test('the panels, the heroes, the table and the decor load; a hero is one draw call (D-41, D-43, D-44)', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    // R3F 9 on three 0.186 warns about THREE.Clock (BACKLOG); anything else is ours.
    if (m.type() === 'error' || (m.type() === 'warning' && !/THREE\.Clock/.test(m.text())))
      problems.push(m.text());
  });
  await page.goto(`./#/?k=${DEMO}`);
  await expect(page.locator('canvas')).toBeVisible();
  await settle(page);
  // At rest the camera frames a group of teams (D-42); the whole strip shows every hero.
  await page.getByRole('button', { name: 'Весь трек' }).click();
  // Six heroes add ~15 000 triangles to the board, the table and its props.
  await expect.poll(async () => (await stats(page))?.triangles ?? 0).toBeGreaterThan(15_000);
  await settle(page);
  const loaded = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e as PerformanceResourceTiming)
      .filter((e) => /\.(webp|glb)$/.test(e.name))
      .map((e) => e.responseStatus),
  );
  expect(loaded).toHaveLength(4 + 5 + 2); // four panels, five heroes, the props, the decor
  expect(loaded.every((status) => status === 200)).toBe(true);
  // The whole board in view: table 4, props 5, decor 2, panels, cells, gates, ambient 4, six heroes
  // (one call each), their shadows, rings and plates, pace flags; the budget is 120 (§12.1).
  const whole = await stats(page);
  expect(whole?.calls).toBeLessThanOrEqual(80);
  expect(whole?.triangles).toBeLessThanOrEqual(80_000); // the whole track in view (§12.1)
  expect(problems).toEqual([]);
});

test('a new day plays the moves, then the scene rests again (FR-MOVE-1)', async ({ page }) => {
  test.setTimeout(90_000); // the moves of six teams take ~20 s
  const [day, next] = await demoDays(page);
  await page.goto(`./#/?date=${day}`);
  await expect(page.locator('canvas')).toBeVisible();
  const rest = await settle(page);
  await page.goto(`./#/?date=${next}`);
  await page.waitForTimeout(3000);
  const moving = (await frames(page)) - rest;
  // The moves draw (the rate is QA-4's: CI's software WebGL manages ~12 FPS, a laptop 30).
  expect(moving).toBeGreaterThan(15);
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

test('a resize keeps the camera where the viewer put it (review 3a)', async ({ page }) => {
  await page.goto(`./#/?k=${DEMO}`);
  await expect(page.locator('canvas')).toBeVisible();
  await settle(page);
  await page.getByRole('button', { name: 'Весь трек' }).click();
  await settle(page);
  const before = (await stats(page))?.look;
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.waitForTimeout(1000);
  const after = (await stats(page))?.look;
  // Re-created controls used to turn the camera to the world origin (the strip's start).
  expect(Math.abs((after?.[0] ?? 0) - (before?.[0] ?? 0))).toBeLessThan(5);
  expect(after?.[0]).toBeGreaterThan(20);
});
