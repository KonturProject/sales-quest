import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import {
  SIGNIFICANT_ROWS,
  bestInTeams,
  departmentTotals,
  finaleOf,
  finaleOrNull,
  manualCount,
  podiumColumns,
  podiumOf,
  significantOf,
  topOperators,
  type PodiumPlace,
} from '../../../src/finale/results.ts';
import {
  achievement,
  at,
  daily,
  grant,
  makeConfig,
  manager,
  managerPoints,
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
      [
        1,
        [
          ['a', 0],
          ['b', 1],
        ],
      ],
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

describe('significant achievements (D-59)', () => {
  const config = makeConfig({
    teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2)],
    managers: [
      manager('a', 't1', { fullName: 'Абрамов Иван' }),
      manager('b', 't1', { fullName: 'Борисова Анна' }),
      manager('c', 't1', { fullName: 'Волков Пётр' }),
      manager('d', 't2', { fullName: 'Гусева Ольга' }),
      manager('f', 't2', { fullName: 'Егорова Нина', firedAt: '2026-10-12' }),
    ],
    achievements: [
      achievement('open', manual, { title: 'Открыл счёт' }),
      achievement('five', manual, { title: 'Пятёрка', rarity: 'rare' }),
      achievement('pioneer', manual, { title: 'Первопроходец', rarity: 'epic', scope: 'team' }),
      achievement('stable', manual, { title: 'Стабильность', rarity: 'legendary' }),
    ],
  });
  const g = game(
    config,
    [],
    [
      grant('g1', 'stable', { managerId: 'f' }, at('2026-10-06')),
      grant('g2', 'stable', { managerId: 'b' }, at('2026-10-07')),
      grant('g3', 'stable', { managerId: 'a' }, at('2026-10-07')),
      grant('g4', 'stable', { managerId: 'c' }, at('2026-10-08')),
      grant('g5', 'stable', { managerId: 'd' }, at('2026-10-09')),
      grant('g6', 'pioneer', { teamId: 't1' }, at('2026-10-09')),
      grant('g7', 'five', { managerId: 'a' }, at('2026-10-09')),
      grant('g8', 'open', { managerId: 'a' }, at('2026-10-09')),
    ],
  );

  it('significant: legendary, then epic, of operators and teams; rare and common left out', () => {
    const rows = significantOf(g, config);
    expect(rows.map((r) => [r.title, r.rarity])).toEqual([
      ['Стабильность', 'legendary'],
      ['Первопроходец', 'epic'],
    ]);
    expect(rows[0]?.holders).toEqual(['Абрамов И.', 'Борисова А.', 'Волков П.']);
    expect(rows[0]?.more).toBe(1);
    expect(rows[1]?.holders).toEqual(['СР1 • Руководитель 1']);
    expect(SIGNIFICANT_ROWS).toBe(6);
  });
});

describe('significant achievements of one title (D-59, as D-58)', () => {
  it('three «Первопроходец» fold into one row; a team that took two reads «×2»', () => {
    const config = makeConfig({
      teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2)],
      managers: [manager('a', 't1', { fullName: 'Абрамов Иван' }), manager('b', 't2')],
      achievements: [
        achievement('p2', manual, { title: 'Первопроходец', rarity: 'epic', scope: 'team' }),
        achievement('p3', manual, { title: 'Первопроходец', rarity: 'epic', scope: 'team' }),
        achievement('lead', manual, {
          title: 'Лидер недели',
          rarity: 'epic',
          repeatable: 'weekly',
        }),
      ],
    });
    const g = game(
      config,
      [],
      [
        grant('g1', 'p2', { teamId: 't1' }, at('2026-10-07')),
        grant('g2', 'p3', { teamId: 't1' }, at('2026-10-09')),
        grant('g3', 'p3', { teamId: 't2' }, at('2026-10-08')),
        grant('g4', 'lead', { managerId: 'a' }, at('2026-10-09')),
        grant('g5', 'lead', { managerId: 'a' }, at('2026-10-13')),
      ],
    );
    expect(significantOf(g, config).map((r) => [r.title, r.holders])).toEqual([
      ['Первопроходец', ['СР1 • Руководитель 1 ×2', 'Руководитель 2']],
      ['Лидер недели', ['Абрамов И. ×2']],
    ]);
  });
});

