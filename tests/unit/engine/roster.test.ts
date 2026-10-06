import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import {
  effectiveMemberships,
  isFiredOn,
  teamOn,
  workingDaysInTeam,
} from '../../../src/engine/roster.ts';
import { makeConfig, manager } from '../../support/builders.ts';

const calendar = buildCalendar(makeConfig());
const transferred = manager('x', 't1', {
  memberships: [
    { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
    { teamId: 't2', from: '2026-10-12' },
  ],
});

describe('teamOn (R-1, OQ-11)', () => {
  it('uses the membership that covers the date', () => {
    expect(teamOn(transferred, '2026-10-08')).toBe('t1');
    expect(teamOn(transferred, '2026-10-13')).toBe('t2');
  });

  it('otherwise the nearest membership', () => {
    expect(teamOn(transferred, '2026-10-01')).toBe('t1');
    expect(teamOn(transferred, '2026-10-10')).toBe('t1'); // 1 day after t1, 2 before t2
    expect(teamOn(transferred, '2026-10-11')).toBe('t2'); // 2 days after t1, 1 before t2
  });

  it('on a tie prefers the later membership', () => {
    const gap = manager('g', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-08' },
        { teamId: 't2', from: '2026-10-12' },
      ],
    });
    expect(teamOn(gap, '2026-10-10')).toBe('t2');
  });

  it('gives a payment that arrives after firing to the last team', () => {
    const fired = manager('f', 't1', { firedAt: '2026-10-07' });
    expect(teamOn(fired, '2026-10-12')).toBe('t1');
  });

  it('falls back to all memberships if firing preceded every one of them', () => {
    const odd = manager('o', 't2', { firedAt: '2026-10-01' });
    expect(effectiveMemberships(odd)).toEqual([]);
    expect(teamOn(odd, '2026-10-06')).toBe('t2');
  });
});

describe('effectiveMemberships and working days (R-2, R-5)', () => {
  it('cuts memberships at the firing date', () => {
    const fired = manager('f', 't1', {
      firedAt: '2026-10-08',
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 't2', from: '2026-10-12' },
      ],
    });
    expect(effectiveMemberships(fired)).toEqual([
      { teamId: 't1', from: '2026-10-05', to: '2026-10-08' },
    ]);
  });

  it('counts only the working days spent in a team', () => {
    expect(workingDaysInTeam(transferred, 't1', calendar)).toHaveLength(5);
    expect(workingDaysInTeam(transferred, 't2', calendar)).toHaveLength(5);
    expect(
      workingDaysInTeam(manager('f', 't1', { firedAt: '2026-10-07' }), 't1', calendar),
    ).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('treats a manager as fired from the firing date on', () => {
    const fired = manager('f', 't1', { firedAt: '2026-10-07' });
    expect(isFiredOn(fired, '2026-10-06')).toBe(false);
    expect(isFiredOn(fired, '2026-10-07')).toBe(true);
    expect(isFiredOn(manager('a', 't1'), '2026-10-30')).toBe(false);
  });
});
