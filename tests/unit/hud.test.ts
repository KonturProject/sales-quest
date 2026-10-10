import { describe, expect, it } from 'vitest';
import { computeGameState } from '../../src/engine/gameState.ts';
import {
  barShare,
  paceText,
  paceTone,
  plural,
  pointsText,
  ratingSlides,
  shortTime,
} from '../../src/hud/rating.ts';
import { at, daily, makeConfig, manager, team } from '../support/builders.ts';

describe('ratingSlides (D-38)', () => {
  const config = makeConfig({
    teams: [team('t1', 1), team('t2', 2)],
    managers: [
      manager('a', 't1'),
      manager('b', 't1'),
      manager('f', 't1', { firedAt: '2026-10-09' }),
      manager('m', 't1', {
        memberships: [
          { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
          { teamId: 't2', from: '2026-10-12' },
        ],
      }),
      manager('n', 't2', { memberships: [{ teamId: 't2', from: '2026-10-13' }] }),
    ],
  });
  const records = [
    daily('a', '2026-10-06', { pay: 3 }),
    daily('b', '2026-10-06', { pay: 1 }),
    daily('f', '2026-10-06', { pay: 2 }),
    daily('m', '2026-10-07', { pay: 4 }),
    daily('m', '2026-10-13', { pay: 1 }),
  ];
  const game = computeGameState(
    { config, records, adjustments: [], imports: [] },
    at('2026-10-14'),
  );
  const slides = ratingSlides(game, config);

  it('goes team by team, then the overall top', () => {
    expect(slides.map((s) => (s.kind === 'team' ? s.teamId : 'top'))).toEqual(['t1', 't2', 'top']);
  });

  it('lists the current members with their share of the team, the rest as «others»', () => {
    const t1 = slides[0];
    if (t1?.kind !== 'team') throw new Error('team slide expected');
    expect(t1.teamPoints).toBe(100);
    expect(t1.rows.map((r) => [r.managerId, r.points, r.share])).toEqual([
      ['a', 30, 0.3],
      ['b', 10, 0.1],
    ]);
    expect(t1.others).toBe(60); // f (fired) and m (moved to t2) earned it for t1
    const t2 = slides[1];
    if (t2?.kind !== 'team') throw new Error('team slide expected');
    expect(t2.rows.map((r) => [r.managerId, r.points])).toEqual([
      ['m', 10],
      ['n', 0],
    ]);
  });

  it('ranks the top without the fired (R-5)', () => {
    const top = slides[2];
    if (top?.kind !== 'top') throw new Error('top slide expected');
    expect(top.rows.map((r) => [r.rank, r.managerId, r.points])).toEqual([
      [1, 'm', 50],
      [2, 'a', 30],
      [3, 'b', 10],
      [4, 'n', 0],
    ]);
  });
});

describe('ratingSlides — edges (review 3a)', () => {
  it('lists the team as the card counts it and hides float noise as «others»', () => {
    const config = makeConfig({
      teams: [team('t1', 1)],
      managers: [
        manager('a', 't1'),
        manager('gone', 't1', {
          memberships: [{ teamId: 't1', from: '2026-10-05', to: '2026-10-09' }],
        }),
      ],
      metrics: [
        { id: 'inv6', title: 'Счета', weight: 0.1, order: 1 },
        { id: 'inv20', title: 'Разговоры', weight: 0.2, order: 2 },
        { id: 'pay', title: 'Оплаты', weight: 10, order: 3 },
      ],
    });
    const records = [
      daily('a', '2026-10-06', { inv6: 1, inv20: 1 }),
      daily('a', '2026-10-07', { inv6: 3 }),
    ];
    const game = computeGameState(
      { config, records, adjustments: [], imports: [] },
      at('2026-10-14'),
    );
    const slide = ratingSlides(game, config)[0];
    if (slide?.kind !== 'team') throw new Error('team slide expected');
    expect(slide.rows.map((r) => r.managerId)).toEqual(['a']);
    expect(game.teams[0]?.members).toBe(1);
    expect(slide.others).toBe(0);
  });
});

describe('texts', () => {
  it('say how far from the pace (FR-PACE-3)', () => {
    expect([paceText(0), paceText(2), paceText(-1), paceText(-5), paceText(11)]).toEqual([
      'идёт в темпе',
      'впереди темпа на 2 клетки',
      'отстаёт на 1 клетку',
      'отстаёт на 5 клеток',
      'впереди темпа на 11 клеток',
    ]);
    expect([21, 22, 25, 111].map((n) => plural(n, 'а', 'б', 'в'))).toEqual(['а', 'б', 'в', 'в']);
  });

  it('colour the pace and fill the bar within the card (D-46)', () => {
    expect([paceTone(3), paceTone(-1), paceTone(0)]).toEqual(['up', 'down', 'even']);
    expect([barShare(0.7), barShare(1.4), barShare(-0.1), barShare(Number.NaN)]).toEqual([
      0.7, 1, 0, 0,
    ]);
  });

  it('write points with the right word form', () => {
    expect([1, 3, 604, 605, 1021.4].map(pointsText)).toEqual([
      '1 балл',
      '3 балла',
      '604 балла',
      '605 баллов',
      '1 021 балл',
    ]);
  });

  it('write times shortly', () => {
    expect(shortTime('2026-10-14T09:05:00+03:00')).toBe('14.10 09:05');
    expect(shortTime(null)).toBe('—');
  });
});
