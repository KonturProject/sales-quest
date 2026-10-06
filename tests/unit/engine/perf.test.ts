import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../../../src/engine/calendar.ts';
import { computeGameState } from '../../../src/engine/gameState.ts';
import { prepare, type EngineInput } from '../../../src/engine/prepare.ts';
import { buildTimeline } from '../../../src/engine/timeline.ts';
import {
  at,
  daily,
  makeConfig,
  manager,
  managerPoints,
  team,
  teamSteps,
} from '../../support/builders.ts';

/** A month-long game, 6 teams, 70 managers, a record per manager and working day (NFR-LOAD-3). */
function bigInput(): EngineInput {
  const teams = Array.from({ length: 6 }, (_, i) => team(`t${i + 1}`, i + 1));
  const managers = Array.from({ length: 70 }, (_, i) =>
    manager(`m${i + 1}`, `t${(i % 6) + 1}`, {
      memberships: [{ teamId: `t${(i % 6) + 1}`, from: '2026-10-01' }],
      // Half the operators have daily norms — the target sums over their days in the team.
      ...(i % 2 === 0 ? { dailyNorms: { inv6: 2, inv20: 1, pay: 0.3 } } : {}),
    }),
  );
  const config = makeConfig({
    period: { start: '2026-10-01', end: '2026-10-31' },
    teams,
    managers,
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
  it('computes the state and the timeline for 70 managers in under 50 ms', () => {
    const input = bigInput();
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      computeGameState(input, at('2026-10-31', '18:00'));
      buildTimeline(prepare(input), '2026-10-31');
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);
    expect(runs[2]).toBeLessThan(50);
  });
});
