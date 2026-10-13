import { describe, expect, it } from 'vitest';
import type { Unlock } from '../../../src/engine/gameState.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { diffMoments, type MomentEvent } from '../../../src/moments/events.ts';
import { snapshotOf, type Snapshot } from '../../../src/moments/snapshot.ts';
import { at, daily, makeConfig, manager, team } from '../../support/builders.ts';

const config = makeConfig({
  teams: [team('t1', 1), team('t2', 2), team('t3', 3)],
  managers: [
    manager('a', 't1', { fullName: 'Борисова Анна' }),
    manager('b', 't1', { fullName: 'Абрамов Иван' }),
    manager('c', 't2', { fullName: 'Волков Пётр' }),
  ],
  achievements: [
    {
      id: 'hat',
      title: 'Хет-трик',
      description: '',
      icon: 'hat',
      scope: 'manager',
      rarity: 'common',
      rule: { type: 'threshold', metric: 'inv6', period: 'day', op: '>=', value: 3 },
      repeatable: 'daily',
      bonusPoints: 0,
      enabled: true,
    },
    {
      id: 'legend',
      title: 'Легенда',
      description: '',
      icon: 'legend',
      scope: 'manager',
      rarity: 'legendary',
      rule: { type: 'threshold', metric: 'pay', period: 'day', op: '>=', value: 5 },
      repeatable: false,
      bonusPoints: 0,
      enabled: true,
    },
  ],
});

const A = {
  managerId: 'a',
  teamId: 't1',
  points: 30,
  achievementPoints: 0,
  totals: { inv6: 10, inv20: 5, pay: 0 },
};
const B = {
  managerId: 'b',
  teamId: 't1',
  points: 10,
  achievementPoints: 0,
  totals: { inv6: 4, inv20: 2, pay: 0 },
};

/** A snapshot by hand: three teams, two operators, a 20-cell track. */
function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    seasonId: 'test-season',
    key: 'test-season|20|30|inv20:3,inv6:1,pay:10',
    dataAsOf: '2026-10-13T10:00:00+03:00',
    trackLength: 20,
    teams: [
      { teamId: 't1', position: 4, points: 40, locationIndex: 1 },
      { teamId: 't2', position: 6, points: 60, locationIndex: 2 },
      { teamId: 't3', position: 2, points: 20, locationIndex: 1 },
    ],
    managers: [A, B],
    unlocks: {},
    ...over,
  };
}
const moveTeam = (s: Snapshot, teamId: string, change: Partial<Snapshot['teams'][number]>) => ({
  ...s,
  teams: s.teams.map((t) => (t.teamId === teamId ? { ...t, ...change } : t)),
});
const kinds = (events: MomentEvent[]) => events.map((e) => e.kind);
const unlock = (achievementId: string, managerId: string, unlockedAt: string): Unlock => ({
  achievementId,
  managerId,
  unlockedAt,
  source: 'auto',
});

describe('the snapshot (D-56)', () => {
  it('keeps cells, points and numbers by id — no names — and counts unlocks per key', () => {
    const game = computeGameState(
      {
        config,
        records: [daily('a', '2026-10-06', { inv6: 3, inv20: 1, pay: 0 })],
        adjustments: [],
        imports: [],
      },
      at('2026-10-07'),
    );
    const s = snapshotOf(game, config);
    expect(s.seasonId).toBe('test-season');
    expect(s.key).toBe(
      `test-season|${game.track.trackLength}|${game.track.maxPosition}|inv20:3,inv6:1,pay:10`,
    );
    expect(s.teams.map((t) => t.teamId)).toEqual(['t1', 't2', 't3']);
    expect(s.managers.find((m) => m.managerId === 'a')).toMatchObject({
      teamId: 't1',
      points: 6,
      totals: { inv6: 3, inv20: 1, pay: 0 },
    });
    expect(JSON.stringify(s)).not.toContain('Борисова');
    expect(s.unlocks).toEqual({ 'hat|a|': 1 });
  });
});

