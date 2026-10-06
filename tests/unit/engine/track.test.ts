import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { pacePosition } from '../../../src/engine/pace.ts';
import { buildTrack, locationIndexOf } from '../../../src/engine/track.ts';
import { makeConfig } from '../../support/builders.ts';

const locations = makeConfig().locations;
const track = (cellsPerWorkingDay: number, overflowPct: number, days: number) =>
  buildTrack({ track: { cellsPerWorkingDay, overflowPct }, locations }, days);

describe('buildTrack (D-24)', () => {
  it('2 cells a day over 10 working days: 20 cells, 5 per location, 50 % overflow', () => {
    const t = track(2, 50, 10);
    expect([t.cellsPerLocation, t.trackLength, t.overflowCells, t.maxPosition]).toEqual([
      5, 20, 10, 30,
    ]);
    expect(t.locations.map((l) => [l.index, l.firstCell, l.lastCell])).toEqual([
      [1, 1, 5],
      [2, 6, 10],
      [3, 11, 15],
      [4, 16, 20],
    ]);
  });

  it('rounds up so the four locations stay equal', () => {
    expect(track(2, 50, 9).trackLength).toBe(20);
    expect(track(3, 50, 9).trackLength).toBe(28);
  });

  it('keeps the spec arithmetic for 20 working days (FR-STEP-4)', () => {
    const t = track(2, 12.5, 20);
    expect([t.trackLength, t.overflowCells]).toEqual([40, 5]);
  });

  it('orders locations by index whatever the config order', () => {
    const t = buildTrack(
      { track: { cellsPerWorkingDay: 2, overflowPct: 0 }, locations: [...locations].reverse() },
      10,
    );
    expect(t.locations.map((l) => l.themePackId)).toEqual(['ruins', 'ice', 'volcano', 'heaven']);
  });

  it('maps positions to locations: start → 1, overflow → 4', () => {
    const t = track(2, 50, 10);
    expect([0, 1, 5, 6, 20, 25].map((p) => locationIndexOf(t, p))).toEqual([1, 1, 1, 2, 4, 4]);
  });
});

describe('pacePosition (FR-PACE-1, D-18)', () => {
  const config = makeConfig();
  const calendar = buildCalendar(config);
  const t = buildTrack(config, calendar.workingDays.length);

  it('moves 2 cells per completed working day', () => {
    expect(pacePosition(calendar, t, '2026-10-01')).toBe(0);
    expect(pacePosition(calendar, t, '2026-10-05')).toBe(0);
    expect(pacePosition(calendar, t, '2026-10-06')).toBe(2);
    expect(pacePosition(calendar, t, '2026-10-12')).toBe(10);
    expect(pacePosition(calendar, t, '2026-10-20')).toBe(20);
  });
});
