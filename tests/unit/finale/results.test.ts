import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { bestInTeams, podiumOf, topOperators } from '../../../src/finale/results.ts';
import {
  achievement,
  at,
  daily,
  grant,
  makeConfig,
  manager,
  team,
  teamSteps,
} from '../../support/builders.ts';

const manual = { type: 'manual' } as const;
const game = (
  config: SeasonConfig,
  records: MetricRecord[],
  adjustments: Adjustment[] = [],
  today = '2026-10-14',
) => computeGameState({ config, records, adjustments, imports: [] }, at(today));

describe('the podium (D-59)', () => {
  const teams = [
    team('t1', 1, { sourceCode: 'СР1' }),
    team('t2', 2, { sourceCode: 'СР2' }),
    team('t3', 3, { sourceCode: 'СР3' }),
  ];
  const people = [manager('a', 't1'), manager('b', 't2'), manager('c', 't3')];

  it('the podium: by cells, then by the share of the plan', () => {
    const config = makeConfig({ teams, managers: people });
    // t1 has the larger share (30 of 75), t2 stands a cell further by the admin's steps.
    const g = game(
      config,
      [
        daily('a', '2026-10-06', { pay: 3 }),
        daily('b', '2026-10-06', { pay: 2 }),
        daily('c', '2026-10-06', { pay: 1 }),
      ],
      [teamSteps('s1', 't2', 4, at('2026-10-08'))],
    );
    const podium = podiumOf(g, config);
    expect(podium.map((p) => [p.place, p.teamId])).toEqual([
      [1, 't2'],
      [2, 't1'],
      [3, 't3'],
    ]);
    expect(podium[0]?.title).toBe('СР2 • Руководитель 2');
    expect(podium[1]?.progress).toBeGreaterThan(podium[0]?.progress ?? 1);
  });

  it('two teams on one cell are told apart by the share', () => {
    const config = makeConfig({ teams, managers: people });
    const g = game(config, [
      daily('a', '2026-10-06', { pay: 3 }),
      daily('b', '2026-10-06', { pay: 3, inv6: 1 }),
    ]);
    const podium = podiumOf(g, config);
    expect(podium[0]?.position).toBe(podium[1]?.position);
    expect(podium.map((p) => [p.place, p.teamId])).toEqual([
      [1, 't2'],
      [2, 't1'],
      [3, 't3'],
    ]);
  });

  it('an exact tie shares a place', () => {
    const config = makeConfig({
      teams: [...teams, team('t4', 4)],
      managers: [...people, manager('d', 't4')],
    });
    const g = game(config, [
      daily('a', '2026-10-06', { pay: 3 }),
      daily('b', '2026-10-06', { pay: 3 }),
      daily('c', '2026-10-06', { pay: 2 }),
      daily('d', '2026-10-06', { pay: 1 }),
    ]);
    expect(podiumOf(g, config).map((p) => [p.place, p.teamId])).toEqual([
      [1, 't1'],
      [1, 't2'],
      [3, 't3'],
    ]);
  });
});

describe('the best in each team (D-59)', () => {
  it('the best in each team: today’s members, by what they brought the team', () => {
    const config = makeConfig({
      teams: [team('t1', 1), team('t2', 2)],
      managers: [
        manager('a', 't1'),
        manager('f', 't1', { firedAt: '2026-10-09' }),
        manager('m', 't1', {
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-12' },
          ],
        }),
        manager('b', 't2'),
        manager('v', 't2', { vacations: [{ from: '2026-10-13', to: '2026-10-16' }] }),
      ],
    });
    const g = game(config, [
      daily('a', '2026-10-06', { pay: 3 }),
      daily('f', '2026-10-06', { pay: 9 }),
      daily('m', '2026-10-06', { pay: 5 }),
      daily('m', '2026-10-13', { pay: 1 }),
      daily('b', '2026-10-06', { pay: 2 }),
      daily('v', '2026-10-06', { pay: 4 }),
    ]);
    expect(bestInTeams(g, config).map((b) => [b.teamId, b.managerId, b.points])).toEqual([
      ['t1', 'a', 30],
      ['t2', 'v', 40],
    ]);
  });

  it('a team without points has no card', () => {
    const config = makeConfig({
      teams: [team('t1', 1), team('t2', 2)],
      managers: [manager('a', 't1'), manager('c', 't2')],
    });
    const g = game(config, [daily('a', '2026-10-06', { pay: 1 })]);
    expect(bestInTeams(g, config).map((b) => b.teamId)).toEqual(['t1']);
  });
});

describe('the best of the best (D-59)', () => {
  it('the top 3 of the game, the fired left out, with badges', () => {
    const config = makeConfig({
      teams: [team('t1', 1), team('t2', 2)],
      managers: [
        manager('a', 't1'),
        manager('b', 't1'),
        manager('c', 't2'),
        manager('f', 't2', { firedAt: '2026-10-09' }),
      ],
      achievements: [achievement('five', manual, { title: 'Пятёрка', rarity: 'rare' })],
    });
    const g = game(
      config,
      [
        daily('a', '2026-10-06', { pay: 3 }),
        daily('b', '2026-10-06', { pay: 2 }),
        daily('c', '2026-10-06', { pay: 1 }),
        daily('f', '2026-10-06', { pay: 9 }),
      ],
      [grant('g1', 'five', { managerId: 'a' }, at('2026-10-07'))],
    );
    const top = topOperators(g, config);
    expect(top.map((t) => [t.rank, t.managerId, t.points])).toEqual([
      [1, 'a', 30],
      [2, 'b', 20],
      [3, 'c', 10],
    ]);
    expect(top[0]?.badges.map((b) => b.title)).toEqual(['Пятёрка']);
    expect(topOperators(g, config, 2)).toHaveLength(2);
  });
});