describe('the events of «было → стало» (D-56)', () => {
  it("a team's points: «было → стало» with the cells", () => {
    const after = moveTeam(snap(), 't1', { points: 52, position: 5 });
    expect(diffMoments(snap(), after, [], config)).toContainEqual({
      kind: 'team_points',
      teamId: 't1',
      from: 40,
      to: 52,
      cellsFrom: 4,
      cellsTo: 5,
    });
  });

  it('who brought points: the grown metrics and bonus, largest first, ties by name', () => {
    const after = snap({
      managers: [
        {
          managerId: 'a',
          teamId: 't1',
          points: 34,
          achievementPoints: 0,
          totals: { inv6: 12, inv20: 5, pay: 0 },
        },
        {
          managerId: 'b',
          teamId: 't1',
          points: 14,
          achievementPoints: 2,
          totals: { inv6: 6, inv20: 2, pay: 0 },
        },
        {
          managerId: 'c',
          teamId: 't2',
          points: 4,
          achievementPoints: 0,
          totals: { inv6: 4, inv20: 0, pay: 0 },
        },
      ],
    });
    const gains = diffMoments(snap(), after, [], config).filter((e) => e.kind === 'gain');
    // «Абрамов» (b) and «Борисова» (a) brought 4 each; «Волков» (c) is new — from 0.
    expect(gains).toEqual([
      { kind: 'gain', managerId: 'b', teamId: 't1', points: 4, metrics: { inv6: 2 }, bonus: 2 },
      { kind: 'gain', managerId: 'a', teamId: 't1', points: 4, metrics: { inv6: 2 }, bonus: 0 },
      { kind: 'gain', managerId: 'c', teamId: 't2', points: 4, metrics: { inv6: 4 }, bonus: 0 },
    ]);
  });

  it('a correction by points has no metrics', () => {
    const after = snap({ managers: [{ ...A, points: 35 }, B] });
    expect(diffMoments(snap(), after, [], config).filter((e) => e.kind === 'gain')).toEqual([
      { kind: 'gain', managerId: 'a', teamId: 't1', points: 5, metrics: {}, bonus: 0 },
    ]);
  });

  it('decreases are not celebrated: the team counts down, nobody «brought» anything', () => {
    const after = moveTeam(snap({ managers: [{ ...A, points: 20 }, B] }), 't1', {
      points: 30,
      position: 3,
    });
    expect(kinds(diffMoments(snap(), after, [], config))).toEqual(['team_points']);
  });

  it('another season, track or weights: no events', () => {
    const after = moveTeam(snap({ key: 'other' }), 't1', { points: 99, position: 9 });
    expect(diffMoments(snap(), after, [], config)).toEqual([]);
  });

  it('a gate: a team moved forward into a later location', () => {
    const after = moveTeam(snap(), 't1', { position: 6, points: 60, locationIndex: 2 });
    expect(diffMoments(snap(), after, [], config)).toContainEqual({
      kind: 'gate',
      teamId: 't1',
      locationIndex: 2,
    });
    const back = moveTeam(snap(), 't2', { position: 4, points: 40, locationIndex: 1 });
    expect(kinds(diffMoments(snap(), back, [], config))).not.toContain('gate');
  });

  it('an overtake: strictly ahead of a team that was strictly ahead; the same cell is not one', () => {
    const passed = moveTeam(snap(), 't1', { position: 7, points: 70, locationIndex: 2 });
    expect(diffMoments(snap(), passed, [], config)).toContainEqual({
      kind: 'overtake',
      teamId: 't1',
      passed: ['t2'],
    });
    const level = moveTeam(snap(), 't1', { position: 6, points: 60, locationIndex: 2 });
    expect(kinds(diffMoments(snap(), level, [], config))).not.toContain('overtake');
    // t2 pushed back behind t1 by a correction: t1 did not move — no overtake.
    const pushed = moveTeam(snap(), 't2', { position: 3, points: 30, locationIndex: 1 });
    expect(kinds(diffMoments(snap(), pushed, [], config))).not.toContain('overtake');
  });

  it('a new leader: alone first now and not before; a tie at the top or a pushed-back rival is none', () => {
    const lead = moveTeam(snap(), 't1', { position: 7, points: 70, locationIndex: 2 });
    expect(diffMoments(snap(), lead, [], config)).toContainEqual({ kind: 'leader', teamId: 't1' });
    const tie = moveTeam(snap(), 't1', { position: 6, points: 60, locationIndex: 2 });
    expect(kinds(diffMoments(snap(), tie, [], config))).not.toContain('leader');
    const fromTie = moveTeam(tie, 't1', { position: 8, points: 80 });
    expect(diffMoments(tie, fromTie, [], config)).toContainEqual({ kind: 'leader', teamId: 't1' });
    const still = moveTeam(snap(), 't2', { position: 9, points: 90, locationIndex: 2 });
    expect(kinds(diffMoments(snap(), still, [], config))).not.toContain('leader');
    const pushed = moveTeam(snap(), 't2', { position: 3, points: 30, locationIndex: 1 });
    expect(kinds(diffMoments(snap(), pushed, [], config))).not.toContain('leader');
  });

  it('the finish: a team reached the track length', () => {
    const before = moveTeam(snap(), 't2', { position: 19, points: 190, locationIndex: 4 });
    const after = moveTeam(before, 't2', { position: 21, points: 210 });
    expect(diffMoments(before, after, [], config)).toContainEqual({ kind: 'finish', teamId: 't2' });
    expect(
      kinds(diffMoments(after, moveTeam(after, 't2', { position: 22, points: 220 }), [], config)),
    ).not.toContain('finish');
  });

  it('achievements by count per key: a moved date shows nothing again; by date, then rarity', () => {
    const before = snap({ unlocks: { 'hat|a|': 1 } });
    const moved = [unlock('hat', 'a', '2026-10-09')];
    expect(diffMoments(before, snap({ unlocks: { 'hat|a|': 1 } }), moved, config)).toEqual([]);
    const unlocks = [
      unlock('hat', 'a', '2026-10-06'),
      unlock('hat', 'a', '2026-10-13'),
      unlock('hat', 'b', '2026-10-13'),
      unlock('legend', 'b', '2026-10-13'),
    ];
    const after = snap({ unlocks: { 'hat|a|': 2, 'hat|b|': 1, 'legend|b|': 1 } });
    const events = diffMoments(before, after, unlocks, config).filter(
      (e) => e.kind === 'achievement',
    );
    expect(events.map((e) => (e.kind === 'achievement' ? e.unlock : null))).toEqual([
      unlock('legend', 'b', '2026-10-13'),
      unlock('hat', 'a', '2026-10-13'),
      unlock('hat', 'b', '2026-10-13'),
    ]);
  });
});
