import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { buildLeaderboard } from '../../../src/engine/leaderboard.ts';
import { buildDailySeries } from '../../../src/engine/scoring.ts';
import { at, daily, makeConfig, manager, managerPoints } from '../../support/builders.ts';

const config = makeConfig({
  managers: [
    manager('a', 't1'),
    manager('b', 't1'),
    manager('c', 't2'),
    manager('d', 't2', { firedAt: '2026-10-09' }),
  ],
});
const records = [
  daily('a', '2026-10-06', { pay: 2 }), // 20
  daily('b', '2026-10-06', { inv20: 5, inv6: 5 }), // 20
  daily('c', '2026-10-06', { pay: 1, inv20: 3, inv6: 1 }), // 20
  daily('d', '2026-10-06', { pay: 5 }), // 50, fired
];

function board(
  input: {
    records?: MetricRecord[];
    adjustments?: Adjustment[];
    config?: SeasonConfig;
    from?: string;
    to?: string;
  } = {},
) {
  const c = input.config ?? config;
  return buildLeaderboard({
    config: c,
    series: buildDailySeries(input.records ?? records, c.period).series,
    adjustments: input.adjustments ?? [],
    from: input.from ?? '2026-10-05',
    to: input.to ?? '2026-10-18',
    today: '2026-10-16',
  });
}

describe('buildLeaderboard (FR-LB-1, FR-LB-5, D-16, R-5)', () => {
  it('breaks equal points by metrics of falling weight: pay, then inv20', () => {
    expect(board().map((r) => [r.managerId, r.points, r.rank])).toEqual([
      ['a', 20, 1],
      ['c', 20, 2],
      ['b', 20, 3],
      ['d', 50, null],
    ]);
  });

  it('then by name in Russian alphabetical order', () => {
    const twins = makeConfig({
      managers: [
        manager('x', 't1', { fullName: 'Борисов Борис' }),
        manager('y', 't1', { fullName: 'Алексеев Алексей' }),
      ],
    });
    const rows = board({
      config: twins,
      records: [daily('x', '2026-10-06', { pay: 1 }), daily('y', '2026-10-06', { pay: 1 })],
    });
    expect(rows.map((r) => r.fullName)).toEqual(['Алексеев Алексей', 'Борисов Борис']);
  });

  it('lists fired managers last without a rank, keeping their totals', () => {
    const d = board().find((r) => r.managerId === 'd');
    expect([d?.fired, d?.rank, d?.totals]).toEqual([true, null, { pay: 5 }]);
  });

  it('counts only the range and point adjustments made in it', () => {
    const rows = board({
      records: [...records, daily('b', '2026-10-13', { pay: 1 })],
      adjustments: [
        managerPoints('p', 'c', 30, at('2026-10-14')),
        managerPoints('q', 'a', 99, at('2026-10-06')),
      ],
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(rows.slice(0, 3).map((r) => [r.managerId, r.points])).toEqual([
      ['c', 30],
      ['b', 10],
      ['a', 0],
    ]);
  });

  it("shows the manager's current team after a transfer", () => {
    const moved = makeConfig({
      managers: [
        manager('m', 't1', {
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-12' },
          ],
        }),
      ],
    });
    expect(board({ config: moved, records: [] })[0]?.teamId).toBe('t2');
  });
});
