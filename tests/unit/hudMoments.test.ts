import { describe, expect, it } from 'vitest';
import { countAt, nextStep, stepLeftText } from '../../src/hud/cards.ts';
import { computeGameState } from '../../src/engine/gameState.ts';
import { TOASTS, at, showOf, timeline } from '../../src/hud/moments.ts';
import type { MomentEvent } from '../../src/moments/events.ts';
import type { Moments } from '../../src/moments/tracker.ts';
import { at as onDay, makeConfig, manager, team } from '../support/builders.ts';

const track = { trackLength: 20, maxPosition: 30 };
const plan = { progressMode: 'plan_percent' as const, pointsPerStep: undefined };

describe('«до шага» on the card (D-56)', () => {
  it('the share of the way to the next cell from the data, and the points left', () => {
    // A plan of 100 points over 20 cells: 5 points a cell; 12 points — 2 cells and 2 of 5.
    const s = nextStep({ points: 12, targetPoints: 100, position: 2 }, plan, track);
    expect(s?.share).toBeCloseTo(0.4);
    expect(s?.left).toBeCloseTo(3);
    expect(nextStep({ points: 10, targetPoints: 100, position: 2 }, plan, track)).toEqual({
      share: 0,
      left: 5,
    });
  });

  it('in the absolute mode by the points of a step', () => {
    const absolute = { progressMode: 'absolute' as const, pointsPerStep: 10 };
    const s = nextStep({ points: 25, targetPoints: 100, position: 2 }, absolute, track);
    expect(s?.share).toBeCloseTo(0.5);
    expect(s?.left).toBeCloseTo(5);
  });

  it('none at the end of the overflow zone or without a plan', () => {
    expect(nextStep({ points: 400, targetPoints: 100, position: 30 }, plan, track)).toBeNull();
    expect(nextStep({ points: 0, targetPoints: 0, position: 0 }, plan, track)).toBeNull();
  });

  it('the points left read as a whole number, at least 1', () => {
    expect(stepLeftText(3)).toBe('3');
    expect(stepLeftText(0.2)).toBe('1');
    expect(stepLeftText(1234.4)).toBe((1235).toLocaleString('ru-RU'));
  });
});

describe('counting up (D-56)', () => {
  it('from «было» to «стало», easing out; before the start it shows «было»', () => {
    expect(countAt(380, 392, null)).toBe(380);
    expect(countAt(380, 392, 0)).toBe(380);
    expect(countAt(380, 392, 1500)).toBe(392);
    expect(countAt(380, 392, 99_999)).toBe(392);
    const mid = countAt(380, 392, 750);
    expect(mid).toBeGreaterThan(386);
    expect(mid).toBeLessThan(392);
  });
});

