import { expect, test, type Page } from '@playwright/test';
import { closeGame, reopenGame } from '../../src/admin/finale.ts';
import { DEMO_PHRASE, commitDemo, demoRepo } from '../support/closedDemo.ts';
import { serveSiteData, type FakeGitHubRepo } from '../support/fakeGitHub.ts';

// D-59 end to end on the demo (its game ends 18.10), closed through the admin's commit path.
const NOW = '2026-10-19T12:00:00+03:00';
const CLOSED = '2026-10-19T11:00:00+03:00';
test.use({ viewport: { width: 1280, height: 720 } });

const ceremony = (page: Page) => page.getByRole('region', { name: 'Церемония' });
const results = (page: Page) => page.getByRole('region', { name: 'Итоги игры' });
const rating = (page: Page) => page.getByRole('region', { name: 'Рейтинг операторов' });

async function closedDemo(): Promise<FakeGitHubRepo> {
  const fake = demoRepo();
  await commitDemo(fake, (i) => closeGame(i, CLOSED), NOW);
  return fake;
}

/** The map with a fake clock (the ceremony's minute is jumped over); `seen` — the ceremony already played. */
async function open(page: Page, fake: FakeGitHubRepo, query = 'view=2d', seen = false) {
  await page.clock.install({ time: new Date(NOW) });
  if (seen)
    await page.addInitScript((at) => {
      localStorage.setItem('sq.finale.v1', JSON.stringify({ demo: at }));
    }, CLOSED);
  await serveSiteData(page, fake);
  await page.goto(`./#/?${query}&k=${DEMO_PHRASE}`);
}

test('a closed game plays the ceremony once, then the results stay (D-59)', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, await closedDemo());
  await expect(ceremony(page).getByRole('heading', { name: 'Игра завершена' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(rating(page)).toHaveCount(0);
  await page.clock.runFor(60_000);
  await expect(results(page)).toBeVisible({ timeout: 10_000 });
  await expect(ceremony(page)).toHaveCount(0);
  await expect(
    results(page).getByRole('list', { name: 'Пьедестал' }).getByRole('listitem'),
  ).toHaveCount(3);
  await expect(
    results(page).getByRole('list', { name: 'Лучшие из лучших' }).getByRole('listitem'),
  ).toHaveCount(3);
  await expect(
    results(page)
      .getByText(/^лучший в /)
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(results(page)).toBeVisible({ timeout: 30_000 });
  await expect(ceremony(page)).toHaveCount(0);
});

test('«Посмотреть церемонию ещё раз» on a laptop; none on the wall screen (D-59)', async ({
  page,
}) => {
  const fake = await closedDemo();
  await open(page, fake, 'view=2d&mode=tv', true);
  await expect(results(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Посмотреть церемонию ещё раз' })).toHaveCount(0);
  await page.goto(`./#/?view=2d&k=${DEMO_PHRASE}`);
  await page.getByRole('button', { name: 'Посмотреть церемонию ещё раз' }).click();
  await expect(ceremony(page)).toBeVisible();
});

test('a look at another day shows the map (D-59)', async ({ page }) => {
  await open(page, await closedDemo(), 'view=2d&date=2026-10-15', true);
  await expect(rating(page)).toBeVisible({ timeout: 30_000 });
  await expect(results(page)).toHaveCount(0);
  await expect(ceremony(page)).toHaveCount(0);
});

test('the results follow the data; a reopened game shows the map (D-59)', async ({ page }) => {
  test.setTimeout(90_000);
  const fake = await closedDemo();
  await open(page, fake, 'view=2d', true);
  const payments = results(page).getByText(/^Оплаты: /);
  await expect(payments).toBeVisible({ timeout: 30_000 });
  const count = async () => Number(((await payments.textContent()) ?? '').replace(/\D/g, ''));
  const before = await count();
  await commitDemo(
    fake,
    (i) => {
      const first = i.records[0];
      if (!first) throw new Error('в демо нет записей');
      return {
        ...i,
        records: [...i.records, { ...first, date: '2026-10-16', values: { pay: 99 } }],
      };
    },
    NOW,
  );
  await page.getByRole('button', { name: 'Обновить' }).click();
  await expect.poll(count, { timeout: 20_000 }).toBeGreaterThan(before);
  await expect(page.getByRole('list', { name: 'Кто принёс баллы' })).toHaveCount(0);

  await commitDemo(fake, reopenGame, NOW);
  await page.getByRole('button', { name: 'Обновить' }).click();
  await expect(rating(page)).toBeVisible({ timeout: 20_000 });
  await expect(results(page)).toHaveCount(0);
});

test('the scene rests after the ceremony’s fireworks (D-59, PERF-1)', async ({ page }) => {
  test.setTimeout(90_000);
  // A real clock: the scene's frames are measured.
  const fake = await closedDemo();
  await page.addInitScript((at) => {
    localStorage.setItem('sq.finale.v1', JSON.stringify({ demo: at }));
  }, CLOSED);
  await serveSiteData(page, fake);
  await page.goto(`./#/?view=3d&k=${DEMO_PHRASE}`);
  await expect(results(page)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Посмотреть церемонию ещё раз' }).click();
  await expect(ceremony(page)).toBeVisible();
  const frames = () =>
    page.evaluate(() => (window as Window & { __sqFrames?: number }).__sqFrames ?? 0);
  // The first fireworks live ~2 s; the ceremony goes on as plain DOM — the scene stops drawing.
  await page.waitForTimeout(6000);
  const a = await frames();
  await page.waitForTimeout(2000);
  expect(await frames()).toBe(a);
  await expect(ceremony(page)).toBeVisible();
});
