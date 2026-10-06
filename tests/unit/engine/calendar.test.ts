import { describe, expect, it } from 'vitest';
import { buildCalendar, completedWorkingDays, weekOf } from '../../../src/engine/calendar.ts';

const cal = (
  start: string,
  end: string,
  extra: { holidays?: string[]; workingDays?: string[] } = {},
) =>
  buildCalendar({
    period: { start, end },
    holidays: extra.holidays ?? [],
    workingDays: extra.workingDays,
  });

describe('buildCalendar (D-24)', () => {
  it('a two-week game from Monday has 10 working days and 2 weeks', () => {
    const c = cal('2026-10-05', '2026-10-18');
    expect(c.workingDays).toHaveLength(10);
    expect([c.workingDays[0], c.workingDays.at(-1)]).toEqual(['2026-10-05', '2026-10-16']);
    expect(c.weeks.map((w) => [w.index, w.start, w.end, w.workingDays.length])).toEqual([
      [1, '2026-10-05', '2026-10-11', 5],
      [2, '2026-10-12', '2026-10-18', 5],
    ]);
  });

  it('removes holidays', () => {
    const c = cal('2026-10-05', '2026-10-18', { holidays: ['2026-10-07'] });
    expect(c.workingDays).toHaveLength(9);
    expect(c.workingDays).not.toContain('2026-10-07');
  });

  it('uses an explicit list of working days, e.g. a working Saturday', () => {
    const c = cal('2026-10-05', '2026-10-11', {
      workingDays: ['2026-10-10', '2026-10-05', '2026-10-05', '2026-10-20'],
    });
    expect(c.workingDays).toEqual(['2026-10-05', '2026-10-10']);
  });

  it('clips the weeks of a game that starts mid-week (OQ-19)', () => {
    const c = cal('2026-10-07', '2026-10-20');
    expect(c.weeks.map((w) => [w.start, w.end, w.workingDays.length])).toEqual([
      ['2026-10-07', '2026-10-11', 3],
      ['2026-10-12', '2026-10-18', 5],
      ['2026-10-19', '2026-10-20', 2],
    ]);
  });

  it('drops a leading weekend that has no working days', () => {
    const c = cal('2026-10-03', '2026-10-16');
    expect(c.weeks.map((w) => [w.index, w.start])).toEqual([
      [1, '2026-10-05'],
      [2, '2026-10-12'],
    ]);
  });

  it('refuses a game without working days', () => {
    expect(() => cal('2026-10-10', '2026-10-11')).toThrow('нет рабочих дней');
  });
});

describe('calendar queries', () => {
  const c = cal('2026-10-05', '2026-10-18');

  it('counts working days strictly before today (D-18)', () => {
    expect(completedWorkingDays(c, '2026-10-01')).toBe(0);
    expect(completedWorkingDays(c, '2026-10-05')).toBe(0);
    expect(completedWorkingDays(c, '2026-10-06')).toBe(1);
    expect(completedWorkingDays(c, '2026-10-12')).toBe(5);
    expect(completedWorkingDays(c, '2026-11-01')).toBe(10);
  });

  it('finds the week of a date', () => {
    expect(weekOf(c, '2026-10-14')?.index).toBe(2);
    expect(weekOf(c, '2026-10-30')).toBeUndefined();
  });
});
