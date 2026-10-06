import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateOf,
  daysBetween,
  eachDate,
  fromDayNumber,
  isoWeekday,
  toDayNumber,
} from '../../../src/engine/dates.ts';

describe('dates', () => {
  it('converts calendar dates to day numbers and back', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(toDayNumber('2028-02-29'))).toBe('2028-02-29');
  });

  it('rejects anything that is not a real date', () => {
    for (const bad of ['2026-02-30', '2026-1-5', 'x', '2026-13-01'])
      expect(() => toDayNumber(bad)).toThrow(`не дата: ${bad}`);
  });

  it('adds days and measures distances across months and years', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysBetween('2026-10-05', '2026-10-18')).toBe(13);
  });

  it('knows the ISO weekday', () => {
    expect(isoWeekday('1970-01-01')).toBe(4);
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('lists every date of a range inclusively', () => {
    expect(eachDate('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(eachDate('2026-10-05', '2026-10-04')).toEqual([]);
  });

  it('takes the wall-clock date of a local timestamp (D-11)', () => {
    expect(dateOf('2026-10-06T00:30:00+03:00')).toBe('2026-10-06');
    expect(() => dateOf('yesterday')).toThrow();
  });
});
