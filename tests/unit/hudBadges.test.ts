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
