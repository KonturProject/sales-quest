import { expect, test, type Page } from '@playwright/test';

// The 2D scheme (GFX-6): the same game under the same HUD, without WebGL.
const DEMO = 'sales-quest-demo';
test.use({ viewport: { width: 1366, height: 768 } });

const scheme = (page: Page) => page.getByRole('img', { name: 'Схема трека' });
const tokens = (page: Page) =>
  page
    .locator('[data-team]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-cell'))));
/** «клетка N из M» of each team card. */
const cardCells = (page: Page) =>
  page
    .getByRole('list', { name: 'Команды' })
    .getByText(/^клетка \d+ из \d+/)
    .evaluateAll((els) => els.map((e) => Number(/клетка (\d+)/.exec(e.textContent ?? '')?.[1])));

test('?view=2d shows the scheme under the HUD and is remembered; the button brings the scene back', async ({
  page,
}) => {
  await page.goto(`./#/?k=${DEMO}&view=2d`);
  await expect(scheme(page)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('[data-team]')).toHaveCount(6);
  await expect(page.getByRole('list', { name: 'Команды' }).getByRole('listitem')).toHaveCount(6);
  expect([...(await tokens(page))].sort()).toEqual([...(await cardCells(page))].sort());

  await page.goto('./#/');
  await expect(scheme(page)).toBeVisible();
  await page.getByRole('button', { name: 'Объёмная карта' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(scheme(page)).toHaveCount(0);
});

test('without WebGL the map opens as the scheme, with no way to the scene', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      id: string,
      ...rest: unknown[]
    ) {
      return /webgl/.test(id) ? null : original.call(this, id as '2d', ...(rest as []));
    } as typeof original;
  });
  await page.goto(`./#/?k=${DEMO}`);
  await expect(scheme(page)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Объёмная карта' })).toHaveCount(0);
});

test('at the bottom of the quality ladder the HUD offers the scheme (D-45)', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('sq.quality', JSON.stringify({ level: 7, at: Date.now() })),
  );
  await page.goto(`./#/?k=${DEMO}`);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Карта идёт рывками');
  await page.getByRole('button', { name: 'Включить простую схему' }).click();
  await expect(scheme(page)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('a new day walks the tokens cell by cell to the new positions (FR-MOVE-1)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`./#/debug?k=${DEMO}`);
  const start = (await page.getByRole('heading').first().textContent())?.match(
    /(\d{4}-\d{2}-\d{2}) …/,
  )?.[1];
  const day = (n: number) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  await page.goto(`./#/?view=2d&date=${day(3)}`);
  await expect(page.locator('[data-team]')).toHaveCount(6);
  const before = await tokens(page);
  await page.evaluate((d) => (window.location.hash = `#/?view=2d&date=${d}`), day(4));
  const seen = before.map((cell) => new Set([cell]));
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(150);
    (await tokens(page)).forEach((cell, k) => seen[k]?.add(cell));
  }
  // Some team walked over cells in between, not jumping straight to the end.
  expect(Math.max(...seen.map((s) => s.size))).toBeGreaterThanOrEqual(3);
  await expect
    .poll(async () => [...(await tokens(page))].sort().join())
    .toBe([...(await cardCells(page))].sort().join());
});
