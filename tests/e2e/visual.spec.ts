import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * QA-6: the look of the scene, the HUD and the 2D scheme on the demo (D-32) compared with baselines.
 * The baselines are made on the author's PC (win32, D-45); CI's Linux renders fonts and software
 * WebGL differently, so there the shots are skipped until a Linux baseline is added (D-39). Update:
 * `npx playwright test visual --update-snapshots` — and look at the new pictures before committing.
 */

const DEMO = 'sales-quest-demo';
type Probe = Window & { __sqFrames?: number; __sqLoading?: number };
const frames = (page: Page) => page.evaluate(() => (window as Probe).__sqFrames ?? 0);
/** Frames asked for and not drawn yet: with one waiting, a quiet counter is not rest. */
const pending = (page: Page) =>
  page.evaluate(() => (window as Window & { __sqPending?: () => number }).__sqPending?.() ?? 0);

test.use({ viewport: { width: 1280, height: 720 } });

/** A fixed day of the demo, so the same positions every time. */
async function demoDay(page: Page): Promise<string> {
  await page.goto(`./#/debug?k=${DEMO}`);
  const start = (await page.getByRole('heading').first().textContent())?.match(
    /(\d{4}-\d{2}-\d{2}) …/,
  )?.[1];
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Files of a kind fetched so far (the panels' art: webp; the models: glb). */
const fetched = (page: Page, kind: RegExp) =>
  page.evaluate(
    (source) =>
      performance.getEntriesByType('resource').filter((e) => new RegExp(source).test(e.name))
        .length,
    kind.source,
  );

/**
 * All eleven files of the scene fetched and applied (before any load starts the counter reads 0,
 * so the count of files comes first — review 3c), then no frame for 1.5 s.
 */
async function rest(page: Page) {
  await expect.poll(() => fetched(page, /\.(webp|glb)$/), { timeout: 30_000 }).toBe(11);
  await expect
    .poll(() => page.evaluate(() => (window as Probe).__sqLoading ?? 0), { timeout: 30_000 })
    .toBe(0);
  let last = await frames(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const now = await frames(page);
    if (now === last && (await pending(page)) === 0) return;
    last = now;
  }
  throw new Error('the scene never came to rest');
}

/** What changes by itself: the time of the last check, the rating slide's text (D-38). */
const moving = (page: Page) => [
  page.getByText(/^проверено \d\d:\d\d$/),
  page.getByRole('region', { name: 'Рейтинг операторов' }).getByRole('heading'),
  page.getByRole('region', { name: 'Рейтинг операторов' }).getByRole('list'),
  page.getByRole('region', { name: 'Рейтинг операторов' }).locator('.sq-note'),
];
const SHOT = { maxDiffPixelRatio: 0.01 };

// eslint-disable-next-line no-empty-pattern -- Playwright passes fixtures first; none needed here
test.beforeEach(({}, testInfo) => {
  const baseline = testInfo.snapshotPath(`${testInfo.title.split(' ')[0]}.png`);
  const updating = ['all', 'changed'].includes(testInfo.config.updateSnapshots);
  test.skip(!updating && !existsSync(baseline), `no ${process.platform} baseline yet`);
});

test('rest — the scene at rest under the HUD (QA-6)', async ({ page }) => {
  const day = await demoDay(page);
  await page.goto(`./#/?date=${day}`);
  await expect(page.locator('canvas')).toBeVisible();
  await rest(page);
  await expect(page).toHaveScreenshot('rest.png', { ...SHOT, mask: moving(page) });
});

test('whole — the whole track (QA-6)', async ({ page }) => {
  const day = await demoDay(page);
  await page.goto(`./#/?date=${day}`);
  await expect(page.locator('canvas')).toBeVisible();
  await rest(page);
  await page.getByRole('button', { name: 'Весь трек' }).click();
  await rest(page);
  await expect(page).toHaveScreenshot('whole.png', { ...SHOT, mask: moving(page) });
});

test('scheme — the 2D scheme (QA-6, GFX-6)', async ({ page }) => {
  const day = await demoDay(page);
  await page.goto(`./#/?view=2d&date=${day}`);
  await expect(page.getByRole('img', { name: 'Схема трека' })).toBeVisible();
  // The four panels' art fetched; the screenshot itself waits until two shots in a row agree.
  await expect.poll(() => fetched(page, /\.webp$/), { timeout: 30_000 }).toBe(4);
  await expect(page).toHaveScreenshot('scheme.png', { ...SHOT, mask: moving(page) });
});
