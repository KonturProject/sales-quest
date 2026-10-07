import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { buildTeamPlans, teamPacePosition } from '../../../src/engine/plans.ts';
import { buildTrack, locationIndexOf } from '../../../src/engine/track.ts';
import { makeConfig, manager, team } from '../../support/builders.ts';

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

describe('common pace line (FR-PACE-1, D-18)', () => {
  // An explicit team plan accrues evenly, so the team follows the common line.
  const config = makeConfig({ teams: [team('t1', 1, { targetPoints: 300 })] });
  const calendar = buildCalendar(config);
  const t = buildTrack(config, calendar.workingDays.length);

  it('moves 2 cells per completed working day', () => {
    const pace = (today: string) => teamPacePosition('t1', config, calendar, t, today);
    expect(
      ['2026-10-01', '2026-10-05', '2026-10-06', '2026-10-12', '2026-10-20'].map(pace),
    ).toEqual([0, 0, 2, 10, 20]);
  });

  it('keeps one value per number of completed working days', () => {
    expect(buildTeamPlans(config, calendar, t).get('t1')?.paceAfter).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
    ]);
  });
});

describe('teamPacePosition (FR-PACE-1, OQ-21)', () => {
  // t1: a + b all game; t2: c all game + a newcomer from Monday of week 2.
  const config = makeConfig({
    managers: [
      manager('a', 't1'),
      manager('b', 't1'),
      manager('c', 't2'),
      manager('n', 't2', { memberships: [{ teamId: 't2', from: '2026-10-12' }] }),
    ],
  });
  const calendar = buildCalendar(config);
  const t = buildTrack(config, calendar.workingDays.length);
  const pace = (teamId: string, today: string, c = config) =>
    teamPacePosition(teamId, c, calendar, t, today);

  it('equals the common line when the roster does not change', () => {
    expect(
      ['2026-10-05', '2026-10-06', '2026-10-12', '2026-10-20'].map((d) => pace('t1', d)),
    ).toEqual([0, 2, 10, 20]);
  });

  it('follows the plan as it accrues: a newcomer does not make the team look behind', () => {
    // plan 75 + 37.5 = 112.5; by Monday of week 2 only c's 37.5 accrued → 37.5 / 112.5 × 20 = 6.7
    expect(pace('t2', '2026-10-12')).toBe(6);
    expect(pace('t2', '2026-10-20')).toBe(20);
  });

  it('uses the common line for an explicit team plan and in absolute mode', () => {
    const explicit = { ...config, teams: [team('t1', 1), team('t2', 2, { targetPoints: 300 })] };
    expect(pace('t2', '2026-10-12', explicit)).toBe(10);
    const absolute = { ...config, progressMode: 'absolute' as const, pointsPerStep: 10 };
    expect(pace('t2', '2026-10-12', absolute)).toBe(10);
  });

  it('per_capita accrues by member working days too, and a team without a plan has no pace', () => {
    expect(pace('t2', '2026-10-12', { ...config, progressMode: 'per_capita' })).toBe(6);
    const empty = { ...config, teams: [...config.teams, team('t3', 3)] };
    expect(pace('t3', '2026-10-12', empty)).toBe(0);
  });
});
