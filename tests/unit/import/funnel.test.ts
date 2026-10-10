import { describe, expect, it } from 'vitest';
import { parseFunnel } from '../../../src/import/funnel.ts';
import { ImportError } from '../../../src/import/grid.ts';
import { DEFAULT_FUNNEL } from '../../../src/import/profiles.ts';
import { funnelGrid, type FunnelGroup } from '../../support/grids.ts';

const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
const groups: FunnelGroup[] = [
  {
    code: 'СР1',
    name: 'Пл_НП_СР_Город_СР1_Входящие',
    people: [
      { name: 'Ершова Мария', days: { '2026-10-05': [3, 1], '2026-10-12': [2, 0] } },
      { name: 'Фёдоров  Иван', days: { '2026-10-06': [1, 4] } },
    ],
  },
  {
    code: 'СР5',
    name: 'Пл_НП_СР_Город_СР5_Исходящие',
    people: [{ name: 'Белова Анна', days: { '2026-10-07': [0, 2] } }],
  },
];

describe('the funnel (D-19, IMPORT_FORMATS §1)', () => {
  it('reads quality invoices and 20-minute calls per employee and day', () => {
    const p = parseFunnel(funnelGrid({ dates, groups }), DEFAULT_FUNNEL);
    expect(p.profileId).toBe('funnel');
    expect(p.metrics).toEqual(['inv6', 'inv20']);
    expect(p.rows).toContainEqual({
      name: 'Ершова Мария',
      group: 'СР1',
      date: '2026-10-05',
      values: { inv6: 3, inv20: 1 },
    });
    // An empty cell is no data: 0.
    expect(p.rows).toContainEqual({
      name: 'Ершова Мария',
      group: 'СР1',
      date: '2026-10-06',
      values: { inv6: 0, inv20: 0 },
    });
    expect(p.rows).toContainEqual({
      name: 'Белова Анна',
      group: 'СР5',
      date: '2026-10-07',
      values: { inv6: 0, inv20: 2 },
    });
    expect(p.rows).toHaveLength(3 * dates.length);
    expect(p.period).toEqual(['2026-10-05', '2026-10-12']);
    expect(p.days).toEqual(dates);
    expect(p.groups).toEqual(['СР1', 'СР5']);
    expect(p.people).toEqual([
      { name: 'Ершова Мария', group: 'СР1' },
      { name: 'Фёдоров  Иван', group: 'СР1' },
      { name: 'Белова Анна', group: 'СР5' },
    ]);
    expect(p.warnings).toEqual([]);
  });

  it('finds blocks by name after a shift', () => {
    const plain = parseFunnel(funnelGrid({ dates, groups }), DEFAULT_FUNNEL);
    const shifted = parseFunnel(
      funnelGrid({ dates, groups, extraBlockFirst: true }),
      DEFAULT_FUNNEL,
    );
    expect(shifted.rows).toEqual(plain.rows);
  });

  it('a missing block is an error naming it', () => {
    const grid = funnelGrid({
      dates,
      groups,
      blocks: { inv6: 'Качественные счета (новые)', inv20: 'Разговоры от 20 минут' },
    });
    expect(() => parseFunnel(grid, DEFAULT_FUNNEL)).toThrow(ImportError);
    expect(() => parseFunnel(grid, DEFAULT_FUNNEL)).toThrow(/«Качественные счета»/);
  });

  it('skips week totals, the department total and the tail', () => {
    const p = parseFunnel(funnelGrid({ dates, groups }), DEFAULT_FUNNEL);
    expect(new Set(p.rows.map((r) => r.date))).toEqual(new Set(dates));
    expect(p.people.map((x) => x.name)).not.toContain('Общий итог');
    expect(p.people.map((x) => x.name)).not.toContain('');
  });

  it('warns when employees do not add up to their group or the groups to the total', () => {
    const broken: FunnelGroup[] = [
      {
        ...(groups[0] as FunnelGroup),
        totals: { '2026-10-05': [4, 1], '2026-10-06': [1, 4], '2026-10-12': [2, 0] },
      },
      groups[1] as FunnelGroup,
    ];
    const p = parseFunnel(funnelGrid({ dates, groups: broken }), DEFAULT_FUNNEL);
    expect(p.warnings).toContainEqual(
      expect.stringMatching(/СР1.*05\.10.*Качественные счета.*3.*4/),
    );
  });

  it('takes dates as Excel numbers and as text', () => {
    const asText = parseFunnel(funnelGrid({ dates, groups, datesAsText: true }), DEFAULT_FUNNEL);
    const asNumber = parseFunnel(funnelGrid({ dates, groups }), DEFAULT_FUNNEL);
    expect(asText.rows).toEqual(asNumber.rows);
  });
});
