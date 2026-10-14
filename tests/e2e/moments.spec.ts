import { expect, test, type Page } from '@playwright/test';
import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { loadRepoState } from '../../src/admin/pipeline.ts';
import { computeGameState } from '../../src/engine/gameState.ts';
import { snapshotOf, type Snapshot } from '../../src/moments/snapshot.ts';
import { FakeGitHubRepo } from '../support/fakeGitHub.ts';

// D-56 end to end on the demo: «Что нового» from a snapshot put into the browser's storage, as a visit of
// 12.10 left it; the time is pinned so the demo's data are the same every run.
const DEMO = 'sales-quest-demo';
const NOW = '2026-10-14T12:00:00+03:00';
test.use({ viewport: { width: 1280, height: 720 } });

async function demo() {
  const { input } = await loadRepoState(FakeGitHubRepo.fromDir(DEMO_DATA), DEMO, new Map());
  const seen = snapshotOf(computeGameState(input, '2026-10-12T23:59:00+03:00'), input.config);
  return { input, seen, now: computeGameState(input, NOW) };
}

/** The map in 2D with the clock pinned; `seen` goes into the storage first; `hidden` — a hidden tab. */
async function open(
  page: Page,
  seen: Snapshot | null,
  opts: { hidden?: boolean; query?: string } = {},
) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(
    ([value, hidden]) => {
      if (value) localStorage.setItem('sq.seen.v1', value);
      if (hidden) {
        const w = window as Window & { __sqHidden?: boolean };
        w.__sqHidden = true;
        Object.defineProperty(document, 'visibilityState', {
          get: () => (w.__sqHidden ? 'hidden' : 'visible'),
        });
      }
    },
    [seen ? JSON.stringify({ [seen.seasonId]: seen }) : null, opts.hidden ?? false] as const,
  );
  await page.goto(`./#/?view=2d&k=${DEMO}${opts.query ?? ''}`);
  await expect(page.getByRole('img', { name: 'Схема трека' })).toBeVisible({ timeout: 30_000 });
}
const plate = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^(Что нового|Новые данные)/ });
const cell = (page: Page, teamId: string) =>
  page.locator(`[data-team="${teamId}"]`).first().getAttribute('data-cell');

test('«Что нового с прошлого визита»: the plate, who brought points, the cards, «Герои дня», a banner, the walk (D-56)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const { seen, now } = await demo();
  // The last team to walk: its token stands on the remembered cell while the others walk.
  const last = [...now.teams].reverse().find((t) => {
    const was = seen.teams.find((s) => s.teamId === t.teamId);
    return was !== undefined && was.position !== t.position;
  });
  if (!last) throw new Error('в демо никто не сдвинулся с 12.10 по 14.10');
  const was = seen.teams.find((s) => s.teamId === last.teamId)?.position;
  const fresh = now.unlocks.length - Object.values(seen.unlocks).reduce((a, b) => a + b, 0);
  expect(fresh, 'в демо нет новых ачивок с 12.10 по 14.10').toBeGreaterThan(0);

  await open(page, seen);
  // A new achievement's gem waits for its banner (D-58): held while the walk and the show play.
  const rating = page.getByRole('region', { name: 'Рейтинг операторов' });
  const held = async () => Number((await rating.getAttribute('data-held')) ?? '0');
  await expect.poll(held, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await cell(page, last.teamId)).toBe(String(was));
  const cards = page.getByRole('list', { name: 'Команды' });
  await expect(cards.getByText(/^· до шага ещё \d+/)).toHaveCount(6);
  await expect(
    page
      .getByRole('region', { name: 'Рейтинг операторов' })
      .getByRole('heading', { name: 'Герои дня' }),
  ).toBeVisible();
  // The walk first, then its story: the plate, the counts and the toasts wait for the figures (D-48).
  await expect(plate(page)).toHaveCount(0);
  await expect.poll(() => cell(page, last.teamId), { timeout: 40_000 }).toBe(String(last.position));
  await expect(plate(page)).toHaveText(/^Что нового с \d\d\.\d\d \d\d:\d\d$/, { timeout: 10_000 });
  await expect(
    page
      .getByRole('list', { name: 'Кто принёс баллы' })
      .getByText(/^\+\d+ балл/)
      .first(),
  ).toBeVisible();
  await expect(cards.getByText(/^\+\d+$/).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ачивка' }).first()).toBeVisible({
    timeout: 40_000,
  });
  expect(await held(), 'a gem must not spoil its banner').toBeGreaterThan(0);
  await expect.poll(held, { timeout: 60_000 }).toBe(0);
});