describe('the department’s result (D-59)', () => {
  const config = makeConfig({
    teams: [team('t1', 1)],
    managers: [manager('a', 't1'), manager('f', 't1', { firedAt: '2026-10-12' })],
  });
  const records = [
    daily('a', '2026-10-06', { pay: 2, inv6: 5 }),
    daily('f', '2026-10-06', { pay: 1, inv20: 2 }),
  ];
  const fix = (reason: string, value: number): Adjustment => ({
    ...managerPoints('p1', 'a', value, at('2026-10-08')),
    reason,
  });

  it('the department’s totals: every operator’s metrics, the fired included', () => {
    const totals = departmentTotals(game(config, records), config, []);
    expect(totals.metrics).toEqual([
      { id: 'inv6', title: 'Качественные счета', total: 5 },
      { id: 'inv20', title: 'Разговоры от 20 минут', total: 2 },
      { id: 'pay', title: 'Оплаты', total: 3 },
    ]);
  });

  it('a manual «Оплаты +1» is counted from its reason', () => {
    const plus = fix('Оплаты +1: поздняя оплата', 10);
    const minus = fix('Оплаты −1: посчитана дважды', -10);
    expect(manualCount(plus, config)).toEqual({ metricId: 'pay', count: 1 });
    expect(manualCount(minus, config)).toEqual({ metricId: 'pay', count: -1 });
    const totals = departmentTotals(game(config, records, [plus]), config, [plus]);
    expect(totals.metrics.find((m) => m.id === 'pay')?.total).toBe(4);
  });

  it('an unreadable correction is not guessed', () => {
    for (const a of [
      fix('поздняя оплата', 10),
      fix('Оплаты +2: поздняя оплата', 10),
      teamSteps('s1', 't1', 2, at('2026-10-08')),
    ])
      expect(manualCount(a, config)).toBeNull();
    const odd = fix('Оплаты +2: поздняя оплата', 10);
    const totals = departmentTotals(game(config, records, [odd]), config, [odd]);
    expect(totals.metrics.find((m) => m.id === 'pay')?.total).toBe(3);
  });

  it('the plan share and the achievements', () => {
    const g = game(config, records);
    const totals = departmentTotals(g, config, []);
    const points = g.teams.reduce((s, t) => s + t.points, 0);
    const plan = g.teams.reduce((s, t) => s + t.targetPoints, 0);
    expect(totals.planShare).toBeCloseTo(points / plan);
    expect(totals.achievements).toBe(g.unlocks.length);
  });

  it('no finale while the game runs', () => {
    const g = game(config, records);
    expect(finaleOf(g, config, [])).toBeNull();
    const closed = { ...config, status: 'closed' as const, closedAt: '2026-10-26T13:00:00+03:00' };
    expect(finaleOf(g, { ...config, status: 'closed' }, [])).toBeNull();
    const finale = finaleOf(game(closed, records), closed, []);
    expect(finale?.closedAt).toBe('2026-10-26T13:00:00+03:00');
    expect(finale?.podium.map((p) => p.teamId)).toEqual(['t1']);
    expect(finale?.best.map((b) => b.managerId)).toEqual(['a']);
    expect(finale?.top.map((t) => t.managerId)).toEqual(['a']);
    expect(finale?.totals.metrics).toHaveLength(3);
  });
});

describe('the finale never costs the map (review D-59)', () => {
  it('a finale that cannot be computed is no finale, not an error page', () => {
    const config = {
      ...makeConfig(),
      status: 'closed' as const,
      closedAt: '2026-10-26T13:00:00+03:00',
    };
    const g = game(config, []);
    const broken = { ...g, teams: undefined } as unknown as typeof g;
    expect(() => finaleOf(broken, config, [])).toThrow();
    expect(finaleOrNull(broken, config, [])).toBeNull();
    expect(finaleOrNull(g, config, [])?.closedAt).toBe(config.closedAt);
  });
});