describe('the show of a batch (D-56)', () => {
  const config = makeConfig({
    teams: [
      team('t1', 1, { leaderName: 'Руководитель Один', color: '#aa0000' }),
      team('t2', 2, { color: '#0000aa' }),
    ],
    managers: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) =>
      manager(id, id === 'g' ? 't2' : 't1', { fullName: `Оператор ${id.toUpperCase()}` }),
    ),
    achievements: [
      {
        id: 'hat',
        title: 'Хет-трик',
        description: 'Три счёта за день',
        icon: 'hat',
        scope: 'manager',
        rarity: 'rare',
        rule: { type: 'threshold', metric: 'inv6', period: 'day', op: '>=', value: 3 },
        repeatable: 'daily',
        bonusPoints: 0,
        enabled: true,
      },
      {
        id: 'all',
        title: 'Все в деле',
        description: '',
        icon: 'all',
        scope: 'team',
        rarity: 'epic',
        rule: { type: 'team_all_members', metric: 'inv6', minEach: 1, period: 'week' },
        repeatable: false,
        bonusPoints: 0,
        enabled: true,
      },
    ],
  });
  const game = computeGameState(
    { config, records: [], adjustments: [], imports: [] },
    onDay('2026-10-14'),
  );
  const gain = (managerId: string, points: number, metrics = {}, bonus = 0): MomentEvent => ({
    kind: 'gain',
    managerId,
    teamId: managerId === 'g' ? 't2' : 't1',
    points,
    metrics,
    bonus,
  });
  const batch = (events: MomentEvent[], over: Partial<Moments> = {}): Moments => ({
    id: 7,
    kind: 'live',
    since: null,
    events,
    before: [],
    ...over,
  });

  it('toasts: the top five with their numbers by the config titles, then «и ещё N операторов — +M баллов»', () => {
    const show = showOf(
      batch([
        gain('a', 7, { inv6: 2, inv20: 1 }, 2),
        gain('b', 6, { pay: 1 }),
        gain('c', 5),
        gain('d', 4),
        gain('e', 3),
        gain('f', 2),
        gain('g', 1),
      ]),
      game,
      config,
    );
    expect(show.toasts).toHaveLength(TOASTS + 1);
    expect(show.toasts[0]).toEqual({
      kind: 'gain',
      key: 'gain-a',
      name: 'Оператор A',
      color: '#aa0000',
      points: 7,
      details: 'Качественные счета +2 · Разговоры от 20 минут +1 · ачивки +2',
    });
    expect(show.toasts[2]).toMatchObject({ name: 'Оператор C', details: '' });
    expect(show.toasts[TOASTS]).toEqual({
      kind: 'more',
      key: 'more',
      text: 'и ещё 2 оператора — +3 балла',
    });
  });

  it('the plate: «Новые данные от …», «Что нового с …»', () => {
    // The builders' game has no imports: its data time reads «—».
    expect(showOf(batch([gain('a', 1)]), game, config).plate).toBe('Новые данные от —');
    expect(
      showOf(
        batch([gain('a', 1)], { kind: 'since', since: '2026-10-12T18:40:00+03:00' }),
        game,
        config,
      ).plate,
    ).toBe('Что нового с 12.10 18:40');
    expect(showOf(batch([gain('a', 1)], { kind: 'since', since: null }), game, config).plate).toBe(
      'Что нового с прошлого визита',
    );
  });

  it('banners: who, what, how rare; a team achievement names the team; unknown achievements are skipped', () => {
    const show = showOf(
      batch([
        {
          kind: 'achievement',
          unlock: {
            achievementId: 'hat',
            managerId: 'a',
            unlockedAt: '2026-10-13',
            source: 'auto',
          },
        },
        {
          kind: 'achievement',
          unlock: {
            achievementId: 'gone',
            managerId: 'a',
            unlockedAt: '2026-10-13',
            source: 'auto',
          },
        },
        {
          kind: 'achievement',
          unlock: { achievementId: 'all', teamId: 't1', unlockedAt: '2026-10-13', source: 'auto' },
        },
      ]),
      game,
      config,
    );
    expect(show.banners).toEqual([
      {
        kind: 'achievement',
        key: 'ach-0-hat',
        title: 'Хет-трик',
        description: 'Три счёта за день',
        rarity: 'rare',
        who: 'Оператор A',
        color: '#aa0000',
      },
      {
        kind: 'achievement',
        key: 'ach-1-all',
        title: 'Все в деле',
        description: '',
        rarity: 'epic',
        who: 'команда Руководитель Один',
        color: '#aa0000',
      },
    ]);
  });

  it('more than six banners: «и ещё N ачивок»', () => {
    const many = Array.from({ length: 8 }, (): MomentEvent => ({
      kind: 'achievement',
      unlock: { achievementId: 'hat', managerId: 'a', unlockedAt: '2026-10-13', source: 'auto' },
    }));
    const show = showOf(batch(many), game, config);
    expect(show.banners).toHaveLength(7);
    expect(show.banners[6]).toEqual({ kind: 'more', key: 'more', text: 'и ещё 2 ачивки' });
  });

  it('a show without gains or unlocks is empty: only a team correction, only decreases, gates', () => {
    const show = showOf(
      batch([
        { kind: 'team_points', teamId: 't1', from: 50, to: 40, cellsFrom: 5, cellsTo: 4 },
        { kind: 'gate', teamId: 't2', locationIndex: 2 },
        gain('a', 0.4),
      ]),
      game,
      config,
    );
    expect([show.toasts, show.banners]).toEqual([[], []]);
  });

  it('the timeline: a toast every 2.5 s for 7.5 s (three at most), then banners of 4 s', () => {
    const show = showOf(
      batch([
        gain('a', 5),
        gain('b', 4),
        gain('c', 3),
        gain('d', 2),
        {
          kind: 'achievement',
          unlock: {
            achievementId: 'hat',
            managerId: 'a',
            unlockedAt: '2026-10-13',
            source: 'auto',
          },
        },
      ]),
      game,
      config,
    );
    const line = timeline(show);
    expect(line.toasts.map((t) => [t.start, t.end])).toEqual([
      [0, 7500],
      [2500, 10000],
      [5000, 12500],
      [7500, 15000],
    ]);
    expect(line.banners.map((b) => [b.start, b.end])).toEqual([[10000, 14000]]);
    expect(line.end).toBe(15000);
    expect(at(line, 6000).toasts).toHaveLength(3);
    expect(at(line, 11000)).toMatchObject({ toasts: [{}, {}], banners: [{}] });
    expect(at(line, 15000)).toEqual({ toasts: [], banners: [] });
  });
});