test('the first visit replays nothing and remembers what it showed (FR-MOVE-4, D-56)', async ({
  page,
}) => {
  const { now } = await demo();
  await open(page, null);
  const first = now.teams[0];
  if (!first) throw new Error('в демо нет команд');
  expect(await cell(page, first.teamId)).toBe(String(first.position));
  await page.waitForTimeout(3000);
  await expect(plate(page)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('sq.seen.v1'));
  expect(Object.keys(JSON.parse(stored ?? '{}'))).toEqual(['demo']);
});

test('a hidden tab keeps the show for later (D-56, PERF-3)', async ({ page }) => {
  const { seen } = await demo();
  await open(page, seen, { hidden: true });
  await page.waitForTimeout(3000);
  await expect(plate(page)).toHaveCount(0);
  await page.evaluate(() => {
    (window as Window & { __sqHidden?: boolean }).__sqHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(plate(page)).toHaveText(/^Что нового с /, { timeout: 40_000 });
});

test('a look at another day changes nothing: no plate, the remembered snapshot kept (D-56)', async ({
  page,
}) => {
  const { seen } = await demo();
  await open(page, seen, { query: '&date=2026-10-13' });
  await page.waitForTimeout(3000);
  await expect(plate(page)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('sq.seen.v1'));
  expect(JSON.parse(stored ?? '{}')).toEqual({ [seen.seasonId]: seen });
});

test('reduced motion: the card shows the result at once, nothing flashes (D-56)', async ({
  page,
}) => {
  const { seen, now } = await demo();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, seen);
  const t = now.teams[0];
  if (!t) throw new Error('в демо нет команд');
  const card = page.getByRole('list', { name: 'Команды' }).getByRole('listitem').first();
  // Digits only: the browser's and Node's group separators of «1 234» may differ.
  const digits = async () =>
    ((await card.locator('span.sq-bright').textContent()) ?? '').replace(/\D/g, '');
  expect(await digits()).toBe(String(Math.round(t.points)));
  await expect(page.locator('.sq-flash')).toHaveCount(0);
  // The tour: no sparks; the first team's counter shows its result from the start of its beat.
  await expect(page.locator('.sq-spark')).toHaveCount(0);
  const first = now.teams[0];
  const was = seen.teams.find((s) => s.teamId === first?.teamId);
  const gain = first && was ? Math.round(first.points - was.points) : 0;
  if (first && gain >= 1)
    await expect(
      page
        .locator(`[data-team="${first.teamId}"]`)
        .first()
        .getByText(/^\+\d+ балл/),
    ).toHaveText(new RegExp(`^\\+${gain} балл`), { timeout: 3000 });
});

test('a daytime portion without steps: the figure jumps and counts, then the story (D-57)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { input, now } = await demo();
  const seen = snapshotOf(now, input.config);
  // As if, a moment ago, one team and one of its operators had 12 points less — on the same cells.
  const team = seen.teams[seen.teams.length - 1];
  const operator = seen.managers.find((m) => m.teamId === team?.teamId);
  if (!team || !operator) throw new Error('в демо нет команды с операторами');
  const lowered = {
    ...seen,
    teams: seen.teams.map((t) => (t.teamId === team.teamId ? { ...t, points: t.points - 12 } : t)),
    managers: seen.managers.map((m) =>
      m.managerId === operator.managerId ? { ...m, points: m.points - 12 } : m,
    ),
  };
  await open(page, lowered);
  const token = page.locator(`[data-team="${team.teamId}"]`).first();
  await expect(token.locator('.sq-jump')).toHaveCount(1, { timeout: 20_000 });
  await expect(token.getByText(/^\+\d+ балл/)).toBeVisible();
  expect(await cell(page, team.teamId)).toBe(String(team.position));
  await expect(plate(page)).toHaveText(/^Что нового с /, { timeout: 30_000 });
});
