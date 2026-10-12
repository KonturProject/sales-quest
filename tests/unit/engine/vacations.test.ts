import { describe, expect, it } from 'vitest';
import { SeasonConfigSchema } from '../../../src/data/schemas/season.ts';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { buildTeamPlans } from '../../../src/engine/plans.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { isOnVacation, workingDaysInGame, workingDaysInTeam } from '../../../src/engine/roster.ts';
import { weightsOf } from '../../../src/engine/scoring.ts';
import { averageHeadcount, teamTargetPoints } from '../../../src/engine/targets.ts';
import { buildTrack } from '../../../src/engine/track.ts';
import { at, daily, makeConfig, manager } from '../../support/builders.ts';

// A two-week game Mon 05.10 … Sun 18.10: 10 working days, 2 cells a day, 7.5 points a day by default.
// «a» is away Fri 09.10 … Tue 13.10: 3 working days (the weekend inside costs nothing).
const away = manager('a', 't1', { vacations: [{ from: '2026-10-09', to: '2026-10-13' }] });
const config = makeConfig({ managers: [away, manager('b', 't1'), manager('c', 't2')] });
const calendar = buildCalendar(config);
const input = (records: EngineInput['records']): EngineInput => ({
  config,
  records,
  adjustments: [],
  imports: [],
});

describe('vacations in the roster (D-54)', () => {
  it('a day of a vacation, both ends included', () => {
    expect(
      ['2026-10-08', '2026-10-09', '2026-10-13', '2026-10-14'].map((d) => isOnVacation(away, d)),
    ).toEqual([false, true, true, false]);
    expect(isOnVacation(manager('b', 't1'), '2026-10-09')).toBe(false);
  });

  it('the working days in the team and in the game leave the vacation out; a weekend inside costs nothing', () => {
    expect(workingDaysInTeam(away, 't1', calendar)).toHaveLength(7);
    expect(workingDaysInTeam(away, 't1', calendar)).not.toContain('2026-10-12');
    expect(workingDaysInGame(away, calendar)).toHaveLength(7);
  });

  it('the schema: from ≤ to; without vacations the field stays absent', () => {
    const reversed = makeConfig({
      managers: [manager('x', 't1', { vacations: [{ from: '2026-10-09', to: '2026-10-08' }] })],
    });
    expect(() => SeasonConfigSchema.parse(reversed)).toThrow(/конец отпуска раньше начала/);
    const plain = SeasonConfigSchema.parse(makeConfig({ managers: [manager('x', 't1')] }));
    expect(plain.managers[0]).not.toHaveProperty('vacations');
  });

  it('an unknown field of an operator is ignored, not refused — older viewers read newer configs', () => {
    const newer = makeConfig({ managers: [{ ...manager('x', 't1'), somethingNew: 1 } as never] });
    expect(SeasonConfigSchema.parse(newer).managers[0]).not.toHaveProperty('somethingNew');
  });
});

describe('the plan without the days away (R-2, R-3, D-26, D-54)', () => {
  it('the team target and the headcount lose the working days of the vacation', () => {
    expect(teamTargetPoints('t1', config, calendar, weightsOf(config))).toBe(7.5 * (7 + 10));
    expect(averageHeadcount('t1', config, calendar)).toBe((7 + 10) / 10);
  });

  it('the pace line accrues without them', () => {
    const plans = buildTeamPlans(config, calendar, buildTrack(config, calendar.workingDays.length));
    const pace = plans.get('t1')?.paceAfter ?? [];
    // 17 days of the plan: after Thursday 4 + 4 of them (9 cells; 8 without the vacation), after Monday
    // 4 + 6 (11 cells; 12 without it).
    expect([pace[4], pace[6], pace[10]]).toEqual([
      Math.floor((8 / 17) * 20 + 1e-9),
      Math.floor((10 / 17) * 20 + 1e-9),
      20,
    ]);
  });

  it('a vacation across a transfer: each team loses only its own days', () => {
    const moved = manager('m', 't1', {
      memberships: [
        { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
        { teamId: 't2', from: '2026-10-12' },
      ],
      vacations: [{ from: '2026-10-08', to: '2026-10-13' }],
    });
    const cal = buildCalendar(makeConfig({ managers: [moved] }));
    expect(workingDaysInTeam(moved, 't1', cal)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(workingDaysInTeam(moved, 't2', cal)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
  });
});

describe('the rating and the numbers of vacation days (D-54)', () => {
  it('a row knows whether today is a day of the vacation; the place is kept', () => {
    const i = input([daily('a', '2026-10-06', { pay: 3 }), daily('b', '2026-10-06', { pay: 1 })]);
    const during = computeGameState(i, at('2026-10-12')).managers.find((m) => m.managerId === 'a');
    expect([during?.onVacation, during?.rank]).toEqual([true, 1]);
    const back = computeGameState(i, at('2026-10-14')).managers.find((m) => m.managerId === 'a');
    expect(back?.onVacation).toBe(false);
  });

  it('numbers of a vacation day still count for the team and the operator', () => {
    const s = computeGameState(input([daily('a', '2026-10-12', { pay: 1 })]), at('2026-10-14'));
    expect(s.teams.find((t) => t.teamId === 't1')?.points).toBe(10);
    expect(s.managers.find((m) => m.managerId === 'a')?.points).toBe(10);
  });
});
