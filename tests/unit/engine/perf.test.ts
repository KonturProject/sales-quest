import { describe, expect, it } from 'vitest';
import { starterAchievements } from '../../../src/data/defaults/achievements.ts';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import {
  at,
  daily,
  makeConfig,
  manager,
  managerPoints,
  team,
  teamSteps,
} from '../../support/builders.ts';

/**
 * A month-long game, 6 teams, 70 managers, a record per manager and working day, the starter
 * achievements (NFR-LOAD-3). Two weeks is the default game; a month is the heavy case.
 */
function bigInput(): EngineInput {
  const teams = Array.from({ length: 6 }, (_, i) => team(`t${i + 1}`, i + 1));
  const teamOf = (i: number) => `t${(i % 6) + 1}`;
  const managers = Array.from({ length: 70 }, (_, i) =>
    manager(`m${i + 1}`, teamOf(i), {
      // Every 10th operator moves to the next team mid-month; every 15th is fired near the end.
      memberships:
        i % 10 === 0
          ? [
              { teamId: teamOf(i), from: '2026-10-01', to: '2026-10-14' },
              { teamId: teamOf(i + 1), from: '2026-10-15' },
            ]
          : [{ teamId: teamOf(i), from: '2026-10-01' }],
      ...(i % 15 === 7 ? { firedAt: '2026-10-22' } : {}),
      // Half the operators have daily norms — the target sums over their days in the team.
      ...(i % 2 === 0 ? { dailyNorms: { inv6: 2, inv20: 1, pay: 0.3 } } : {}),
    }),
  );
  const config = makeConfig({
    period: { start: '2026-10-01', end: '2026-10-31' },
    teams,
    managers,
    achievements: starterAchievements,
  });
  let seed = 42;
  const rand = (max: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % (max + 1);
  };
  const workingDays = buildCalendar(config).workingDays;
  const records = managers.flatMap((m) =>
    workingDays.map((date) => daily(m.id, date, { inv6: rand(4), inv20: rand(2), pay: rand(1) })),
  );
  // A busy game for the admin: steps and point corrections spread over the period.
  const adjustments = workingDays.flatMap((date, i) => [
    teamSteps(`s${i}`, `t${(i % 6) + 1}`, 1, at(date)),
    managerPoints(`p${i}`, `m${(i % 70) + 1}`, 5, at(date, '15:00')),
  ]);
  return { config, records, adjustments, imports: [] };
}

describe('engine performance (ARCH-2)', () => {
  it('computes the state with the timeline and achievements for 70 managers in under 50 ms', () => {
    const input = bigInput();
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      const state = computeGameState(input, at('2026-11-02', '09:00'));
      runs.push(performance.now() - started);
      expect(state.timeline).toHaveLength(31);
    }
    runs.sort((a, b) => a - b);
    expect(runs[2]).toBeLessThan(50);
  });
});
