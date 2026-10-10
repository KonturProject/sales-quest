import { describe, expect, it } from 'vitest';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { applyImport, type ImportMeta, type Resolution } from '../../../src/import/apply.ts';
import { ImportError } from '../../../src/import/grid.ts';
import type { Parsed, ParsedRow } from '../../../src/import/parsed.ts';
import { daily, makeConfig, manager, team } from '../../support/builders.ts';

const NORMS = { inv6: 4, inv20: 1, pay: 0.2 };
const config = makeConfig({
  teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
  managers: [
    manager('m01', 't1', { fullName: 'Ершова Мария' }),
    manager('m02', 't1', { fullName: 'Федоров Иван' }),
    manager('m03', 't2', { fullName: 'Белова Анна' }),
  ],
  defaultDailyNorms: NORMS,
});
const input = (records = [] as EngineInput['records']): EngineInput => ({
  config,
  records,
  adjustments: [],
  imports: [],
});
const meta: ImportMeta = {
  fileName: 'воронка.xlsx',
  sha256: 'abcdef' + '0'.repeat(58),
  by: 'koordinator',
  at: '2026-10-06T09:00:00+03:00',
};
const none = new Map<string, Resolution>();

const row = (
  name: string,
  group: string,
  date: string,
  values: Record<string, number>,
): ParsedRow => ({
  name,
  group,
  date,
  values,
});
/** A parsed file: its people and groups from its rows (plus `people`), `days` as given. */
function parsed(
  profileId: 'funnel' | 'payments',
  rows: ParsedRow[],
  days: string[],
  people = rows.map((r) => ({ name: r.name, group: r.group })),
): Parsed {
  const unique = [...new Map(people.map((p) => [p.name, p])).values()];
  return {
    profileId,
    metrics: profileId === 'funnel' ? ['inv6', 'inv20'] : ['pay'],
    rows,
    period: [days[0] as string, days[days.length - 1] as string],
    days,
    groups: [...new Set(unique.flatMap((p) => (p.group ? [p.group] : [])))],
    people: unique,
    warnings: [],
  };
}
const week1 = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
const week2 = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
const valuesOf = (i: EngineInput, managerId: string, date: string) =>
  i.records.find((r) => r.managerId === managerId && r.date === date)?.values;

