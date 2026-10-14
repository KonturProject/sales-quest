# Achievements always on view — Implementation Plan

> **For agentic workers:** executed inline in the authoring session (the project's process: executing-plans
> with a ledger and TDD), an independent review subagent (opus) checks the whole plan at the end (Task 7).
> Steps use checkbox (`- [ ]`) syntax. Before each task: its «Где смотреть» block and `docs/NAVIGATOR.md`.

**Goal:** a manager's rare, epic and legendary achievements stay on view: round rarity gems by the name in
every row of the rotating rating, the team's achievements under its slide's heading, and a «Доска почёта»
slide; a gem from a new portion of data appears only after its banner, with one glint.

**Architecture:** a pure `src/hud/badges.ts` turns `game.unlocks` and `config.achievements` into badges, team
badges and the board's rows; `ratingSlides` (`src/hud/rating.ts`) puts them into the slides and adds the board
after the top 10. The rating holds back the unlocks of the latest batch of moments until that batch's show is
over — read from the run clocks without starting them (`useRunOver`, `src/hud/clock.ts`) — and the gems draw
in `src/hud/Badges.tsx`. The engine, the data, the import and the admin do not change.

**Tech Stack:** React 19, TypeScript 6 strict, Tailwind 4 + `src/hud/theme.css`, Vitest, Playwright 1.63
(`page.clock.install`/`fastForward`, `page.clock.setFixedTime`, `addInitScript`).

**Spec:** `docs/superpowers/specs/2026-10-14-achievement-badges-design.md` (approved 14.10.2026) — parts 1–6;
SPEC ACH-1, ACH-5, FR-LB-1, PERF-1; DECISIONS D-27, D-38, D-46, D-54, D-56.

