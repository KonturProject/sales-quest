import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * QA-4: the CPU slowed ×4 (Chrome DevTools Protocol), a 1366×768 window, Low quality, software
 * WebGL (SwiftShader, a pessimistic stand-in for Intel HD, D-7). During moves ≥ 28 FPS within the
 * draw-call and triangle budgets of §12.1; a hidden tab keeps the frame counter flat for 10 s.
 */

type Probe = Window & {
  __sqFrames?: number;
  __sqStats?: { calls: number; triangles: number };
};
const frames = (page: Page) => page.evaluate(() => (window as Probe).__sqFrames ?? 0);
const stats = (page: Page) => page.evaluate(() => (window as Probe).__sqStats ?? null);
const DEMO = 'sales-quest-demo';

async function settle(page: Page) {
  let last = await frames(page);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1500);
    const now = await frames(page);
    if (now === last) return now;
    last = now;
  }
  throw new Error('the scene never came to rest');
}

test.use({ viewport: { width: 1366, height: 768 } });

test('QA-4: ≥ 28 FPS during moves on a CPU slowed ×4, within the budgets; 0 frames hidden', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto(`./#/debug?k=${DEMO}`);
  const start = (await page.getByRole('heading').first().textContent())?.match(
    /(\d{4}-\d{2}-\d{2}) …/,
  )?.[1];
  const day = (n: number) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  await page.goto(`./#/?date=${day(3)}`);
  await expect(page.locator('canvas')).toBeVisible();
  await settle(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // The next day: every team moves, one after another — about 15 s of animation.
  await page.evaluate((d) => (window.location.hash = `#/?date=${d}`), day(4));
  await page.waitForTimeout(1500);
  const f0 = await frames(page);
  const t0 = Date.now();
  let worst = { calls: 0, triangles: 0 };
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const s = await stats(page);
    if (s)
      worst = {
        calls: Math.max(worst.calls, s.calls),
        triangles: Math.max(worst.triangles, s.triangles),
      };
  }
  const fps = ((await frames(page)) - f0) / ((Date.now() - t0) / 1000);

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const rest = await settle(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate((d) => (window.location.hash = `#/?date=${d}`), day(5));
  await page.waitForTimeout(10_000);
  const hiddenFrames = (await frames(page)) - rest;

  const report = { fps: Math.round(fps * 10) / 10, ...worst, hiddenFrames };
  // The QA-4 report: a CI artifact (test-results/).
  writeFileSync(testInfo.outputPath('qa4.json'), JSON.stringify(report, null, 2));
  console.log(`QA-4 ${JSON.stringify(report)}`);

  expect(fps).toBeGreaterThanOrEqual(28);
  expect(worst.calls).toBeLessThanOrEqual(120);
  expect(worst.triangles).toBeLessThanOrEqual(80_000);
  expect(hiddenFrames).toBeLessThanOrEqual(1); // at most the one render of the new data
});
