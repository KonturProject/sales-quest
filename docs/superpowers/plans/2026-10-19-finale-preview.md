# The finale's private preview and two finale fixes — Implementation Plan

> **For agentic workers:** executed inline in the authoring session (executing-plans with a ledger and TDD); an
> independent review subagent (opus) checks the whole plan at the end (Task 4). Steps use checkbox (`- [ ]`)
> syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md`.

**Goal:** the author rehearses the finale on the real data alone — the admin's «Посмотреть финал» shows the
results screen and plays the ceremony as a closing now would, nothing written anywhere; and two finale fixes: the
«лучший в команде» card never cuts the leader's name, and co-winners stand side by side on one wide step.

**Architecture:** `previewFinale(input, now)` in `src/admin/finale.ts` closes the game in memory and computes
`finaleOrNull` from it. A new admin screen `FinalePreview.tsx` covers the admin's window with the same
`FinaleLayer` in a `preview` mode: results first, the ceremony on a button, no browser memory (`sq.finale.v1`), no
camera or fireworks requests. `TeamBest` carries the group and the leader apart; `podiumColumns` lays the podium
out as three steps, each with all the teams of its place side by side.

**Tech Stack:** React 19, TypeScript 6 strict, Tailwind 4 + `src/hud/theme.css`, Vitest, Playwright 1.63.

**Spec:** agreed in chat with the author on 19.10.2026 (a small change, no written design):
- a button «Посмотреть финал» on the admin's home while the game runs;
- the same results screen as everyone will see, on the data as they stand now, under a banner «Предпросмотр —
  видите только вы, ничего не записано»;
- «Проиграть церемонию» — the same minute over the whole admin window; no fireworks or camera there (no map);
- nothing written — not to the game, not to the browser's memory: on Monday after «Подвести итоги» the ceremony
  plays for the author as for everyone;
- the card «лучший в команде»: the group's code on top, the leader's name under it, then the best operator and
  the points — nothing cut;
- a tie for first: the winners stand side by side on one wide step, not one above the other.

The finale itself: `docs/superpowers/specs/2026-10-18-game-finale-design.md`, D-59.

## Global Constraints

- Russian UI text, English code comments; the HUD's rules (D-46): `sq-*` classes, no `backdrop-filter`, blurred
  shadows or glow.
- The admin stays a lazy chunk (D-7a): `FinalePreview.tsx` is imported only by `AdminPage.tsx`; the viewers'
  initial JS stays ≤ 600 KB gzip.
- The preview never commits, never writes `localStorage` (`sq.finale.v1`), never calls `requestCamera` /
  `requestCelebration`.
- No real names anywhere in code, tests, docs or commits (demo and builder names only).

## Review Focus

1. **The preview after a real closing in the same page** — the preview's `FinaleLayer` must not have marked the
   real closing as seen or fired its fireworks: the module-level `fired` set and `replays` counter are shared.
2. **A preview opened on a closed game** — the button is hidden when the status is `closed`; the map shows the
   real finale.
3. **A finale that cannot be computed in the preview** (`finaleOrNull` → null) — a plain message, not a crash of
   the admin.
4. **Ties beyond first** — two seconds, three firsts, a tie for third: every place one step, its teams side by
   side; an empty place keeps its column so the winners stay in the middle.
5. **Long names** on the podium and the cards at 1024 px and in the ceremony's narrower panel — wrapped, never cut.

---

### Task 1: The results — group and leader apart, the podium's columns

**Где смотреть:** `src/finale/results.ts` (`TeamBest`, `bestInTeams`, `PodiumPlace`), `src/text.ts`
(`plateName`), `tests/unit/finale/results.test.ts`, NAVIGATOR §11.

**Files:**
- Modify: `src/finale/results.ts`
- Test: `tests/unit/finale/results.test.ts`

**Interfaces:**
- Produces: `TeamBest` = `{ teamId; group: string; leader: string; color; managerId; name; points }` (no
  `teamTitle`); `type PodiumColumn = { place: number; slot: number; teams: { team: PodiumPlace; index: number }[] }`;
  `podiumColumns(podium: PodiumPlace[]): PodiumColumn[]` — the places 1, 2, 3 in this order (the reading order),
  `slot` — the column left to right (2nd → 0, 1st → 1, 3rd → 2), `index` — the team's index in `podium`.

- [ ] **Step 1: Write the failing tests**

In `describe('the best in each team (D-59)')`:

```ts
  it('the card carries the group and the leader apart: nothing to cut (D-60)', () => {
    const config = makeConfig({
      teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2)],
      managers: [manager('a', 't1'), manager('b', 't2')],
    });
    const g = game(config, [
      daily('a', '2026-10-06', { pay: 1 }),
      daily('b', '2026-10-06', { pay: 1 }),
    ]);
    expect(bestInTeams(g, config).map((b) => [b.group, b.leader])).toEqual([
      ['СР1', 'Руководитель 1'],
      ['', 'Руководитель 2'],
    ]);
  });