**Refinements of the spec made here:**
- The holders' tie on the same day sorts by the full name (`ru`), then shows the short one.
- A gem glints only by a name and in the team's line; the board's rows do not glint (the board lists
  achievements, not people's new gems).
- The rating's `<section>` carries `data-held` — the number of unlocks held back right now — for the e2e test
  (as the scheme's tokens carry `data-team`/`data-cell`).
- `SlideView` is keyed by the slide's index, so a slide shown again mounts afresh and a fresh gem's
  «first time on view» is real.

## Global Constraints

- The engine (`src/engine`), the data files, the import and the admin do not change.
- PERF-1: no per-frame work; plain DOM redrawn with the data and the 15-second slides; one CSS animation per
  fresh gem, played once; no `backdrop-filter`, blurred shadows or glow (D-46).
- `prefers-reduced-motion: reduce`: a gem appears without a glint.
- Constants: `BADGES = 3`, `HONOR_PER_SLIDE = 6`, `HONOR_NAMES = 3`; the slide period stays `SLIDE_MS`.
- Rarity colours — those of the banners' emblems: rare `#a9d3ff → #2f5f96`, epic `#e0b3ff → #6b2f96`,
  legendary `#ffe08a → #a8641c`.
- The viewers' initial JS stays under 600 KB gzip (`npm run size`); `src/scheme` stays a lazy chunk — the HUD
  must not import from it.
- No real names anywhere in the repo; tests use invented names, builders and the demo.
- Russian UI text, English code comments, relative imports with `.ts`/`.tsx`; local commits approved, the push
  only after the author's «да» (D-3).

## Review Focus

1. **A repeatable achievement taken again in the new batch** — the older week's unlock keeps the gem on view
   while the new one is held (never a gem that vanishes during the show) — Task 4 test «an older week of a
   repeatable stays on view».
2. **A batch waiting in the queue behind another show** — its unlocks stay held: a run never started reads «not
   over» — Task 4 test «a run never started is not over».
3. **An unlock of an achievement no longer in the config, disabled, or of an operator not in the game** — no
   gem, no board row, no crash — Task 1 test «disabled and unknown achievements give none», Task 2 test «an
   operator not in the game is skipped».
4. **The same title on several team achievements** («Первопроходец» ×3) — one entry, its count — Task 1 test
   «team titles fold».
5. **A board longer than a slide** — a second page «2/2», never a clipped list — Task 2 test «six to a page».

---

### Task 1: Badges by the name and the team's badges (pure)

**Где смотреть:** спецификация, части 1, 2, 5; `src/data/defaults/achievements.ts` (стартовый набор и редкости),
`src/data/schemas/achievements.ts` (`AchievementDef`, `repeatable`), `src/engine/achievements/types.ts`
(`Unlock`), `src/scheme/geometry.ts:66` (`shortName`), `src/text.ts`; тесты-образцы `tests/unit/hud.test.ts`,
построитель `achievement` в `tests/support/builders.ts`.

**Files:**
- Create: `src/hud/badges.ts`
- Modify: `src/text.ts` (add `shortName`), `src/scheme/geometry.ts:66-70` (remove it), `src/scheme/Scheme.tsx:25`
  (import it from `../text.ts`)
- Test: `tests/unit/hudBadges.test.ts` (create), `tests/unit/text.test.ts`, `tests/unit/scheme/geometry.test.ts`
  (the `shortName` test moves to `text.test.ts`)

**Interfaces:**
- Produces:
  - `type BadgeRarity = 'rare' | 'epic' | 'legendary'`;
  - `type Badge = { ids: string[]; title: string; rarity: BadgeRarity; count: number }`;
  - `BADGES = 3`, `RARITY_TEXT: Record<'common' | BadgeRarity, string>`;
  - `managerBadges(unlocks: Unlock[], defs: AchievementDef[]): Map<string, Badge[]>`;
  - `teamBadges(unlocks: Unlock[], defs: AchievementDef[]): Map<string, Badge[]>`;
  - `badgeLine(badges: Badge[], max?: number): { shown: Badge[]; more: number }`;
  - `shortName(full: string): string` from `src/text.ts`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/hudBadges.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AchievementDef } from '../../src/data/schemas/achievements.ts';
import type { Unlock } from '../../src/engine/gameState.ts';
import { BADGES, badgeLine, managerBadges, teamBadges, type Badge } from '../../src/hud/badges.ts';
import { achievement } from '../support/builders.ts';

const manual = { type: 'manual' } as const;
const defs: AchievementDef[] = [
  achievement('open', manual, { title: 'Открыл счёт' }),
  achievement('five', manual, { title: 'Пятёрка', rarity: 'rare' }),
  achievement('hat', manual, { title: 'Хет-трик', rarity: 'epic' }),
  achievement('leader', manual, { title: 'Лидер недели', rarity: 'epic', repeatable: 'weekly' }),
  achievement('stable', manual, { title: 'Стабильность', rarity: 'legendary' }),
  achievement('off', manual, { title: 'Выключенная', rarity: 'legendary', enabled: false }),
  achievement('p2', manual, { title: 'Первопроходец', rarity: 'epic', scope: 'team' }),
  achievement('p3', manual, { title: 'Первопроходец', rarity: 'epic', scope: 'team' }),
  achievement('all', manual, { title: 'Все в деле', rarity: 'rare', scope: 'team' }),
  achievement('crowd', manual, { title: 'Командная обычная', scope: 'team' }),
];
const m = (achievementId: string, managerId: string, unlockedAt = '2026-10-06'): Unlock => ({
  achievementId,
  managerId,
  unlockedAt,
  source: 'manual',
});
const t = (achievementId: string, teamId: string, unlockedAt = '2026-10-06'): Unlock => ({
  achievementId,
  teamId,
  unlockedAt,
  source: 'auto',
});
const titles = (badges: Badge[] | undefined) => (badges ?? []).map((b) => b.title);

describe('badges by the name (D-58)', () => {
  it('rare and up, legendary first, then by the set; common ones give none', () => {
    const got = managerBadges(
      [m('open', 'a'), m('five', 'a'), m('hat', 'a'), m('stable', 'a'), m('leader', 'b'), m('hat', 'b')],
      defs,
    );
    expect(titles(got.get('a'))).toEqual(['Стабильность', 'Хет-трик', 'Пятёрка']);
    expect(got.get('a')?.map((b) => b.rarity)).toEqual(['legendary', 'epic', 'rare']);
    expect(titles(got.get('b'))).toEqual(['Хет-трик', 'Лидер недели']);
  });

  it('disabled and unknown achievements give none; only common — no entry', () => {
    const got = managerBadges([m('off', 'a'), m('gone', 'a'), m('open', 'c')], defs);
    expect(got.get('a')).toBeUndefined();
    expect(got.get('c')).toBeUndefined();
  });

  it('a repeatable one is one badge with the times taken', () => {
    const got = managerBadges([m('leader', 'a', '2026-10-09'), m('leader', 'a', '2026-10-16')], defs);
    expect(got.get('a')).toEqual([
      { ids: ['leader'], title: 'Лидер недели', rarity: 'epic', count: 2 },
    ]);
  });

  it('operator and team achievements stay apart', () => {
    expect(managerBadges([t('all', 't1')], defs).size).toBe(0);
    expect(teamBadges([m('five', 'a')], defs).size).toBe(0);
  });

  it('three gems by a name, the rest as «+N»', () => {
    const four = managerBadges(
      [m('stable', 'a'), m('hat', 'a'), m('leader', 'a'), m('five', 'a')],
      defs,
    ).get('a') ?? [];
    expect(BADGES).toBe(3);
    expect(titles(badgeLine(four).shown)).toEqual(['Стабильность', 'Хет-трик', 'Лидер недели']);
    expect(badgeLine(four).more).toBe(1);
    expect(badgeLine(four.slice(0, 2))).toEqual({ shown: four.slice(0, 2), more: 0 });
  });
});

describe('badges of a team (D-58)', () => {
  it('team titles fold: «Первопроходец ×2»; common ones give none', () => {
    const got = teamBadges([t('all', 't1'), t('p2', 't1'), t('p3', 't1'), t('crowd', 't1')], defs);
    expect(got.get('t1')).toEqual([
      { ids: ['p2', 'p3'], title: 'Первопроходец', rarity: 'epic', count: 2 },
      { ids: ['all'], title: 'Все в деле', rarity: 'rare', count: 1 },
    ]);
  });
});
```

And move the `shortName` test: delete it from `tests/unit/scheme/geometry.test.ts` (the `it` at lines ~60-64 and
`shortName` in its import list), add to `tests/unit/text.test.ts` (import `shortName` from
`../../src/text.ts`):

```ts
describe('a short name (D-47, D-58)', () => {
  it('«Фамилия И.» from two words; one word stays whole', () => {
    expect(shortName('Алина Смирнова')).toBe('Алина С.');
    expect(shortName('Глеб')).toBe('Глеб');
    expect(shortName('  Анна-Мария  Петрова-Водкина ')).toBe('Анна-Мария П.');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/hudBadges.test.ts tests/unit/text.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/hud/badges.ts"` and `shortName is not a function` (not
exported from `src/text.ts` yet).

- [ ] **Step 3: Move `shortName`** — append to `src/text.ts`, delete it from `src/scheme/geometry.ts`, and in
`src/scheme/Scheme.tsx` drop `shortName` from the `./geometry.ts` import and change
its `import { plateName } from '../text.ts';` to `import { plateName, shortName } from '../text.ts';`:

```ts
/** «Алина С.»: a name short enough for a token's plate or a line of the board (D-47, D-58). */
export function shortName(full: string): string {
  const [first, last] = full.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : (first ?? '');
}
```

- [ ] **Step 4: Write `src/hud/badges.ts`**

```ts
import type { AchievementDef } from '../data/schemas/achievements.ts';
import type { Unlock } from '../engine/gameState.ts';

/**
 * Achievements always on view (D-58): rarity gems by an operator's name in the rotating rating, a team's
 * achievements on its slide, the board «Доска почёта». Pure: what to draw, from the unlocks and the set.
 * Common achievements single nobody out — they keep their banner (ACH-5) and give no badge.
 */

export type BadgeRarity = 'rare' | 'epic' | 'legendary';
export type Badge = {
  /** The achievements behind the badge: one for an operator; a team's are folded by title. */
  ids: string[];
  title: string;
  rarity: BadgeRarity;
  /** Times taken: a repeatable one, or a team's achievements of the same title («×3»). */
  count: number;
};

/** Gems by a name; the rest — «+N». */
export const BADGES = 3;

export const RARITY_TEXT: Record<'common' | BadgeRarity, string> = {
  common: 'обычная',
  rare: 'редкая',
  epic: 'эпическая',
  legendary: 'легендарная',
};

const RANK: Record<BadgeRarity, number> = { legendary: 0, epic: 1, rare: 2 };

type Known = { id: string; title: string; rarity: BadgeRarity; order: number };

/** The achievements that single out: enabled, of the scope, not common — with their place in the set. */
function knownOf(defs: AchievementDef[], scope: AchievementDef['scope']): Map<string, Known> {
  const known = new Map<string, Known>();
  defs.forEach((def, order) => {
    const { rarity } = def;
    if (def.enabled && def.scope === scope && rarity !== 'common')
      known.set(def.id, { id: def.id, title: def.title, rarity, order });
  });
  return known;
}

const byRank = (a: Known, b: Known) => RANK[a.rarity] - RANK[b.rarity] || a.order - b.order;

/** Every operator's badges, legendary first, then by the set; one per achievement, `count` — times taken. */
export function managerBadges(unlocks: Unlock[], defs: AchievementDef[]): Map<string, Badge[]> {
  const known = knownOf(defs, 'manager');
  const taken = new Map<string, Map<string, number>>();
  for (const u of unlocks) {
    if (u.managerId === undefined || !known.has(u.achievementId)) continue;
    const mine = taken.get(u.managerId) ?? new Map<string, number>();
    mine.set(u.achievementId, (mine.get(u.achievementId) ?? 0) + 1);
    taken.set(u.managerId, mine);
  }
  const badges = new Map<string, Badge[]>();
  for (const [managerId, mine] of taken) {
    const list = [...mine.keys()].flatMap((id) => {
      const k = known.get(id);
      return k ? [k] : [];
    });
    badges.set(
      managerId,
      list.sort(byRank).map((k) => ({
        ids: [k.id],
        title: k.title,
        rarity: k.rarity,
        count: mine.get(k.id) ?? 0,
      })),
    );
  }
  return badges;
}

/** Every team's badges in the same order; achievements of the same title fold into one («×3»). */
export function teamBadges(unlocks: Unlock[], defs: AchievementDef[]): Map<string, Badge[]> {
  const known = knownOf(defs, 'team');
  const held = unlocks
    .flatMap((u) => {
      const k = known.get(u.achievementId);
      return k && u.teamId !== undefined ? [{ teamId: u.teamId, k }] : [];
    })
    .sort((a, b) => byRank(a.k, b.k));
  const badges = new Map<string, Badge[]>();
  for (const { teamId, k } of held) {
    const list = badges.get(teamId) ?? [];
    const same = list.find((b) => b.title === k.title);
    if (same) {
      same.count += 1;
      if (!same.ids.includes(k.id)) same.ids.push(k.id);
    } else list.push({ ids: [k.id], title: k.title, rarity: k.rarity, count: 1 });
    badges.set(teamId, list);
  }
  return badges;
}

/** What fits by a name: the first `max` gems and how many more («+N»). */
export function badgeLine(badges: Badge[], max = BADGES): { shown: Badge[]; more: number } {
  return { shown: badges.slice(0, max), more: Math.max(0, badges.length - max) };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/unit/hudBadges.test.ts tests/unit/text.test.ts tests/unit/scheme/geometry.test.ts`
Expected: PASS, all.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

```bash
git add src/hud/badges.ts src/text.ts src/scheme/geometry.ts src/scheme/Scheme.tsx tests/unit/hudBadges.test.ts tests/unit/text.test.ts tests/unit/scheme/geometry.test.ts
git commit -m "HUD: badges by the name and the team's badges, pure — rare and up by rarity, a repeatable one once with its count, team titles folded (D-58); shortName moves to text.ts"
```

---

### Task 2: «Доска почёта» rows (pure)

**Где смотреть:** спецификация, часть 3; `src/engine/leaderboard.ts` (`LeaderboardRow`: `managerId`, `fullName`,
`fired`); `src/hud/badges.ts` из задачи 1.

**Files:**
- Modify: `src/hud/badges.ts`
- Test: `tests/unit/hudBadges.test.ts`

**Interfaces:**
- Consumes: `knownOf`, `byRank`, `BadgeRarity` (Task 1), `shortName` (`src/text.ts`).
- Produces:
  - `type Holder = { managerId: string; name: string; count: number }`;
  - `type HonorRow = { achievementId: string; title: string; rarity: BadgeRarity; holders: Holder[]; more: number }`;
  - `HONOR_PER_SLIDE = 6`, `HONOR_NAMES = 3`;
  - `honorBoard(unlocks: Unlock[], defs: AchievementDef[], managers: Pick<ManagerState, 'managerId' | 'fullName' | 'fired'>[]): HonorRow[]`;
  - `honorPages(rows: HonorRow[], per?: number): HonorRow[][]`;
  - `holdersText(row: Pick<HonorRow, 'holders' | 'more'>): string`.

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/hudBadges.test.ts` (extend the import from
`../../src/hud/badges.ts` with `HONOR_NAMES, HONOR_PER_SLIDE, holdersText, honorBoard, honorPages, type HonorRow`):

```ts
describe('«Доска почёта» (D-58)', () => {
  const people = [
    { managerId: 'a', fullName: 'Борисова Анна', fired: false },
    { managerId: 'b', fullName: 'Абрамов Иван', fired: false },
    { managerId: 'c', fullName: 'Волков Пётр', fired: false },
    { managerId: 'd', fullName: 'Гусева Ольга', fired: false },
    { managerId: 'e', fullName: 'Дронов Олег', fired: false },
    { managerId: 'f', fullName: 'Егорова Нина', fired: true },
  ];
  const unlocks = [
    m('five', 'e', '2026-10-07'),
    m('five', 'a', '2026-10-06'),
    m('five', 'b', '2026-10-06'),
    m('five', 'c', '2026-10-08'),
    m('five', 'd', '2026-10-09'),
    m('five', 'f', '2026-10-05'),
    m('hat', 'a'),
    m('leader', 'a', '2026-10-09'),
    m('leader', 'a', '2026-10-16'),
    m('open', 'b'),
    t('all', 't1'),
  ];
  const board = honorBoard(unlocks, defs, people);

  it('lists the taken achievements of operators: legendary first, then by the set', () => {
    expect(board.map((r) => r.title)).toEqual(['Хет-трик', 'Лидер недели', 'Пятёрка']);
    expect(board.map((r) => r.rarity)).toEqual(['epic', 'epic', 'rare']);
  });

  it('holders in the order they took it, then by name; short names; the fired left out', () => {
    const five = board.find((r) => r.achievementId === 'five');
    expect(HONOR_NAMES).toBe(3);
    expect(five?.holders.map((h) => h.name)).toEqual(['Абрамов И.', 'Борисова А.', 'Дронов О.']);
    expect(five?.more).toBe(2);
  });

  it('a repeatable one counts its times; the text: «×2» and «и ещё N»', () => {
    const leader = board.find((r) => r.achievementId === 'leader');
    expect(leader?.holders).toEqual([{ managerId: 'a', name: 'Борисова А.', count: 2 }]);
    expect(holdersText(leader ?? { holders: [], more: 0 })).toBe('Борисова А. ×2');
    expect(holdersText(board.find((r) => r.achievementId === 'five') ?? { holders: [], more: 0 })).toBe(
      'Абрамов И., Борисова А., Дронов О. и ещё 2',
    );
  });

  it('an operator not in the game is skipped; nothing taken — no rows', () => {
    expect(honorBoard([m('hat', 'ghost')], defs, people)).toEqual([]);
    expect(honorBoard([m('open', 'a'), t('all', 't1')], defs, people)).toEqual([]);
  });

  it('six to a page; no pages without rows', () => {
    const row = (i: number): HonorRow => ({
      achievementId: `x${i}`,
      title: `Ачивка ${i}`,
      rarity: 'rare',
      holders: [],
      more: 0,
    });
    const seven = Array.from({ length: 7 }, (_, i) => row(i));
    expect(HONOR_PER_SLIDE).toBe(6);
    expect(honorPages(seven).map((p) => p.length)).toEqual([6, 1]);
    expect(honorPages([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/hudBadges.test.ts`
Expected: FAIL — `honorBoard is not a function` (and the other new names not exported).

- [ ] **Step 3: Implement** — in `src/hud/badges.ts` add `import type { ManagerState, Unlock } from
'../engine/gameState.ts';` (replacing the `Unlock`-only import) and `import { shortName } from '../text.ts';`,
then append:

```ts
/** A holder on the board: the short name and the times taken. */
export type Holder = { managerId: string; name: string; count: number };
export type HonorRow = {
  achievementId: string;
  title: string;
  rarity: BadgeRarity;
  /** The first holders, in the order they took it. */
  holders: Holder[];
  /** Holders beyond them: «и ещё N». */
  more: number;
};

/** Achievements on one slide of the board (about the height of the top 10). */
export const HONOR_PER_SLIDE = 6;
/** Names in a row of the board. */
export const HONOR_NAMES = 3;

/**
 * «Доска почёта»: the operators' achievements (rare and up) that somebody still in the game holds — legendary
 * first, then by the set; the holders by the day they took it, then by the full name. Fired operators (R-5)
 * are left out; vacationers stay.
 */
export function honorBoard(
  unlocks: Unlock[],
  defs: AchievementDef[],
  managers: Pick<ManagerState, 'managerId' | 'fullName' | 'fired'>[],
): HonorRow[] {
  const known = knownOf(defs, 'manager');
  const people = new Map(managers.filter((x) => !x.fired).map((x) => [x.managerId, x.fullName]));
  const rows = new Map<string, Map<string, { first: string; count: number }>>();
  for (const u of unlocks) {
    if (u.managerId === undefined || !known.has(u.achievementId) || !people.has(u.managerId)) continue;
    const holders = rows.get(u.achievementId) ?? new Map<string, { first: string; count: number }>();
    const was = holders.get(u.managerId);
    holders.set(
      u.managerId,
      was
        ? { first: was.first < u.unlockedAt ? was.first : u.unlockedAt, count: was.count + 1 }
        : { first: u.unlockedAt, count: 1 },
    );
    rows.set(u.achievementId, holders);
  }
  const taken = [...rows.keys()].flatMap((id) => {
    const k = known.get(id);
    return k ? [k] : [];
  });
  return taken.sort(byRank).map((k) => {
    const all = [...(rows.get(k.id) ?? [])]
      .map(([managerId, h]) => ({ managerId, full: people.get(managerId) ?? managerId, ...h }))
      .sort((a, b) => a.first.localeCompare(b.first) || a.full.localeCompare(b.full, 'ru'));
    return {
      achievementId: k.id,
      title: k.title,
      rarity: k.rarity,
      holders: all
        .slice(0, HONOR_NAMES)
        .map((h) => ({ managerId: h.managerId, name: shortName(h.full), count: h.count })),
      more: Math.max(0, all.length - HONOR_NAMES),
    };
  });
}

/** The board's slides: `per` achievements each; none without rows. */
export function honorPages(rows: HonorRow[], per = HONOR_PER_SLIDE): HonorRow[][] {
  const pages: HonorRow[][] = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return pages;
}

/** «Абрамов И., Борисова А. ×2 и ещё 3». */
export function holdersText(row: Pick<HonorRow, 'holders' | 'more'>): string {
  const names = row.holders.map((h) => (h.count > 1 ? `${h.name} ×${h.count}` : h.name)).join(', ');
  return row.more > 0 ? `${names} и ещё ${row.more}` : names;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/unit/hudBadges.test.ts`
Expected: PASS, all.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

```bash
git add src/hud/badges.ts tests/unit/hudBadges.test.ts
git commit -m "HUD: «Доска почёта» rows, pure — operators' rare and up, holders by date with short names, «×2», «и ещё N», six to a slide, the fired left out (D-58)"
```

---

### Task 3: The rating's slides carry the badges and the board

**Где смотреть:** спецификация, части 1–3, 5; `src/hud/rating.ts` (`ratingSlides`, типы слайдов, `TOP`),
`src/moments/heroes.ts` (`Hero`), `src/engine/gameState.ts` (`unlocks`, `managers`); тесты
`tests/unit/hud.test.ts` (описания `ratingSlides*`), построители `grant`, `achievement`, `daily`, `at`.

**Files:**
- Modify: `src/hud/rating.ts`
- Test: `tests/unit/hud.test.ts`

**Interfaces:**
- Consumes: `managerBadges`, `teamBadges`, `honorBoard`, `honorPages`, `Badge`, `HonorRow` (Tasks 1–2).
- Produces:
  - `TeamRow.badges: Badge[]`, `TopRow.badges: Badge[]`, `TeamSlide.badges: Badge[]` (the team's);
  - `type HeroRow = Hero & { badges: Badge[] }`, `HeroesSlide = { kind: 'heroes'; rows: HeroRow[] }`;
  - `type HonorSlide = { kind: 'honor'; page: number; pages: number; rows: HonorRow[] }`;
  - `type Slide = TeamSlide | TopSlide | HonorSlide | HeroesSlide`;
  - `ratingSlides(game, config, heroes?: Hero[], unlocks?: Unlock[]): Slide[]` — `unlocks` defaults to
    `game.unlocks` (Task 5 passes them without the held ones).

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/hud.test.ts` (add `achievement, grant` to the
builders import):

```ts
describe('ratingSlides — achievements on view (D-58)', () => {
  const manual = { type: 'manual' } as const;
  const config = makeConfig({
    teams: [team('t1', 1), team('t2', 2)],
    managers: [manager('a', 't1'), manager('b', 't1'), manager('c', 't2')],
    achievements: [
      achievement('open', manual, { title: 'Открыл счёт' }),
      achievement('five', manual, { title: 'Пятёрка', rarity: 'rare' }),
      achievement('hat', manual, { title: 'Хет-трик', rarity: 'epic' }),
      achievement('all', manual, { title: 'Все в деле', rarity: 'rare', scope: 'team' }),
    ],
  });
  const input = {
    config,
    records: [daily('a', '2026-10-06', { pay: 1 })],
    adjustments: [
      grant('g1', 'five', { managerId: 'a' }, at('2026-10-07')),
      grant('g2', 'hat', { managerId: 'a' }, at('2026-10-08')),
      grant('g3', 'open', { managerId: 'b' }, at('2026-10-08')),
      grant('g4', 'all', { teamId: 't1' }, at('2026-10-09')),
    ],
    imports: [],
  };
  const game = computeGameState(input, at('2026-10-14'));
  const heroes = [{ managerId: 'a', name: 'Оператор a', teamId: 't1', points: 3 }];
  const slides = ratingSlides(game, config, heroes);
  const titles = (badges: { title: string }[] | undefined) => (badges ?? []).map((b) => b.title);

  it('rows carry the gems; the team slide — its own achievements', () => {
    const t1 = slides[0];
    if (t1?.kind !== 'team') throw new Error('team slide expected');
    expect(t1.rows.map((r) => [r.managerId, titles(r.badges)])).toEqual([
      ['a', ['Хет-трик', 'Пятёрка']],
      ['b', []],
    ]);
    expect(titles(t1.badges)).toEqual(['Все в деле']);
    const top = slides.find((s) => s.kind === 'top');
    if (top?.kind !== 'top') throw new Error('top slide expected');
    expect(titles(top.rows.find((r) => r.managerId === 'a')?.badges)).toEqual(['Хет-трик', 'Пятёрка']);
    const hero = slides.find((s) => s.kind === 'heroes');
    if (hero?.kind !== 'heroes') throw new Error('heroes slide expected');
    expect(titles(hero.rows[0]?.badges)).toEqual(['Хет-трик', 'Пятёрка']);
  });

  it('«Доска почёта» after the top, before «Герои дня»', () => {
    expect(slides.map((s) => s.kind)).toEqual(['team', 'team', 'top', 'honor', 'heroes']);
    const honor = slides[3];
    if (honor?.kind !== 'honor') throw new Error('honor slide expected');
    expect([honor.page, honor.pages]).toEqual([1, 1]);
    expect(honor.rows.map((r) => r.title)).toEqual(['Хет-трик', 'Пятёрка']);
  });

  it('the unlocks given are the ones shown: none — no gems and no board', () => {
    const bare = ratingSlides(game, config, heroes, []);
    expect(bare.map((s) => s.kind)).toEqual(['team', 'team', 'top', 'heroes']);
    const t1 = bare[0];
    if (t1?.kind !== 'team') throw new Error('team slide expected');
    expect(t1.rows.every((r) => r.badges.length === 0)).toBe(true);
    expect(t1.badges).toEqual([]);
  });
});
```

And in the existing «Герои дня» test (`describe('ratingSlides — «Герои дня» (D-56)'`) change
`expect(slides[2]).toEqual({ kind: 'heroes', rows: heroes });` to
`expect(slides[2]).toEqual({ kind: 'heroes', rows: heroes.map((h) => ({ ...h, badges: [] })) });`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/hud.test.ts`
Expected: FAIL — the new tests on `badges` (undefined) and on the slide kinds (no `'honor'`); the changed
«Герои дня» test fails on the missing `badges`.

- [ ] **Step 3: Implement** — in `src/hud/rating.ts`:
  - imports: `import type { Unlock } from '../engine/gameState.ts';` (merge with the `GameState` import),
    `import { honorBoard, honorPages, managerBadges, teamBadges, type Badge, type HonorRow } from './badges.ts';`;
  - the doc comment of the module: «…then the overall top 10, then «Доска почёта» when somebody holds a rare
    achievement (D-58), then «Герои дня»…»;
  - types:

```ts
export type TeamRow = {
  managerId: string;
  name: string;
  points: number;
  share: number;
  /** Away on vacation today (D-54): a mark, the place is kept. */
  away: boolean;
  /** Rarity gems by the name (D-58). */
  badges: Badge[];
};
export type TeamSlide = {
  kind: 'team';
  teamId: string;
  title: string;
  color: string;
  teamPoints: number;
  rows: TeamRow[];
  /** Points of operators no longer in the team (fired, moved): they stay the team's (R-1, R-5). */
  others: number;
  /** The team's own achievements, under the heading (D-58). */
  badges: Badge[];
};
export type TopRow = {
  managerId: string;
  rank: number;
  name: string;
  teamId: string;
  points: number;
  /** Away on vacation today (D-54). */
  away: boolean;
  badges: Badge[];
};
export type TopSlide = { kind: 'top'; rows: TopRow[] };
/** «Доска почёта» (D-58): one page of the board — `page` of `pages`, counted from 1. */
export type HonorSlide = { kind: 'honor'; page: number; pages: number; rows: HonorRow[] };
export type HeroRow = Hero & { badges: Badge[] };
/** «Герои дня» (D-56): who brought most points since the end of yesterday. */
export type HeroesSlide = { kind: 'heroes'; rows: HeroRow[] };
export type Slide = TeamSlide | TopSlide | HonorSlide | HeroesSlide;
```

  - `ratingSlides`:

```ts
/** `unlocks` — the achievements on view: the HUD holds back a batch's new ones until its show is over (D-58). */
export function ratingSlides(
  game: GameState,
  config: SeasonConfig,
  heroes: Hero[] = [],
  unlocks: Unlock[] = game.unlocks,
): Slide[] {
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  const byTeam = new Map(game.teams.map((t) => [t.teamId, t]));
  // The ranking's rows know whether an operator is fired (R-5).
  const current = game.managers.filter((m) => !m.fired);
  const mine = managerBadges(unlocks, config.achievements);
  const ours = teamBadges(unlocks, config.achievements);
  const badgesOf = (managerId: string) => mine.get(managerId) ?? [];
```

    in the team rows' `map` add `badges: badgesOf(m.id),`; in the team slide's object add
    `badges: ours.get(team.id) ?? [],`; in the top rows add `badges: badgesOf(m.managerId),`; replace the tail:

```ts
  const pages = honorPages(honorBoard(unlocks, config.achievements, game.managers));
  pages.forEach((rows, i) => slides.push({ kind: 'honor', page: i + 1, pages: pages.length, rows }));
  if (heroes.length > 0)
    slides.push({ kind: 'heroes', rows: heroes.map((h) => ({ ...h, badges: badgesOf(h.managerId) })) });
  return slides;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/unit/hud.test.ts`
Expected: PASS, all.

- [ ] **Step 5: Typecheck** — `src/hud/Hud.tsx` still compiles: `SlideView` does not handle `'honor'` yet and
falls through to the team branch, so TypeScript reports `slide.title` etc. missing on `HonorSlide`. Add the
smallest guard now, the view comes in Task 5 — at the top of `SlideView`:

```tsx
  if (slide.kind === 'honor') return null; // the board's view: Task 5
```

and in `Rating`'s dots: ``key={s.kind === 'team' ? s.teamId : s.kind === 'honor' ? `honor-${s.page}` : s.kind}``.

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors; all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hud/rating.ts src/hud/Hud.tsx tests/unit/hud.test.ts
git commit -m "HUD: the rating's rows carry rarity gems, the team slide its own achievements, «Доска почёта» after the top 10 (D-58, FR-LB-1 in part)"
```

---

### Task 4: A fresh gem waits for its banner (pure parts)

**Где смотреть:** спецификация, часть 4; `src/hud/clock.ts` (`RunClocks`, `useRunClock`, общий `clocks`,
`listeners`), `src/hud/Moments.tsx` (ключ показа `show:${head.id}`, `until` = `timeline(head).end`),
`src/moments/tracker.ts` (`Moments`), `src/moments/events.ts` (событие `achievement` несёт `Unlock`),
`src/moments/snapshot.ts` (`unlockKey` — без даты); тесты `tests/unit/hudMoments.test.ts` (`RunClocks`).

**Files:**
- Modify: `src/hud/clock.ts`, `src/hud/badges.ts`
- Test: `tests/unit/hudMoments.test.ts`, `tests/unit/hudBadges.test.ts`

**Interfaces:**
- Consumes: `managerBadges`, `Badge` (Task 1); `Moments`; `unlockKey`.
- Produces:
  - `RunClocks.over(key: string): boolean`; `useRunOver(key: string | null): boolean` (`src/hud/clock.ts`);
  - `unlockId(u: Unlock): string` — `unlockKey` plus the day: a repeatable one taken again is another;
  - `badgeKey(subject: string, achievementId: string): string` — `<managerId|teamId>|<achievementId>`;
  - `type Fresh = { held: Set<string>; glint: Set<string>; batch: number | null }`;
  - `freshOf(m: Moments | null, over: boolean): Fresh`;
  - `isFresh(badge: Badge, subject: string, glint: Set<string>): boolean`;
  - `class Glints { has(key: string): boolean; mark(key: string): void }`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/hudMoments.test.ts`, inside the `describe` that holds the `RunClocks` test (next to «a run
continues where it was…»):

```ts
  it('a run never started is not over; it is over once played to its end (D-58)', () => {
    const clocks = new RunClocks();
    expect(clocks.over('show:3')).toBe(false);
    clocks.start('show:3', 1000);
    expect(clocks.over('show:3')).toBe(false);
    clocks.advance(50, true);
    clocks.advance(600, true);
    expect(clocks.over('show:3')).toBe(false);
    clocks.advance(600, true);
    expect(clocks.over('show:3')).toBe(true);
  });
```

In `tests/unit/hudBadges.test.ts` (extend the import with `badgeKey, freshOf, Glints, isFresh, unlockId`; add
`import type { Moments } from '../../src/moments/tracker.ts';`):

```ts
describe('a fresh gem waits for its banner (D-58)', () => {
  const again = m('leader', 'a', '2026-10-16');
  const batch: Moments = {
    id: 7,
    kind: 'live',
    since: null,
    events: [{ kind: 'leader', teamId: 't1' }, { kind: 'achievement', unlock: again }],
    before: [],
  };

  it('held while the show plays, then glinting; no batch — nothing', () => {
    expect(freshOf(batch, false)).toEqual({
      held: new Set([unlockId(again)]),
      glint: new Set(),
      batch: 7,
    });
    expect(freshOf(batch, true)).toEqual({
      held: new Set(),
      glint: new Set([badgeKey('a', 'leader')]),
      batch: 7,
    });
    expect(freshOf(null, false)).toEqual({ held: new Set(), glint: new Set(), batch: null });
  });

  it('an older week of a repeatable stays on view', () => {
    const older = m('leader', 'a', '2026-10-09');
    expect(unlockId(older)).not.toBe(unlockId(again));
    const { held } = freshOf(batch, false);
    const onView = [older, again].filter((u) => !held.has(unlockId(u)));
    expect(managerBadges(onView, defs).get('a')).toEqual([
      { ids: ['leader'], title: 'Лидер недели', rarity: 'epic', count: 1 },
    ]);
  });

  it('a folded team badge is fresh if any of its achievements is', () => {
    const folded = { ids: ['p2', 'p3'], title: 'Первопроходец', rarity: 'epic' as const, count: 2 };
    expect(isFresh(folded, 't1', new Set([badgeKey('t1', 'p3')]))).toBe(true);
    expect(isFresh(folded, 't2', new Set([badgeKey('t1', 'p3')]))).toBe(false);
  });

  it('a gem glints once for the life of the page', () => {
    const glints = new Glints();
    expect(glints.has('7:a|leader')).toBe(false);
    glints.mark('7:a|leader');
    expect(glints.has('7:a|leader')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/hudBadges.test.ts tests/unit/hudMoments.test.ts`
Expected: FAIL — `clocks.over is not a function`, `freshOf`/`unlockId`/`badgeKey`/`isFresh`/`Glints` not
exported.

- [ ] **Step 3: Implement**

`src/hud/clock.ts` — in `RunClocks`, after `elapsed`:

```ts
  /** The run has played to its end; false while it runs, waits for a visible tab or was never started. */
  over(key: string): boolean {
    const run = this.runs.get(key);
    return run !== undefined && run.ms >= run.until;
  }
```

and after `useRunClock`:

```ts
/**
 * Whether a run is over, read without starting it (D-58): the rating holds a batch's new achievements back
 * until the batch's show is over; a batch still waiting in the queue reads «not over».
 */
export function useRunOver(key: string | null): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    return () => void listeners.delete(onChange);
  }, []);
  return useSyncExternalStore(subscribe, () => key !== null && clocks.over(key));
}
```

`src/hud/badges.ts` — add `import { unlockKey } from '../moments/snapshot.ts';` and
`import type { Moments } from '../moments/tracker.ts';`, then append:

```ts
/** One unlock exactly: `unlockKey` and the day — a repeatable one taken again is another unlock. */
export const unlockId = (u: Unlock): string => `${unlockKey(u)}|${u.unlockedAt}`;

/** An operator's or a team's badge of an achievement. */
export const badgeKey = (subject: string, achievementId: string): string =>
  `${subject}|${achievementId}`;

/**
 * The new achievements of the latest batch of moments (D-56): until its show is over they are held back
 * (`held` — `unlockId`s: no gem spoils the banner), then their badges glint (`glint` — `badgeKey`s).
 */
export type Fresh = { held: Set<string>; glint: Set<string>; batch: number | null };

export function freshOf(m: Moments | null, over: boolean): Fresh {
  const unlocks = (m?.events ?? []).flatMap((e) => (e.kind === 'achievement' ? [e.unlock] : []));
  const batch = m?.id ?? null;
  return over
    ? {
        held: new Set(),
        glint: new Set(unlocks.map((u) => badgeKey(u.managerId ?? u.teamId ?? '', u.achievementId))),
        batch,
      }
    : { held: new Set(unlocks.map(unlockId)), glint: new Set(), batch };
}

/** A badge glints when any achievement behind it is fresh for this operator or team. */
export function isFresh(badge: Badge, subject: string, glint: Set<string>): boolean {
  return badge.ids.some((id) => glint.has(badgeKey(subject, id)));
}

/**
 * The gems that have glinted (D-58), kept outside the components as the run clocks are: a remounted HUD
 * does not glint them again. A key names the batch too — a badge taken again later glints again.
 */
export class Glints {
  private done = new Set<string>();
  has(key: string): boolean {
    return this.done.has(key);
  }
  mark(key: string): void {
    this.done.add(key);
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/unit/hudBadges.test.ts tests/unit/hudMoments.test.ts`
Expected: PASS, all.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

```bash
git add src/hud/clock.ts src/hud/badges.ts tests/unit/hudMoments.test.ts tests/unit/hudBadges.test.ts
git commit -m "HUD: a fresh gem waits for its banner — a batch's new unlocks held until its show is over (the run clock read, never started), then one glint per page (D-58)"
```

---

### Task 5: The gems, the team's line and the board on the screen

**Где смотреть:** спецификация, части 1–4; `src/hud/Hud.tsx` (`Hud`, `Rating`, `SlideView`), `src/hud/Moments.tsx`
(`RARITY_TEXT`, баннер с `.sq-emblem`), `src/hud/theme.css` (`.sq-emblem`, `.sq-rarity-*`, `.sq-parchment`,
`.sq-note`, `@layer components`), e2e `tests/e2e/moments.spec.ts` (главный тест «Что нового…»),
`tests/e2e/visual.spec.ts` (`demoDay`, маска `moving`, `beforeEach` пропускает тест без эталона); NAVIGATOR §11
(грабли HUD), §15 (один зритель на страницу).

**Files:**
- Create: `src/hud/Badges.tsx`
- Modify: `src/hud/Hud.tsx`, `src/hud/Moments.tsx`, `src/hud/theme.css`
- Test: `tests/e2e/moments.spec.ts`, `tests/e2e/visual.spec.ts`, baselines in
  `tests/e2e/visual.spec.ts-snapshots/`

**Interfaces:**
- Consumes: `badgeLine`, `badgeKey`, `holdersText`, `isFresh`, `freshOf`, `unlockId`, `Glints`, `RARITY_TEXT`,
  `Badge`, `Fresh`, `HonorRow` (Tasks 1–4); `useRunOver` (Task 4); `ratingSlides(…, unlocks)` (Task 3).
- Produces: `Gems`, `TeamLine`, `HonorView` components; the rating's `<section data-held="<n>">`; the gems'
  `data-badge="<subject>|<achievementId>"`.

- [ ] **Step 1: Write the failing e2e check** — in `tests/e2e/moments.spec.ts`, main test ««Что нового с
прошлого визита»…»: raise `test.setTimeout(90_000)` to `test.setTimeout(150_000)`; after `await open(page, seen);`
add

```ts
  // A new achievement's gem waits for its banner (D-58): held while the walk and the show play.
  const rating = page.getByRole('region', { name: 'Рейтинг операторов' });
  const held = async () => Number((await rating.getAttribute('data-held')) ?? '0');
  await expect.poll(held, { timeout: 10_000 }).toBeGreaterThan(0);
```

and at the end of the test, after the banner check:

```ts
  expect(await held(), 'a gem must not spoil its banner').toBeGreaterThan(0);
  await expect.poll(held, { timeout: 60_000 }).toBe(0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test tests/e2e/moments.spec.ts --project=e2e -g "Что нового"`
Expected: FAIL at the first poll — `data-held` is absent (reads 0), «Expected: > 0, Received: 0».

- [ ] **Step 3: The components** — create `src/hud/Badges.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  Glints,
  RARITY_TEXT,
  badgeKey,
  badgeLine,
  holdersText,
  isFresh,
  type Badge,
  type Fresh,
  type HonorRow,
} from './badges.ts';

/**
 * Achievements always on view (D-58): the gems by a name, the team's line, the board «Доска почёта».
 * Plain DOM; a fresh gem glints once (CSS) the first time it is on view after its banner.
 */

const glints = new Glints();

function Gem({ badge, subject, fresh }: { badge: Badge; subject: string; fresh: Fresh }) {
  const id = badgeKey(subject, badge.ids[0] ?? '');
  const key = `${fresh.batch ?? ''}:${id}`;
  const [glint] = useState(() => isFresh(badge, subject, fresh.glint) && !glints.has(key));
  useEffect(() => {
    if (glint) glints.mark(key);
  }, [glint, key]);
  return (
    <span
      className={`sq-badge sq-rarity-${badge.rarity}${glint ? ' sq-badge-new' : ''}`}
      data-badge={id}
      aria-hidden="true"
    />
  );
}

/** Up to three gems after a name, then «+N»; a screen reader hears the titles. */
export function Gems({ badges, subject, fresh }: { badges: Badge[]; subject: string; fresh: Fresh }) {
  if (badges.length === 0) return null;
  const { shown, more } = badgeLine(badges);
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {shown.map((b) => (
        <Gem key={b.ids[0]} badge={b} subject={subject} fresh={fresh} />
      ))}
      {more > 0 && <span className="text-xs text-(--sq-ink-soft)">+{more}</span>}
      <span className="sr-only">ачивки: {badges.map((b) => b.title).join(', ')}</span>
    </span>
  );
}

/** The team's achievements under its slide's heading: «Первопроходец ×3». */
export function TeamLine({ badges, subject, fresh }: { badges: Badge[]; subject: string; fresh: Fresh }) {
  if (badges.length === 0) return null;
  return (
    <ul aria-label="Ачивки команды" className="sq-bright mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs">
      {badges.map((b) => (
        <li key={b.ids[0]} className="flex items-center gap-1">
          <Gem badge={b} subject={subject} fresh={fresh} />
          {b.count > 1 ? `${b.title} ×${b.count}` : b.title}
        </li>
      ))}
    </ul>
  );
}

const LEGEND = ['legendary', 'epic', 'rare'] as const;

/** «Доска почёта»: an achievement, who took it; the legend of the gems' colours at the bottom. */
export function HonorView({ rows, page, pages }: { rows: HonorRow[]; page: number; pages: number }) {
  return (
    <>
      <h2 className="sq-name mt-2 text-base">
        Доска почёта{pages > 1 ? ` ${page}/${pages}` : ''}
      </h2>
      <div className="sq-note">редкие ачивки игры и кто их взял</div>
      <ol className="sq-parchment mt-2">
        {rows.map((r) => (
          <li key={r.achievementId} className="py-px">
            <div className="flex items-center gap-1.5">
              <span className={`sq-badge sq-rarity-${r.rarity}`} aria-hidden="true" />
              <span className="font-bold">{r.title}</span>
              <span className="sr-only">, {RARITY_TEXT[r.rarity]}</span>
            </div>
            <div className="truncate pl-4 text-xs text-(--sq-ink-soft)">{holdersText(r)}</div>
          </li>
        ))}
      </ol>
      <div className="sq-note mt-1 flex flex-wrap gap-x-2.5" aria-hidden="true">
        {LEGEND.map((r) => (
          <span key={r} className="flex items-center gap-1">
            <span className={`sq-badge sq-rarity-${r}`} />
            {RARITY_TEXT[r]}
          </span>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Wire the rating** — in `src/hud/Hud.tsx`:
  - imports: `useRunOver` (with `reducedMotion, useRunClock` from `./clock.ts`), `freshOf, unlockId, type Fresh`
    from `./badges.ts`, `Gems, HonorView, TeamLine` from `./Badges.tsx`;
  - in `Hud`: `<Rating game={game} config={config} heroes={props.heroes} moments={props.moments} />`;
  - `Rating`'s props: replace `jump: number | null` with `moments: Moments | null` (doc: «The latest batch of
    moments: jump to «Герои дня» at once (D-56); its new achievements wait for its show (D-58).»); its body
    begins:

```tsx
  const jump = moments?.id ?? null;
  const over = useRunOver(moments ? `show:${moments.id}` : null);
  const fresh = useMemo(() => freshOf(moments, over), [moments, over]);
  const unlocks = useMemo(
    () =>
      fresh.held.size === 0 ? game.unlocks : game.unlocks.filter((u) => !fresh.held.has(unlockId(u))),
    [game, fresh],
  );
  const slides = useMemo(
    () => ratingSlides(game, config, heroes, unlocks),
    [game, config, heroes, unlocks],
  );
```

    (the rest of the jump logic stays, reading `jump`); the `<section>` gets
    `data-held={game.unlocks.length - unlocks.length}`; `<SlideView key={at} slide={slide} config={config}
    fresh={fresh} />` — keyed by the index, so a slide shown again mounts afresh;
  - `SlideView({ slide, config, fresh }: { slide: Slide; config: SeasonConfig; fresh: Fresh })`: replace the
    Task 3 guard with `if (slide.kind === 'honor') return <HonorView rows={slide.rows} page={slide.page}
    pages={slide.pages} />;`; in the heroes, top and team rows put
    `<Gems badges={r.badges} subject={r.managerId} fresh={fresh} />` right after the name's `<span>` (in the top
    and team rows — after the «в отпуске» mark, before the points); in the team slide, after the
    `<div className="sq-note">…</div>` inside the heading block's `<div className="min-w-0">`, add
    `<TeamLine badges={slide.badges} subject={slide.teamId} fresh={fresh} />`.

  In `src/hud/Moments.tsx` delete the local `RARITY_TEXT` and import it from `./badges.ts` (the banner's text
  stays the same).

- [ ] **Step 5: The style** — in `src/hud/theme.css`, inside `@layer components`, after the
`.sq-rarity-legendary .sq-emblem` rule:

```css
  /* Achievements always on view (D-58): a round gem by the name, in the banners' rarity colours; a fresh one
     glints once. Round, so it is not taken for the team's diamond in the same row. */
  .sq-badge {
    display: inline-block;
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1px solid var(--sq-edge);
  }
  .sq-badge.sq-rarity-rare {
    background: linear-gradient(135deg, #a9d3ff, #2f5f96);
  }
  .sq-badge.sq-rarity-epic {
    background: linear-gradient(135deg, #e0b3ff, #6b2f96);
  }
  .sq-badge.sq-rarity-legendary {
    background: linear-gradient(135deg, #ffe08a, #a8641c);
  }
  .sq-badge-new {
    animation: sq-badge-glint 0.9s ease-out both;
  }
  @keyframes sq-badge-glint {
    from {
      transform: scale(0);
    }
    55% {
      transform: scale(1.9);
    }
    to {
      transform: scale(1);
    }
  }
```

and in the existing `@media (prefers-reduced-motion: reduce)` block next to `.sq-moment-in`, add
`.sq-badge-new { animation: none; }`.

- [ ] **Step 6: Run the e2e check to see it pass**

Run: `npx playwright test tests/e2e/moments.spec.ts --project=e2e -g "Что нового"`
Expected: PASS.

- [ ] **Step 7: The board's baseline** — add to `tests/e2e/visual.spec.ts`:

```ts
test('honor — the «Доска почёта» slide (QA-6, D-58)', async ({ page }) => {
  // The slides turn every 15 s: a fake clock jumps to the board instead of waiting a round.
  await page.clock.install();
  const day = await demoDay(page);
  await page.goto(`./#/?view=2d&date=${day}`);
  await expect(page.getByRole('img', { name: 'Схема трека' })).toBeVisible();
  const rating = page.getByRole('region', { name: 'Рейтинг операторов' });
  const honor = rating.getByRole('heading', { name: /^Доска почёта/ });
  for (let i = 0; i < 12 && !(await honor.isVisible()); i++) await page.clock.fastForward(15_000);
  await expect(honor).toBeVisible();
  await expect(rating).toHaveScreenshot('honor.png', SHOT);
});
```

Run: `npx playwright test visual --project=e2e --update-snapshots`
Expected: 4 passed; `honor-e2e-win32.png` created; `rest`, `whole`, `scheme` may change (the first team slide of
the demo day has team achievements — the panel grows by the team's line; its text is masked as a `list`).
Open every changed or new picture (Read the PNG): the gems round and in the rarity colours, the board's rows
with names under the titles and the legend, nothing clipped. If the demo day shows no board, the loop times out
— then take the board on the last data day of the demo (`?date=2026-10-14`) and ledger a ruling.

- [ ] **Step 8: Look at it live** — `preview_start` the dev server, open `#/?view=2d` (demo), screenshot the
rating on a team slide and on the board (`javascript_tool` only to read state, e.g. the `data-held` value and
the count of `.sq-badge`); 1280×720 and the mobile preset (the panel must not overflow).

- [ ] **Step 9: The whole check, commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run size && npm run test:e2e`
Expected: all green; size under 600 KB gzip.

```bash
git add src/hud/Badges.tsx src/hud/Hud.tsx src/hud/Moments.tsx src/hud/theme.css tests/e2e/moments.spec.ts tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "HUD: rarity gems by the name, the team's line and «Доска почёта» on the screen; a new gem after its banner with one glint (D-58)"
```

---

### Task 6: Docs

**Где смотреть:** `docs/DECISIONS.md` (конец D-57, перед `---` и «## Визуальное направление»),
`docs/NAVIGATOR.md` §11 (HUD), `docs/BACKLOG.md` («## Этап 4 — лидерборд и ачивки»), `CLAUDE.md`
(«Архитектура» — строка `src/hud/`), спецификация (раздел «As built» добавляется после ревью, задача 7).

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/NAVIGATOR.md`, `docs/BACKLOG.md`, `CLAUDE.md`

- [ ] **Step 1: DECISIONS** — after D-57's last bullet, before `---`:

```markdown

**D-58. Ачивки всегда на виду: значки у имени и «Доска почёта»** (ответ автора 14.10.2026: «ачивки были видны
менеджерам на постоянной основе и выделяли их… как не перегрузить интерфейс»; спецификация
`docs/superpowers/specs/2026-10-14-achievement-badges-design.md`, план
`docs/superpowers/plans/2026-10-14-achievement-badges.md`; к D-38, D-46, D-56, ACH-5, FR-LB-1):
- **всё внутри сменяющегося рейтинга**, новых панелей нет. Отклонены: постоянная «полоса почёта» вдоль края и
  значки на табличках героев (фигурки — руководители, не менеджеры);
- **значок у имени** — круглый «самоцвет» цвета редкости (синий — редкая, фиолетовый — эпическая, золото —
  легендарная), без буквы и иконки до этапа 4; круглый, чтобы не путать с ромбом команды. Только редкие и выше:
  обычные были бы почти у всех. Сначала легендарные, затем по порядку набора; до трёх, дальше «+N»; повторяемая —
  один значок. Везде, где в рейтинге имя: слайды команд, топ-10, «Герои дня»; не в тостах и не на карточках;
- **ачивки команды** — строкой под названием на её слайде, одинаковые названия сворачиваются («Первопроходец ×3»);
- **«Доска почёта»** — слайд после топ-10: ачивки операторов (редкие и выше), кто взял — по дате, имена короткие
  («Фамилия И.»), «×2», после трёх имён «и ещё N»; до 6 ачивок на слайд, дальше «1/2», «2/2»; уволенных нет,
  отпускники есть; легенда цветов внизу; без условий получения; нет слайда, пока ни у кого нет редкой ачивки;
- **новый значок ждёт баннер:** ачивки последней порции моментов скрыты, пока не доиграл её показ (часы показа
  читаются, не запускаются); потом значок один раз блестит, когда впервые на виду; «меньше движения» — без
  блеска. Упрощение: скрывает только последняя порция;
- **FR-LB-1 частично:** у имени — три самые редкие ачивки цветом редкости вместо «иконок трёх последних»;
  иконки, таблица лидеров и карточка менеджера (FR-LB-7) — этап 4.
```

- [ ] **Step 2: NAVIGATOR §11** — in «**Решения:**» add «D-58 (ачивки всегда на виду: значки у имени, строка
команды, «Доска почёта»)»; add a bullet after «**Моменты (D-56):** …»:

```markdown
- **Ачивки на виду (D-58):** `src/hud/badges.ts` (чистые: `managerBadges`, `teamBadges`, `badgeLine`, `honorBoard`,
  `honorPages`, `holdersText`; свежие — `freshOf`, `unlockId`, `Glints`), `src/hud/Badges.tsx` (`Gems`, `TeamLine`,
  `HonorView`), слайд `honor` в `rating.ts`, `useRunOver` в `clock.ts` (часы показа читаются, не запускаются),
  `.sq-badge` в `theme.css`; `shortName` — в `src/text.ts`. Тесты `tests/unit/hudBadges.test.ts`, `hud.test.ts`;
  e2e — `data-held` у рейтинга в `moments.spec.ts`, эталон `honor` в `visual.spec.ts` (слайды листает
  `page.clock.install` + `fastForward`).
```

and in «**Грабли:**» append: «HUD не импортирует из `src/scheme` (ленивый чанк) — общее кладём в `src/text.ts`.»

- [ ] **Step 3: BACKLOG** — under «## Этап 4 — лидерборд и ачивки» add:

```markdown
- **FR-LB-1/FR-LB-7 после D-58:** значки у имени и «Доска почёта» уже в рейтинге (цвет редкости); на этапе 4 —
  иконки вместо самоцветов, страница лидерборда с «иконками трёх последних», карточка менеджера с его ачивками,
  подсказки при наведении (сейчас HUD не принимает мышь).
```

- [ ] **Step 4: CLAUDE.md** — in «Архитектура», the `src/hud/` line: after «сменяющийся рейтинг (`rating.ts`,
D-38)» add «, ачивки на виду (`badges.ts`, `Badges.tsx`, D-58)».

- [ ] **Step 5: Check and commit**

Run: `npx prettier --check docs CLAUDE.md` and the docs audit's `navcheck.py` (copied into this session's scratchpad; `python -I navcheck.py . docs/NAVIGATOR.md` — paths
and identifiers in backticks exist)
Expected: formatted; no missing paths or identifiers.

```bash
git add docs/DECISIONS.md docs/NAVIGATOR.md docs/BACKLOG.md CLAUDE.md
git commit -m "Docs: D-58 — achievements always on view (gems by the name, the team's line, «Доска почёта», a gem after its banner); NAVIGATOR §11, BACKLOG stage 4, CLAUDE.md"
```

---

### Task 7: Independent review, fixes, report

**Где смотреть:** этот план (Review Focus), спецификация, журнал (`.superpowers/sdd/2026-10-14-achievement-badges/progress.md`).

- [ ] **Step 1:** the review package (`review-package PLAN MERGE_BASE HEAD`, MERGE_BASE = the commit before
Task 1) and a review subagent on **opus** with `code-reviewer.md`, the plan, the spec, the Review Focus verbatim
and the ledger's rulings; the subagent must not open root `*.xlsx`, `refs/`, `assets-src/` or decrypt `data/`.
- [ ] **Step 2:** re-grade the findings; Critical and Important — one fix pass, each fix RED → GREEN and the whole
suite; Minor — the ledger and BACKLOG.
- [ ] **Step 3:** the spec's «As built (14.10.2026)» section — what differs from the spec, if anything; commit.
- [ ] **Step 4:** a short report to the author in Russian (what is on the screen, screenshots, rulings, deferred
minors); the push only after a fresh «да» (D-3).
