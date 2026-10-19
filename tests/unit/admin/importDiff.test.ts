import { describe, expect, it } from 'vitest';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import { doubleCounts, importChanges } from '../../../src/admin/importDiff.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { at, daily, makeConfig, manager, managerPoints, team } from '../../support/builders.ts';

// makeConfig: inv6 «Качественные счета» ×1, inv20 «Разговоры от 20 минут» ×3, pay «Оплаты» ×10.
const config = makeConfig({
  teams: [team('t1', 1), team('t2', 2)],
  managers: [
    manager('a', 't2', { fullName: 'Ершова Мария' }),
    manager('b', 't1', { fullName: 'Белова Анна' }),
    manager('c', 't1', { fullName: 'Андреева Ольга' }),
  ],
});
const season = (records: MetricRecord[], adjustments: Adjustment[] = []): EngineInput => ({
  config,
  records,
  adjustments,
  imports: [],
});
/** A «показатели за день» correction as `applyCorrections` writes it. */
const fix = (id: string, managerId: string, reason: string, value: number, date: string) => ({
  ...managerPoints(id, managerId, value, at('2026-10-08'), date),
  reason,
});
const DAYS: [string, string] = ['2026-10-06', '2026-10-07'];

describe('what a file changes per operator (2b-3)', () => {
  it('a row for each operator the file changes: было → по выгрузке, over the file’s days', () => {
    const before = season([
      daily('a', '2026-10-06', { inv20: 2 }),
      daily('b', '2026-10-06', { inv6: 1 }),
    ]);
    const after = season([
      daily('a', '2026-10-06', { inv20: 3 }),
      daily('a', '2026-10-07', { inv20: 1 }),
      daily('b', '2026-10-06', { inv6: 1 }),
    ]);
    const rows = importChanges(before, after, DAYS);
    expect(rows.map((r) => [r.managerId, r.name, r.teamId])).toEqual([['a', 'Ершова Мария', 't2']]);
    const inv20 = rows[0]?.metrics.find((m) => m.metricId === 'inv20');
    expect(inv20).toEqual({
      metricId: 'inv20',
      title: 'Разговоры от 20 минут',
      before: 2,
      file: 4,
      manual: 0,
    });
    expect(rows[0]?.metrics.map((m) => m.metricId)).toEqual(['inv6', 'inv20', 'pay']);
    expect(
      rows[0]?.days.map((d) => [
        d.date,
        d.metrics.find((m) => m.metricId === 'inv20')?.before,
        d.metrics.find((m) => m.metricId === 'inv20')?.file,
      ]),
    ).toEqual([
      ['2026-10-06', 2, 3],
      ['2026-10-07', 0, 1],
    ]);
  });

  it('rows by the team’s order, then the name', () => {
    const before = season([]);
    const after = season([
      daily('a', '2026-10-06', { inv6: 1 }),
      daily('b', '2026-10-06', { inv6: 1 }),
      daily('c', '2026-10-06', { inv6: 1 }),
    ]);
    expect(importChanges(before, after, DAYS).map((r) => r.managerId)).toEqual(['c', 'b', 'a']);
  });

  it('the manual count: active «показатели» corrections of the days, cancelled ones out', () => {
    const records = [daily('a', '2026-10-06', { inv20: 2 })];
    const plus = fix('p1', 'a', 'Разговоры от 20 минут +1: нет в воронке', 3, '2026-10-06');
    const gone: Adjustment = {
      ...fix('p2', 'a', 'Разговоры от 20 минут +1: ошибка', 3, '2026-10-07'),
      revoked: { by: 'k', at: at('2026-10-09'), reason: 'ошибка' },
    };
    const rows = importChanges(season(records), season(records, [plus, gone]), DAYS);
    expect(rows[0]?.metrics.find((m) => m.metricId === 'inv20')).toMatchObject({
      before: 2,
      file: 2,
      manual: 1,
    });
    expect(rows[0]?.days.map((d) => d.date)).toEqual(['2026-10-06']);
  });

  it('an operator new in the file: было 0', () => {
    const fresh = makeConfig({
      ...config,
      managers: [...config.managers, manager('n', 't1', { fullName: 'Новикова Вера' })],
    });
    const rows = importChanges(
      season([]),
      { ...season([daily('n', '2026-10-07', { pay: 1 })]), config: fresh },
      DAYS,
    );
    expect(rows.map((r) => r.name)).toEqual(['Новикова Вера']);
    expect(rows[0]?.metrics.find((m) => m.metricId === 'pay')).toMatchObject({
      before: 0,
      file: 1,
    });
  });
});

describe('a double count: the file brings what a correction added (2b-3)', () => {
  const plus = fix('p1', 'a', 'Качественные счета +1: нет в воронке', 1, '2026-10-06');

  it('the file raises a day a manual correction had added', () => {
    const before = season([daily('a', '2026-10-06', { inv6: 1 })], [plus]);
    const after = season([daily('a', '2026-10-06', { inv6: 2 })], [plus]);
    expect(doubleCounts(before, after, DAYS)).toEqual([
      {
        managerId: 'a',
        date: '2026-10-06',
        metricId: 'inv6',
        raised: 1,
        manual: 1,
        adjustmentIds: ['p1'],
      },
    ]);
  });

  it('no hint: offset by a «−1», not raised, or raised on another day', () => {
    const minus = fix('p2', 'a', 'Качественные счета −1: посчитан дважды', -1, '2026-10-06');
    const raised = [daily('a', '2026-10-06', { inv6: 2 })];
    const was = [daily('a', '2026-10-06', { inv6: 1 })];
    expect(doubleCounts(season(was, [plus, minus]), season(raised, [plus, minus]), DAYS)).toEqual(
      [],
    );
    expect(doubleCounts(season(was, [plus]), season(was, [plus]), DAYS)).toEqual([]);
    const otherDay = [daily('a', '2026-10-06', { inv6: 1 }), daily('a', '2026-10-07', { inv6: 1 })];
    expect(doubleCounts(season(was, [plus]), season(otherDay, [plus]), DAYS)).toEqual([]);
  });

  it('the batch’s own fix is not a double count', () => {
    const before = season([daily('a', '2026-10-06', { inv6: 1 })]);
    const after = season([daily('a', '2026-10-06', { inv6: 2 })], [plus]);
    expect(doubleCounts(before, after, DAYS)).toEqual([]);
  });
});