```

A new describe:

```ts
describe('the podium’s steps (D-60)', () => {
  const place = (n: number, teamId: string): PodiumPlace => ({
    place: n,
    teamId,
    title: teamId,
    color: '#888888',
    position: 10,
    progress: 0.5,
  });
  const laid = (podium: PodiumPlace[]) =>
    podiumColumns(podium).map((c) => [c.place, c.slot, c.teams.map((t) => t.team.teamId)]);

  it('one team a place: second left, first in the middle, third right; read 1, 2, 3', () => {
    expect(laid([place(1, 'a'), place(2, 'b'), place(3, 'c')])).toEqual([
      [1, 1, ['a']],
      [2, 0, ['b']],
      [3, 2, ['c']],
    ]);
  });

  it('a tie for first: the winners side by side on the middle step; no second', () => {
    const columns = podiumColumns([place(1, 'a'), place(1, 'b'), place(3, 'c')]);
    expect(columns.map((c) => [c.place, c.teams.map((t) => [t.team.teamId, t.index])])).toEqual([
      [1, [['a', 0], ['b', 1]]],
      [2, []],
      [3, [['c', 2]]],
    ]);
  });

  it('ties further down share their step too', () => {
    expect(laid([place(1, 'a'), place(2, 'b'), place(2, 'c')])).toEqual([
      [1, 1, ['a']],
      [2, 0, ['b', 'c']],
      [3, 2, []],
    ]);
  });
});
```

(imports: `podiumColumns`, `type PodiumPlace` from `results.ts`.)

- [ ] **Step 2: Run them — they fail**

Run: `npx vitest run tests/unit/finale/results.test.ts`
Expected: FAIL — `podiumColumns` is not exported; `b.group` undefined.

- [ ] **Step 3: Implement**

`TeamBest`: replace `teamTitle` with

```ts
  /** The group's code from the exports («СР6»); empty when the team has none. */
  group: string;
  /** The team's leader — the figure's hero. */
  leader: string;
```

and in `bestInTeams`: `group: team.sourceCode ?? '', leader: team.leaderName,`.

After `podiumOf`:

```ts
/** A step of the podium: every team of its place stands on it side by side. */
export type PodiumColumn = {
  place: number;
  /** The column left to right: the second place, the first, the third. */
  slot: number;
  /** The teams of the place, with their index in the podium (the ceremony reveals by it). */
  teams: { team: PodiumPlace; index: number }[];
};

/**
 * The podium laid out (D-60): three steps in the reading order 1, 2, 3, shown second–first–third; a tie stands
 * side by side on its step (two winners on one wide first step). An empty place keeps its step's column, so the
 * winners stay in the middle.
 */
