import { describe, expect, it } from 'vitest';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { applyImport, type Resolution } from '../../../src/import/apply.ts';
import { ImportError } from '../../../src/import/grid.ts';
import { looksLikeList, onDay, parseIntraday } from '../../../src/import/intraday.ts';
import {
  DEFAULT_FUNNEL,
  DEFAULT_INTRADAY,
  DEFAULT_PAYMENTS,
  DEFAULT_PROFILES,
  ImportProfileSchema,
  profilesFor,
} from '../../../src/import/profiles.ts';
import { daily, makeConfig, manager, team } from '../../support/builders.ts';
import { intradayGrid } from '../../support/grids.ts';

const DAY = '2026-10-13';
const grid = intradayGrid([
  {
    name: 'Пл_НП_СР_Город_СР1_Входящие',
    people: [
      { name: 'Ершова Мария', inv6: 3, inv20: 1 },
      { name: 'Федоров Иван', inv6: '', inv20: '' },
    ],
  },
  { name: 'Пл_НП_СР_Город_СР5_Входящие', people: [{ name: 'Белова Анна', inv6: 2, inv20: 0 }] },
]);

describe('the intraday file «Промежуточные итоги» (D-55)', () => {
  it('reads operators under the group above them, for the given day; an empty cell is 0', () => {
    const parsed = parseIntraday(grid, DEFAULT_INTRADAY, DAY);
    expect(parsed).toEqual({
      profileId: 'intraday',
      metrics: ['inv6', 'inv20'],
      rows: [
        { name: 'Ершова Мария', group: 'СР1', date: DAY, values: { inv6: 3, inv20: 1 } },
        { name: 'Федоров Иван', group: 'СР1', date: DAY, values: { inv6: 0, inv20: 0 } },
        { name: 'Белова Анна', group: 'СР5', date: DAY, values: { inv6: 2, inv20: 0 } },
      ],
      period: [DAY, DAY],
      days: [DAY],
      groups: ['СР1', 'СР5'],
      people: [
        { name: 'Ершова Мария', group: 'СР1' },
        { name: 'Федоров Иван', group: 'СР1' },
        { name: 'Белова Анна', group: 'СР5' },
      ],
      warnings: [],
    });
  });

  it('a number stored as text is read; empty rows are skipped', () => {
    const rows = [
      ['Группа СР2', '', ''],
      ['', '', ''],
      ['Ершова Мария', '4', ' 2 '],
    ];
    expect(parseIntraday(rows, DEFAULT_INTRADAY, DAY).rows[0]?.values).toEqual({
      inv6: 4,
      inv20: 2,
    });
  });

  it('a group row with a total: still a group, its own numbers ignored', () => {
    const withTotal = intradayGrid([
      {
        name: 'СР1',
        total: [9, 9],
        people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }],
      },
    ]);
    const parsed = parseIntraday(withTotal, DEFAULT_INTRADAY, DAY);
    expect(parsed.rows).toEqual([
      { name: 'Ершова Мария', group: 'СР1', date: DAY, values: { inv6: 3, inv20: 1 } },
    ]);
    expect(looksLikeList(withTotal, DEFAULT_INTRADAY)).toBe(true);
  });

  it('stops on a negative, a fraction or a word — by row and column, never the name or the value', () => {
    for (const bad of [-1, 2.5, 'много']) {
      const rows = [
        ['СР1', '', ''],
        ['Ершова Мария', 3, bad],
      ];
      expect(() => parseIntraday(rows, DEFAULT_INTRADAY, DAY)).toThrow(ImportError);
      try {
        parseIntraday(rows, DEFAULT_INTRADAY, DAY);
      } catch (e) {
        const message = (e as Error).message;
        expect(message).toBe(
          'строка 2, столбец C: нужно целое число не меньше 0 или пустая ячейка — проверьте файл',
        );
        expect(message).not.toContain('Ершова');
      }
    }
  });

  it('stops on an operator above the first group, and on a file without operators', () => {
    expect(() => parseIntraday([['Ершова Мария', 3, 1]], DEFAULT_INTRADAY, DAY)).toThrow(
      'строка 1: оператор выше первой группы — над операторами должна быть строка группы с кодом вроде «СР1»',
    );
    expect(() => parseIntraday([['СР1', '', '']], DEFAULT_INTRADAY, DAY)).toThrow(
      'в файле промежуточных итогов нет ни одного оператора',
    );
  });

  it('an operator listed twice: the numbers are summed, with a warning', () => {
    const twice = intradayGrid([
      { name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] },
      { name: 'СР5', people: [{ name: 'Ершова  Мария', inv6: 1, inv20: 0 }] },
    ]);
    const parsed = parseIntraday(twice, DEFAULT_INTRADAY, DAY);
    expect(parsed.warnings).toEqual([
      'Ершова Мария: в файле 2 раза — показатели сложены, проверьте файл',
    ]);
    const config = makeConfig({
      teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
      managers: [manager('m01', 't1', { fullName: 'Ершова Мария' })],
    });
    const result = applyImport(
      { config, records: [], adjustments: [], imports: [] },
      parsed,
      new Map(),
      { fileName: 'пром итоги.xlsx', sha256: 'a'.repeat(64), by: 'k', at: `${DAY}T15:00:00+03:00` },
    );
    expect(result.input.records[0]?.values).toEqual({ inv6: 4, inv20: 1 });
  });

  it('onDay moves the whole file to another day', () => {
    const parsed = onDay(parseIntraday(grid, DEFAULT_INTRADAY, DAY), '2026-10-12');
    expect(parsed.period).toEqual(['2026-10-12', '2026-10-12']);
    expect(parsed.days).toEqual(['2026-10-12']);
    expect(new Set(parsed.rows.map((r) => r.date))).toEqual(new Set(['2026-10-12']));
  });

  it('recognises the file: a group row, then an operator with a number', () => {
    expect(looksLikeList(grid, DEFAULT_INTRADAY)).toBe(true);
    expect(
      looksLikeList(
        [
          ['Имя', 'Дата'],
          ['Ершова Мария', 3],
        ],
        DEFAULT_INTRADAY,
      ),
    ).toBe(false);
    // Only a group and people without numbers: not enough to call it this file.
    expect(
      looksLikeList(
        [
          ['СР1', '', ''],
          ['Ершова Мария', '', ''],
        ],
        DEFAULT_INTRADAY,
      ),
    ).toBe(false);
  });
});

