import { describe, expect, it } from 'vitest';
import { computeGameState, type GameState } from '../../../src/engine/gameState.ts';
import { heroesOf, HEROES } from '../../../src/moments/heroes.ts';
import { readSeen, writeSeen } from '../../../src/moments/seen.ts';
import { snapshotOf, type Snapshot } from '../../../src/moments/snapshot.ts';
import { momentsTracker } from '../../../src/moments/tracker.ts';
import { at, daily, makeConfig, manager, team } from '../../support/builders.ts';

const config = makeConfig({
  teams: [team('t1', 1), team('t2', 2)],
  managers: [
    manager('a', 't1', { fullName: 'Борисова Анна' }),
    manager('b', 't2', { fullName: 'Абрамов Иван' }),
  ],
});
const gameWith = (records: Parameters<typeof daily>[2][], day = '2026-10-08'): GameState =>
  computeGameState(
    {
      config,
      records: records.map((v, i) => daily(i % 2 === 0 ? 'a' : 'b', '2026-10-06', v)),
      adjustments: [],
      imports: [],
    },
    at(day),
  );
const g0 = gameWith([{ inv6: 2 }, { inv6: 1 }]);
const g1 = gameWith([{ inv6: 9, pay: 1 }, { inv6: 1 }]);

/** A storage in memory, as the browser's. */
function memory() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    items,
  };
}
const seenIn = (store: ReturnType<typeof memory>) => ({
  read: (id: string) => readSeen(id, store),
  write: (s: Snapshot) => writeSeen(s, store),
});

describe('the memory of what this browser showed (D-56)', () => {
  it('keeps the latest season only; reads it back', () => {
    const store = memory();
    writeSeen(snapshotOf(g0, config), store);
    expect(readSeen('test-season', store)).toEqual(snapshotOf(g0, config));
    expect(readSeen('other', store)).toBeNull();
  });

  it('a malformed snapshot is ignored; a storage that throws is no storage', () => {
    const store = memory();
    store.setItem('sq.seen.v1', '{"test-season":{"seasonId":"test-season","teams":7}}');
    expect(readSeen('test-season', store)).toBeNull();
    store.setItem('sq.seen.v1', 'not json');
    expect(readSeen('test-season', store)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeen('test-season', broken)).toBeNull();
    expect(() => writeSeen(snapshotOf(g0, config), broken)).not.toThrow();
    expect(readSeen('test-season', null)).toBeNull();
  });
});

describe('the batches of moments (D-56)', () => {
  it('the first visit plays nothing and remembers what it showed', () => {
    const store = memory();
    const tracker = momentsTracker(seenIn(store));
    expect(tracker.next(g0, config)).toBeNull();
    expect(readSeen('test-season', store)).toEqual(snapshotOf(g0, config));
  });

  it('over a remembered snapshot: «since» with its time and cells, then «live», ids growing', () => {
    const store = memory();
    writeSeen(snapshotOf(g0, config), store);
    const tracker = momentsTracker(seenIn(store));
    const first = tracker.next(g1, config);
    expect(first).toMatchObject({
      id: 1,
      kind: 'since',
      since: g0.dataAsOf,
      before: g0.teams.map((t) => ({ teamId: t.teamId, position: t.position })),
    });
    expect(first?.events.some((e) => e.kind === 'gain')).toBe(true);
    const second = tracker.next(g0, config);
    expect(second).toMatchObject({ id: 2, kind: 'live' });
    expect(readSeen('test-season', store)).toEqual(snapshotOf(g0, config));
  });

  it('the cache shown first changes nothing: the next batch with events is still «since»', () => {
    const store = memory();
    writeSeen(snapshotOf(g0, config), store);
    const tracker = momentsTracker(seenIn(store));
    expect(tracker.next(g0, config)).toBeNull();
    expect(tracker.next(g1, config)?.kind).toBe('since');
  });

  it('another season reads its own memory', () => {
    const store = memory();
    const tracker = momentsTracker(seenIn(store));
    tracker.next(g0, config);
    const other = { ...config, id: 'other-season' };
    expect(tracker.next(g1, other)).toBeNull();
    expect(readSeen('other-season', store)).not.toBeNull();
  });
});

describe('«Герои дня» (D-56)', () => {
  it('points brought since the end of yesterday, most first, ties by name, the top ten', () => {
    const heroes = heroesOf(g1, g0);
    expect(heroes).toEqual([{ managerId: 'a', name: 'Борисова Анна', teamId: 't1', points: 17 }]);
    expect(HEROES).toBe(10);
  });

  it('on the first day of the game «then» is nobody: all points count', () => {
    expect(heroesOf(g0, null).map((h) => [h.managerId, h.points])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('less than half a point is not a hero («+0»)', () => {
    expect(heroesOf(g0, g0)).toEqual([]);
  });
});