export function podiumColumns(podium: PodiumPlace[]): PodiumColumn[] {
  return [1, 2, 3].map((place) => ({
    place,
    slot: place === 2 ? 0 : place === 1 ? 1 : 2,
    teams: podium.flatMap((team, index) => (team.place === place ? [{ team, index }] : [])),
  }));
}
```

- [ ] **Step 4: Run them — they pass**

Run: `npx vitest run tests/unit/finale/results.test.ts`
Expected: PASS. `npm run typecheck` then fails in `src/hud/Finale.tsx` (`teamTitle`) — fixed in Task 2.

- [ ] **Step 5: Commit (with Task 2's first step, so the tree typechecks)**

---

### Task 2: The finale's screen — the card, the podium, the preview mode

**Где смотреть:** `src/hud/Finale.tsx` (`FinaleLayer`, `Results`, `Podium`, `BestCards`), `src/hud/theme.css`
(`.sq-step-*`), `tests/e2e/finale.spec.ts`, `tests/e2e/visual.spec.ts` (`finale`), NAVIGATOR §11.

**Files:**
- Modify: `src/hud/Finale.tsx`
- Test: `tests/e2e/finale.spec.ts`, QA-6 baseline `tests/e2e/visual.spec.ts-snapshots/finale-e2e-win32.png`

**Interfaces:**
- Consumes: `podiumColumns`, `TeamBest.group`, `TeamBest.leader` (Task 1).
- Produces: `FinaleLayer({ finale, config, tv, preview? })` — `preview: true`: the results first, the button
  «Проиграть церемонию», nothing remembered, no camera or fireworks requests, the ceremony in the middle.

- [ ] **Step 1: Write the failing e2e** in `tests/e2e/finale.spec.ts`:

```ts
test('the results name the group, then its leader on a line of its own; the podium reads its places (D-60)', async ({
  page,
}) => {
  await open(page, await closedDemo(), 'view=2d', true);
  await expect(results(page)).toBeVisible({ timeout: 30_000 });
  const card = results(page).getByRole('list', { name: 'Лучшие в командах' }).getByRole('listitem').first();
  await expect(card.getByText(/^лучший в /)).not.toContainText('•');
  await expect(
    results(page).getByRole('list', { name: 'Пьедестал' }).getByRole('listitem').first(),
  ).toContainText('1 место');
});
```

- [ ] **Step 2: Run it — it fails**

Run: `npx playwright test finale --project=e2e -g "D-60"`
Expected: FAIL — the card reads «лучший в СР1 • …».

- [ ] **Step 3: Implement** in `src/hud/Finale.tsx`:

`BestCards` — the card wraps, never cuts:

```tsx
        <li
          key={b.teamId}
          className={`sq-plate px-2 py-1 text-left wrap-break-word ${visible(i) ? 'sq-moment-in' : 'invisible'}`}
        >
          <div className="sq-note">лучший в {b.group || 'команде'}</div>
          <div className="sq-muted text-xs">{b.leader}</div>
          <div className="sq-name text-sm">{b.name}</div>
          <div className="sq-muted text-xs">{fmt(b.points)}</div>
        </li>