describe('the intraday file applied (D-20, OQ-12; applyImport unchanged)', () => {
  const config = makeConfig({
    teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
    managers: [
      manager('m01', 't1', { fullName: 'Ершова Мария' }),
      manager('m02', 't1', { fullName: 'Федоров Иван' }),
      manager('m03', 't1', { fullName: 'Котова Ольга' }),
      manager('m04', 't2', { fullName: 'Белова Анна' }),
      manager('m05', 't2', { fullName: 'Орлов Пётр' }),
    ],
  });
  const none = new Map<string, Resolution>();
  const meta = (at: string, sha: string) => ({
    fileName: 'пром итоги.xlsx',
    sha256: sha.repeat(64),
    by: 'k',
    at,
  });
  const valuesOf = (input: EngineInput, managerId: string, date: string) =>
    input.records.find((r) => r.managerId === managerId && r.date === date)?.values;

  it('replaces the day: 3 at 13:00, then 5 in the evening is 5; payments and other days kept', () => {
    const start: EngineInput = {
      config,
      records: [
        daily('m01', DAY, { inv6: 1, inv20: 0, pay: 2 }),
        daily('m01', '2026-10-12', { inv6: 6, inv20: 2, pay: 1 }),
        daily('m05', '2026-10-12', { inv6: 2, inv20: 1, pay: 0 }),
      ],
      adjustments: [],
      imports: [],
    };
    const noon = parseIntraday(
      intradayGrid([{ name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] }]),
      DEFAULT_INTRADAY,
      DAY,
    );
    const first = applyImport(start, noon, none, meta(`${DAY}T13:00:00+03:00`, 'a'));
    const evening = parseIntraday(
      intradayGrid([{ name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 5, inv20: 2 }] }]),
      DEFAULT_INTRADAY,
      DAY,
    );
    const second = applyImport(first.input, evening, none, meta(`${DAY}T18:00:00+03:00`, 'b'));
    expect(valuesOf(second.input, 'm01', DAY)).toEqual({ inv6: 5, inv20: 2, pay: 2 });
    expect(valuesOf(second.input, 'm01', '2026-10-12')).toEqual({ inv6: 6, inv20: 2, pay: 1 });
    expect(second.log).toMatchObject({ profileId: 'intraday', dateRange: [DAY, DAY] });
  });

  it("the file's groups' operators without a row get 0 that day; other groups are untouched", () => {
    const start: EngineInput = {
      config,
      records: [
        daily('m03', DAY, { inv6: 4, inv20: 1, pay: 0 }),
        daily('m05', DAY, { inv6: 2, inv20: 1, pay: 1 }),
      ],
      adjustments: [],
      imports: [],
    };
    const parsed = parseIntraday(
      intradayGrid([{ name: 'СР1', people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }] }]),
      DEFAULT_INTRADAY,
      DAY,
    );
    const result = applyImport(start, parsed, none, meta(`${DAY}T13:00:00+03:00`, 'c'));
    expect(valuesOf(result.input, 'm03', DAY)).toEqual({ inv6: 0, inv20: 0, pay: 0 });
    expect(valuesOf(result.input, 'm05', DAY)).toEqual({ inv6: 2, inv20: 1, pay: 1 });
  });
});

describe('profiles of a running game (D-55)', () => {
  it("adds the default profiles the config lacks by id, keeps the config's own", () => {
    expect(profilesFor([])).toEqual(DEFAULT_PROFILES);
    expect(profilesFor([DEFAULT_FUNNEL, DEFAULT_PAYMENTS])).toEqual([
      DEFAULT_FUNNEL,
      DEFAULT_PAYMENTS,
      DEFAULT_INTRADAY,
    ]);
    const own = { ...DEFAULT_INTRADAY, title: 'Свои итоги' };
    expect(profilesFor([DEFAULT_FUNNEL, own])).toEqual([DEFAULT_FUNNEL, own, DEFAULT_PAYMENTS]);
  });

  it('the list kind is a valid profile of the config schema', () => {
    expect(ImportProfileSchema.parse(DEFAULT_INTRADAY)).toEqual(DEFAULT_INTRADAY);
  });
});
