import { describe, expect, it } from 'vitest';
import type { AchievementDef } from '../../src/data/schemas/achievements.ts';
import type { Unlock } from '../../src/engine/gameState.ts';
import {
  BADGES,
  HONOR_NAMES,
  HONOR_PER_SLIDE,
  Glints,
  badgeKey,
  badgeLine,
  freshOf,
  holdersText,
  honorBoard,
  honorPages,
  isFresh,
  managerBadges,
  teamBadges,
  unlockId,
  type Badge,
  type HonorRow,
} from '../../src/hud/badges.ts';
import type { Moments } from '../../src/moments/tracker.ts';
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
      [
        m('open', 'a'),
        m('five', 'a'),
        m('hat', 'a'),
        m('stable', 'a'),
        m('leader', 'b'),
        m('hat', 'b'),
      ],
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
    const got = managerBadges(
      [m('leader', 'a', '2026-10-09'), m('leader', 'a', '2026-10-16')],
      defs,
    );
    expect(got.get('a')).toEqual([
      { ids: ['leader'], title: 'Лидер недели', rarity: 'epic', count: 2 },
    ]);
  });

  it('operator and team achievements stay apart', () => {
    expect(managerBadges([t('all', 't1')], defs).size).toBe(0);
    expect(teamBadges([m('five', 'a')], defs).size).toBe(0);
  });

  it('three gems by a name, the rest as «+N»', () => {
    const four =
      managerBadges([m('stable', 'a'), m('hat', 'a'), m('leader', 'a'), m('five', 'a')], defs).get(
        'a',
      ) ?? [];
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
    expect(
      holdersText(board.find((r) => r.achievementId === 'five') ?? { holders: [], more: 0 }),
    ).toBe('Абрамов И., Борисова А., Дронов О. и ещё 2');
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

describe('a fresh gem waits for its banner (D-58)', () => {
  const again = m('leader', 'a', '2026-10-16');
  const batch: Moments = {
    id: 7,
    kind: 'live',
    since: null,
    events: [
      { kind: 'leader', teamId: 't1' },
      { kind: 'achievement', unlock: again },
    ],
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