```

`Podium` — one step per place, its teams side by side; DOM in the reading order, CSS `order` for 2-1-3:

```tsx
/** Second left, first in the middle, third right; a tie stands side by side on its step (D-60). */
function Podium({ places, visible }: { places: PodiumPlace[]; visible: (i: number) => boolean }) {
  return (
    <div role="list" aria-label="Пьедестал" className="flex items-end gap-2">
      {podiumColumns(places).map((column) => (
        <div
          key={column.place}
          className="flex min-w-0 basis-0 flex-col justify-end gap-1"
          style={{ order: column.slot, flexGrow: Math.max(1, column.teams.length) }}
        >
          <div className="flex items-end gap-1">
            {column.teams.map(({ team, index }) => (
              <div
                key={team.teamId}
                role="listitem"
                className={`min-w-0 flex-1 text-center ${visible(index) ? 'sq-moment-in' : 'invisible'}`}
              >
                <span className="sr-only">{team.place} место: </span>
                <Crest color={team.color} size={column.place === 1 ? 34 : 28} className="mx-auto" />
                <div className="sq-name text-sm wrap-break-word">{team.title}</div>
                <div className="sq-note">
                  клетка {team.position} · {pct(team.progress)} плана
                </div>
              </div>
            ))}
          </div>
          {column.teams.length > 0 && (
            <div
              aria-hidden="true"
              className={`sq-step sq-step-${String(column.place)} ${
                column.teams.some((t) => visible(t.index)) ? 'sq-moment-in' : 'invisible'
              }`}
            >
              {column.place}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

`FinaleLayer` gets `preview = false` with a doc line; in it:
- `pending()` → `preview ? null : (readFinaleSeen(...) === closedAt ? null : { closedAt, n: 0 })`;
- the fireworks effect returns at once when `preview`;
- the seen effect writes only when `!preview`;
- the wrapper: `items-end` only when `playing && !preview`;
- `Results` gets `replay={preview ? 'Проиграть церемонию' : 'Посмотреть церемонию ещё раз'}`.

- [ ] **Step 4: Run** `npx playwright test finale --project=e2e` — Expected: all pass (the new one included).

- [ ] **Step 5: QA-6 baseline:** `npx playwright test visual -g finale --update-snapshots`, look at the new
  `finale` baseline (the cards' two lines, the podium unchanged for a 1-2-3), then
  `npm run typecheck && npm run lint && npm test`.

- [ ] **Step 6: Commit** Task 1 and Task 2 together:
  `git commit -m "Finale: «лучший в» names the group and its leader apart, a tie stands side by side on its step (D-60)"`

---

### Task 3: The admin's «Посмотреть финал»

**Где смотреть:** `src/admin/finale.ts`, `src/admin/Home.tsx`, `src/admin/AdminPage.tsx`, `src/admin/FinaleAdmin.tsx`
(how a now is held), `tests/unit/admin/finale.test.ts`, `tests/e2e/admin.spec.ts` (the D-59 tests), NAVIGATOR §3.

**Files:**
- Modify: `src/admin/finale.ts`, `src/admin/Home.tsx`, `src/admin/AdminPage.tsx`
- Create: `src/admin/FinalePreview.tsx`
- Test: `tests/unit/admin/finale.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `closeGame`, `finaleOrNull`, `computeGameState`, `FinaleLayer({ preview })` (Task 2).
- Produces: `previewFinale(input: EngineInput, now: string): Finale | null`; `Home`'s new prop `onPreview`; View
  `'preview'`.

- [ ] **Step 1: Write the failing unit test** in `tests/unit/admin/finale.test.ts`:

```ts
describe('«Посмотреть финал» (D-60)', () => {
  it('the finale as a closing now would show it; the data are not changed', () => {
    const people = makeConfig({
      teams: [team('t1', 1), team('t2', 2)],
      managers: [manager('a', 't1'), manager('b', 't2')],
    });
    const running: EngineInput = {
      config: people,
      records: [daily('a', '2026-10-06', { pay: 2 }), daily('b', '2026-10-06', { pay: 1 })],
      adjustments: [],
      imports: [],
    };
    const finale = previewFinale(running, '2026-10-14T10:00:00+03:00');
    expect(finale?.closedAt).toBe('2026-10-14T10:00:00+03:00');
    expect(finale?.podium.map((p) => p.teamId)).toEqual(['t1', 't2']);
    expect(running.config.status).toBe('active');
    expect('closedAt' in running.config).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin/finale.test.ts` — Expected: FAIL, `previewFinale` is not
  exported.

- [ ] **Step 3: Implement** in `src/admin/finale.ts`:

```ts
/**
 * «Посмотреть финал» (D-60): the finale as a closing now would show it, on the data as they stand — computed in
 * memory, nothing written; null when it cannot be computed.
 */
export function previewFinale(input: EngineInput, now: string): Finale | null {
  const closed = closeGame(input, now);
  return finaleOrNull(computeGameState(closed, now), closed.config, closed.adjustments);
}
```

- [ ] **Step 4: Run** the unit test — Expected: PASS.

- [ ] **Step 5: Write the failing e2e** in `tests/e2e/admin.spec.ts`:

```ts
test('«Посмотреть финал»: the results and the ceremony on the data now, for the admin alone — nothing written (D-60)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The demo's game runs 05.10–18.10: on the 15th it cannot be closed yet, but it can be previewed.
  await page.clock.install({ time: new Date('2026-10-15T12:00:00+03:00') });
  const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
  await login(page, fake);
  const commits = fake.commits.length;
  await expect(page.getByRole('button', { name: 'Подвести итоги' })).toBeDisabled();
  await page.getByRole('button', { name: 'Посмотреть финал' }).click();
  const screen = page.getByTestId('finale-preview-screen');
  await expect(screen).toContainText('видите только вы');
  const results = screen.getByRole('region', { name: 'Итоги игры' });
  await expect(results.getByRole('list', { name: 'Пьедестал' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Посмотреть церемонию ещё раз' })).toHaveCount(0);
  await screen.getByRole('button', { name: 'Проиграть церемонию' }).click();
  await expect(screen.getByRole('region', { name: 'Церемония' })).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(results).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sq.finale.v1'))).toBeNull();
  await screen.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByTestId('admin-home')).toBeVisible();
  expect(fake.commits.length).toBe(commits);
});
```

- [ ] **Step 6: Run** `npx playwright test admin --project=e2e -g "D-60"` — Expected: FAIL, no button «Посмотреть
  финал».

- [ ] **Step 7: Implement**

`src/admin/FinalePreview.tsx`:

```tsx
import { useState } from 'react';
import { localTimestamp } from '../data/time.ts';
import { FinaleLayer } from '../hud/Finale.tsx';
import { previewFinale } from './finale.ts';
import type { Session } from './session.ts';

/**
 * «Посмотреть финал» (D-60): the author rehearses the finale alone — the results screen and the ceremony as a
 * closing now would show them, over the whole admin window. Nothing is written: not the game, not the browser's
 * memory of the ceremony; no map, so no fireworks.
 */
export function FinalePreview({ session, onClose }: { session: Session; onClose: () => void }) {
  const [now] = useState(() => localTimestamp(new Date()));
  const [finale] = useState(() => previewFinale(session.state.input, now));
  return (
    <div
      className="sq-screen sq-ui fixed inset-0 z-30 flex flex-col gap-2 p-4"
      data-testid="finale-preview-screen"
    >
      <div className="sq-plate flex flex-wrap items-center gap-3 px-3 py-1.5">
        <span>
          Предпросмотр финала — видите только вы, ничего не записано. Цифры — на сейчас; итоговые — после
          последней загрузки.
        </span>
        <button className="sq-button ml-auto" onClick={onClose}>
          Закрыть
        </button>
      </div>
      {finale ? (
        <FinaleLayer finale={finale} config={session.state.input.config} tv={false} preview />
      ) : (
        <p role="alert" className="sq-plate sq-plate-alarm px-3 py-1.5">
          Финал сейчас не посчитать — проверьте данные игры.
        </p>
      )}
    </div>
  );
}
```

`Home.tsx`: prop `onPreview: () => void` («Посмотреть финал», D-60); after the «Подвести итоги» button, while
`!closed`:

```tsx
        {!closed && (
          <button className="sq-button" onClick={onPreview}>
            Посмотреть финал
          </button>
        )}
```

and the hint: «Итоги можно подвести с последнего дня игры (ДД.ММ) — после последней загрузки. Заранее — «Посмотреть
финал»: его видите только вы.»

`AdminPage.tsx`: `type View = … | 'preview'`; `onPreview={() => setView('preview')}`; render
`view === 'preview' ? <FinalePreview session={session} onClose={() => setView('home')} />`.

- [ ] **Step 8: Run** `npx playwright test admin --project=e2e -g "D-59|D-60"` — Expected: PASS; then
  `npm run typecheck && npm run lint && npm test`, `npm run build && npm run size` (the admin chunk, the viewers ≤ 600).

- [ ] **Step 9: Commit**
  `git commit -m "Admin: «Посмотреть финал» — the results and the ceremony on the data now, for the author alone (D-60)"`

---

### Task 4: Docs and review

- [ ] DECISIONS D-60; NAVIGATOR §3 (the preview), §11 (`podiumColumns`, the card, `preview`), §16; BACKLOG: «Сделано:
  предпросмотр финала (D-60)», the two D-59 minors (tie, «лучший в») and the podium's reading order closed; CLAUDE.md
  stage line.
- [ ] Commit `Docs: the finale's preview and fixes (D-60)`.
- [ ] Independent review (opus) of the plan's range; fixes RED→GREEN; deferred minors to BACKLOG.
