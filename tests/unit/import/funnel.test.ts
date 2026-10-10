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
    // 08.10 and 09.10: nobody has a number — the department's total is blank, not a day of the file.
    const covered = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12'];
    expect(p.rows).toHaveLength(3 * covered.length);
    expect(p.period).toEqual(['2026-10-05', '2026-10-12']);
    expect(p.days).toEqual(covered);
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
    // Only real dates, and of them only the days with numbers (08.10 and 09.10 have none).
    expect(new Set(p.rows.map((r) => r.date))).toEqual(new Set(p.days));
    expect(p.days.every((d) => dates.includes(d))).toBe(true);
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

  it("a day whose department total is 0 or blank is not the file's: no rows, nothing zero-filled (review 2a)", () => {
    // The September export: the days after its export date are columns with a total of 0.
    const ahead: FunnelGroup[] = [
      {
        ...(groups[0] as FunnelGroup),
        people: [
          { name: 'Ершова Мария', days: { '2026-10-05': [3, 1], '2026-10-09': [0, 0] } },
          { name: 'Фёдоров  Иван', days: { '2026-10-06': [1, 4] } },
        ],
      },
    ];
    const p = parseFunnel(funnelGrid({ dates, groups: ahead }), DEFAULT_FUNNEL);
    expect(p.days).toEqual(['2026-10-05', '2026-10-06']);
    expect(p.period).toEqual(['2026-10-05', '2026-10-06']);
    expect(p.rows.map((r) => r.date)).not.toContain('2026-10-09');
    expect(p.rows).toHaveLength(2 * 2);
  });

  it('a funnel without a single day of numbers is refused', () => {
    const empty: FunnelGroup[] = [
      {
        ...(groups[0] as FunnelGroup),
        people: [{ name: 'Ершова Мария', days: { '2026-10-05': [0, 0] } }],
      },
    ];
    expect(() => parseFunnel(funnelGrid({ dates, groups: empty }), DEFAULT_FUNNEL)).toThrow(
      /нет ни одного дня с данными/,
    );
  });

  it('a negative number stops the import, naming the person, the day and the block (review 2a)', () => {
    const negative: FunnelGroup[] = [
      {
        ...(groups[0] as FunnelGroup),
        people: [{ name: 'Ершова Мария', days: { '2026-10-05': [-1, 2] } }],
      },
    ];
    const run = () => parseFunnel(funnelGrid({ dates, groups: negative }), DEFAULT_FUNNEL);
    expect(run).toThrow(ImportError);
    expect(run).toThrow(/отрицательное число.*Ершова Мария.*05\.10.*Качественные счета/);
  });

  it('takes dates as Excel numbers and as text', () => {
    const asText = parseFunnel(funnelGrid({ dates, groups, datesAsText: true }), DEFAULT_FUNNEL);
    const asNumber = parseFunnel(funnelGrid({ dates, groups }), DEFAULT_FUNNEL);
    expect(asText.rows).toEqual(asNumber.rows);
  });
});