describe('applying an import (DATA-5…DATA-8, D-20, OQ-12)', () => {
  it("upserts only the file's metrics by operator and day", () => {
    const funnel = parsed(
      'funnel',
      [row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 5, inv20: 0 })],
      week1,
    );
    const result = applyImport(
      input([daily('m01', '2026-10-05', { inv6: 2, inv20: 1, pay: 3 })]),
      funnel,
      none,
      meta,
    );
    expect(valuesOf(result.input, 'm01', '2026-10-05')).toEqual({ inv6: 5, inv20: 0, pay: 3 });
  });

  it('a repeated import changes no record', () => {
    const funnel = parsed(
      'funnel',
      [
        row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 5, inv20: 1 }),
        row('Новикова Фёкла', 'СР5', '2026-10-06', { inv6: 2, inv20: 0 }),
      ],
      week1,
    );
    const resolutions = new Map<string, Resolution>([
      ['новикова фекла', { kind: 'new', teamId: 't2' }],
    ]);
    const once = applyImport(input(), funnel, resolutions, meta);
    const twice = applyImport(once.input, funnel, resolutions, {
      ...meta,
      at: '2026-10-07T10:00:00+03:00',
    });
    expect(twice.input.records).toEqual(once.input.records);
    expect(twice.input.config).toEqual(once.input.config);
    expect(twice.input.imports).toHaveLength(2);
    expect(twice.summary.warnings).toContain('этот файл уже загружался 06.10 09:00');
  });

  it('an older file replaces only its period', () => {
    const a = parsed(
      'funnel',
      [row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 1, inv20: 0 })],
      week1,
    );
    const b = parsed(
      'funnel',
      [row('Ершова Мария', 'СР1', '2026-10-12', { inv6: 7, inv20: 0 })],
      week2,
    );
    const a2 = parsed(
      'funnel',
      [row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 9, inv20: 0 })],
      week1,
    );
    let state = applyImport(input(), a, none, meta).input;
    state = applyImport(state, b, none, { ...meta, sha256: 'b'.repeat(64) }).input;
    state = applyImport(state, a2, none, { ...meta, sha256: 'c'.repeat(64) }).input;
    expect(valuesOf(state, 'm01', '2026-10-05')).toEqual({ inv6: 9, inv20: 0 });
    expect(valuesOf(state, 'm01', '2026-10-12')).toEqual({ inv6: 7, inv20: 0 });
  });

  it("fills 0 for the operators of the file's groups on days of the period without payments (OQ-12)", () => {
    const payments = parsed(
      'payments',
      [row('Федоров Иван', 'СР1', '2026-10-05', { pay: 1 })],
      ['2026-10-05', '2026-10-06', '2026-10-07'],
    );
    const result = applyImport(
      input([
        daily('m01', '2026-10-06', { inv6: 2, pay: 2 }), // a cancelled payment of СР1
        daily('m03', '2026-10-06', { pay: 1 }), // СР5 is not in the file: untouched
      ]),
      payments,
      none,
      meta,
    );
    expect(valuesOf(result.input, 'm01', '2026-10-06')).toEqual({ inv6: 2, pay: 0 });
    expect(valuesOf(result.input, 'm02', '2026-10-05')).toEqual({ pay: 1 });
    expect(valuesOf(result.input, 'm03', '2026-10-06')).toEqual({ pay: 1 });
  });

  it('drops days outside the game with a warning (DATA-7)', () => {
    const funnel = parsed(
      'funnel',
      [
        row('Ершова Мария', 'СР1', '2026-09-30', { inv6: 3, inv20: 0 }),
        row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 1, inv20: 0 }),
      ],
      ['2026-09-30', ...week1],
    );
    const result = applyImport(input(), funnel, none, meta);
    expect(result.input.records.map((r) => r.date)).toEqual(['2026-10-05']);
    expect(result.summary.period).toEqual(['2026-10-05', '2026-10-09']);
    expect(result.summary.warnings).toContainEqual(expect.stringMatching(/вне дат игры/));
  });

  it('a file of other dates entirely is refused', () => {
    const old = parsed(
      'funnel',
      [row('Ершова Мария', 'СР1', '2026-09-01', { inv6: 3, inv20: 0 })],
      ['2026-09-01'],
    );
    expect(() => applyImport(input(), old, none, meta)).toThrow(ImportError);
  });

  it("links, adds and ignores by the resolutions; a new operator gets the season's default norms", () => {
    const funnel = parsed(
      'funnel',
      [
        row('Ершова  Мари', 'СР1', '2026-10-06', { inv6: 1, inv20: 0 }),
        row('Новикова Фёкла', 'СР5', '2026-10-06', { inv6: 2, inv20: 1 }),
        row('Тестов Тест', 'СР1', '2026-10-06', { inv6: 9, inv20: 9 }),
      ],
      week1.slice(1),
    );
    const result = applyImport(
      input(),
      funnel,
      new Map<string, Resolution>([
        ['ершова мари', { kind: 'link', managerId: 'm01' }],
        ['новикова фекла', { kind: 'new', teamId: 't2' }],
        ['тестов тест', { kind: 'ignore' }],
      ]),
      meta,
    );
    const { managers, importIgnore } = result.input.config;
    expect(managers.find((m) => m.id === 'm01')?.aliases).toEqual(['Ершова Мари']);
    expect(managers.find((m) => m.id === 'op001')).toEqual({
      id: 'op001',
      fullName: 'Новикова Фёкла',
      aliases: [],
      dailyNorms: NORMS,
      memberships: [{ teamId: 't2', from: '2026-10-06' }],
    });
    expect(importIgnore).toEqual(['тестов тест']);
    expect(valuesOf(result.input, 'm01', '2026-10-06')).toEqual({ inv6: 1, inv20: 0 });
    expect(valuesOf(result.input, 'op001', '2026-10-06')).toEqual({ inv6: 2, inv20: 1 });
    expect(result.summary).toMatchObject({ matched: 2, added: 1, ignored: 1 });
  });

  it('an unresolved person is left out with a warning', () => {
    const funnel = parsed(
      'funnel',
      [row('Кто-то Новый', 'СР1', '2026-10-05', { inv6: 3, inv20: 0 })],
      week1,
    );
    const result = applyImport(input(), funnel, none, meta);
    expect(result.input.records).toEqual([]);
    expect(result.summary.warnings).toContainEqual(
      expect.stringMatching(/1 человек не сопоставлен/),
    );
  });

  it('a stranger without a number in the file is not asked about and not warned about (review 2a)', () => {
    const funnel = parsed(
      'funnel',
      [row('Кто-то Новый', 'СР1', '2026-10-05', { inv6: 0, inv20: 0 })],
      week1,
    );
    const result = applyImport(input(), funnel, none, meta);
    expect(result.summary.warnings.filter((w) => w.includes('не сопоставлен'))).toEqual([]);
    expect(result.input.imports[result.input.imports.length - 1]?.unmatched).toBe(0);
  });

  it('writes the log entry: file, hash, kind, period, counts, warnings', () => {
    const funnel = parsed(
      'funnel',
      [row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 5, inv20: 0 })],
      week1,
    );
    const { log, input: after } = applyImport(input(), funnel, none, meta);
    expect(log).toEqual({
      id: 'imp-202610060900-abcdef',
      fileName: 'воронка.xlsx',
      fileSha256: meta.sha256,
      profileId: 'funnel',
      rows: 1,
      matched: 1,
      unmatched: 0,
      dateRange: ['2026-10-05', '2026-10-09'],
      by: 'koordinator',
      at: meta.at,
      warnings: [],
    });
    expect(after.imports).toEqual([log]);
    expect(after.records[0]?.importId).toBe(log.id);
  });

  it('keeps records sorted by date and operator, so an unchanged file serialises the same', () => {
    const funnel = parsed(
      'funnel',
      [
        row('Федоров Иван', 'СР1', '2026-10-06', { inv6: 1, inv20: 0 }),
        row('Ершова Мария', 'СР1', '2026-10-06', { inv6: 1, inv20: 0 }),
        row('Ершова Мария', 'СР1', '2026-10-05', { inv6: 1, inv20: 0 }),
      ],
      week1,
    );
    const result = applyImport(input(), funnel, none, meta);
    expect(result.input.records.map((r) => `${r.date}|${r.managerId}`)).toEqual([
      '2026-10-05|m01',
      '2026-10-06|m01',
      '2026-10-06|m02',
    ]);
  });
});
