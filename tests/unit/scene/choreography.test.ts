import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAN,
  TIMING,
  jumpAt,
  planMoves,
  popupsAt,
  poseAt,
  shotAt,
} from '../../../src/scene/choreography.ts';

const pos = (entries: [string, number][]) =>
  entries.map(([teamId, position]) => ({ teamId, position }));

describe('planMoves (FR-MOVE-1, FR-MOVE-3, D-23)', () => {
  it('plays nothing on the first open or without changes (FR-MOVE-4)', () => {
    expect(planMoves(null, pos([['t1', 4]]))).toBe(EMPTY_PLAN);
    expect(planMoves(pos([['t1', 4]]), pos([['t1', 4]]))).toEqual(EMPTY_PLAN);
  });

  it('moves the teams that changed one after another, then returns to the overview', () => {
    const plan = planMoves(
      pos([
        ['t1', 2],
        ['t2', 5],
        ['t3', 1],
      ]),
      pos([
        ['t1', 4],
        ['t2', 5],
        ['t3', 2],
      ]),
    );
    const { flyMs, hopMs, pauseMs, overviewMs } = TIMING;
    expect(plan.moves).toEqual([
      { teamId: 't1', from: 2, to: 4, start: flyMs, hopMs, end: flyMs + 2 * hopMs, cheer: false },
      {
        teamId: 't3',
        from: 1,
        to: 2,
        start: 2 * flyMs + 2 * hopMs + pauseMs,
        hopMs,
        end: 2 * flyMs + 3 * hopMs + pauseMs,
        cheer: false,
      },
    ]);
    expect(plan.shots.map((s) => [s.start, s.target])).toEqual([
      [0, { kind: 'team', teamId: 't1' }],
      [flyMs + 2 * hopMs + pauseMs, { kind: 'team', teamId: 't3' }],
      [2 * flyMs + 3 * hopMs + 2 * pauseMs, { kind: 'overview' }],
    ]);
    expect(plan.duration).toBe(2 * flyMs + 3 * hopMs + 2 * pauseMs + overviewMs);
    expect(plan.popups.map((p) => p.text)).toEqual(['+2 шага', '+1 шаг']);
  });

  it('walks back after a reset and speeds long walks up', () => {
    const plan = planMoves(pos([['t1', 30]]), pos([['t1', 0]]));
    const move = plan.moves[0];
    expect([move?.from, move?.to, move?.hopMs, (move?.end ?? 0) - (move?.start ?? 0)]).toEqual([
      30,
      0,
      100,
      TIMING.maxWalkMs,
    ]);
    expect(plan.popups[0]?.text).toBe('−30 шагов');
  });

  it('cheers a team that passes a gate forward, not one that walks back through it (3b)', () => {
    const gates = [8, 16, 24, 32];
    const plan = planMoves(
      pos([
        ['t1', 6],
        ['t2', 9],
        ['t3', 17],
        ['t4', 30],
      ]),
      pos([
        ['t1', 8],
        ['t2', 12],
        ['t3', 15],
        ['t4', 33],
      ]),
      TIMING,
      gates,
    );
    expect(plan.moves.map((m) => [m.teamId, m.cheer])).toEqual([
      ['t1', true],
      ['t2', false],
      ['t3', false],
      ['t4', true],
    ]);
    // After a gate the camera stays for the whole cheer; after an ordinary walk, the usual pause.
    const [t1, t2] = plan.moves;
    expect((t2?.start ?? 0) - TIMING.flyMs - (t1?.end ?? 0)).toBe(TIMING.cheerMs);
    const t3 = plan.moves[2];
    expect((t3?.start ?? 0) - TIMING.flyMs - (t2?.end ?? 0)).toBe(TIMING.pauseMs);
  });

  it('lets a team new to the game appear without a walk', () => {
    expect(planMoves(pos([['t1', 1]]), pos([['t9', 3]]))).toEqual(EMPTY_PLAN);
  });
});

describe('playback', () => {
  const plan = planMoves(
    pos([
      ['t1', 2],
      ['t2', 0],
    ]),
    pos([
      ['t1', 4],
      ['t2', 0],
    ]),
  );
  const start = TIMING.flyMs;

  it('poses a figure before, during and after its walk', () => {
    expect(poseAt(plan, 't1', 0, 4)).toEqual({ a: 2, b: 2, f: 0 });
    expect(poseAt(plan, 't1', start + 150, 4)).toEqual({ a: 2, b: 3, f: 0.5 });
    expect(poseAt(plan, 't1', start + 450, 4)).toEqual({ a: 3, b: 4, f: 0.5 });
    expect(poseAt(plan, 't1', plan.duration, 4)).toEqual({ a: 4, b: 4, f: 0 });
    expect(poseAt(plan, 't2', start + 150, 0)).toEqual({ a: 0, b: 0, f: 0 });
  });

  it('gives the camera shot under way', () => {
    expect(shotAt(plan, 450)).toEqual({ shot: plan.shots[0], progress: 0.5 });
    expect(shotAt(plan, plan.duration - 1)?.shot.target).toEqual({ kind: 'overview' });
    expect(shotAt(plan, plan.duration)).toBeNull();
    expect(shotAt(EMPTY_PLAN, 0)).toBeNull();
  });

  it('shows «+N» during the walk and the pause', () => {
    expect(popupsAt(plan, start - 1)).toEqual([]);
    expect(popupsAt(plan, start)[0]?.text).toBe('+2 шага');
    expect(popupsAt(plan, start + 600 + TIMING.pauseMs)).toEqual([]);
  });
});

const withPoints = (entries: [string, number, number][]) =>
  entries.map(([teamId, position, points]) => ({ teamId, position, points }));

describe('the beats of a portion (D-57)', () => {
  it('points without steps: the camera flies, the figure jumps, «+N баллов» runs, a pause', () => {
    const plan = planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 52]]));
    const { flyMs, jumpMs, countMs, pauseMs, overviewMs } = TIMING;
    expect(plan.moves).toEqual([]);
    expect(plan.jumps).toEqual([{ teamId: 't1', start: flyMs, end: flyMs + jumpMs }]);
    expect(plan.popups).toEqual([
      {
        teamId: 't1',
        text: '+12 баллов',
        start: flyMs,
        end: flyMs + countMs + pauseMs,
        count: { points: 12, ms: countMs },
      },
    ]);
    expect(plan.shots.map((s) => s.target.kind)).toEqual(['team', 'overview']);
    expect(plan.duration).toBe(flyMs + countMs + pauseMs + overviewMs);
  });

  it('points and steps: the count first, then the walk with «+N шагов»', () => {
    const plan = planMoves(withPoints([['t1', 2, 20]]), withPoints([['t1', 4, 40]]));
    const { flyMs, countMs, hopMs } = TIMING;
    expect(plan.moves).toMatchObject([{ teamId: 't1', from: 2, to: 4, start: flyMs + countMs }]);
    expect(plan.popups.map((p) => [p.text, p.start])).toEqual([
      ['+20 баллов', flyMs],
      ['+2 шага', flyMs + countMs],
    ]);
    expect(plan.moves[0]?.end).toBe(flyMs + countMs + 2 * hopMs);
  });

  it('cells without points: no points beats — the plan of before D-57', () => {
    const plan = planMoves(pos([['t1', 2]]), pos([['t1', 4]]));
    expect(plan.jumps).toEqual([]);
    expect(plan.popups.map((p) => p.text)).toEqual(['+2 шага']);
    expect(plan.moves[0]?.start).toBe(TIMING.flyMs);
  });

  it('no change, a loss of points or less than a point: no beat', () => {
    expect(planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 40.4]]))).toEqual(
      EMPTY_PLAN,
    );
    expect(planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 30]]))).toEqual(EMPTY_PLAN);
  });

  it('the counting text runs from +0 to the result, at most 15 changes a second; still — the result', () => {
    const plan = planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 52]]));
    const start = TIMING.flyMs;
    expect(popupsAt(plan, start)[0]?.text).toBe('+0 баллов');
    expect(popupsAt(plan, start + TIMING.countMs)[0]?.text).toBe('+12 баллов');
    expect(popupsAt(plan, start, true)[0]?.text).toBe('+12 баллов');
    const texts = new Set<string>();
    for (let ms = 0; ms <= 1000; ms += 5) texts.add(popupsAt(plan, start + ms)[0]?.text ?? '');
    expect(texts.size).toBeLessThanOrEqual(16);
  });

  it('the jump: an arc 0 → 1 → 0 over its time, none outside it', () => {
    const plan = planMoves(withPoints([['t1', 4, 40]]), withPoints([['t1', 4, 52]]));
    const { flyMs, jumpMs } = TIMING;
    expect(jumpAt(plan, 't1', flyMs - 1)).toBe(0);
    expect(jumpAt(plan, 't1', flyMs + jumpMs / 2)).toBeCloseTo(1);
    expect(jumpAt(plan, 't1', flyMs + jumpMs)).toBe(0);
    expect(jumpAt(plan, 't2', flyMs + jumpMs / 2)).toBe(0);
  });

  it('bursts at the end of a walk, the most notable one: finish > leader > gate > overtake', () => {
    const gates = [8, 16];
    const end = (plan: ReturnType<typeof planMoves>) => plan.moves[0]?.end;
    // t1 passes the gate at 8 and t2 (strictly ahead before, behind after), but t3 still leads.
    const gate = planMoves(
      pos([
        ['t1', 6],
        ['t2', 7],
        ['t3', 12],
      ]),
      pos([
        ['t1', 9],
        ['t2', 7],
        ['t3', 12],
      ]),
      TIMING,
      gates,
      16,
    );
    expect(gate.bursts).toEqual([{ teamId: 't1', kind: 'gate', start: end(gate) }]);
    const overtake = planMoves(
      pos([
        ['t1', 4],
        ['t2', 5],
        ['t3', 12],
      ]),
      pos([
        ['t1', 6],
        ['t2', 5],
        ['t3', 12],
      ]),
      TIMING,
      gates,
      16,
    );
    expect(overtake.bursts).toEqual([{ teamId: 't1', kind: 'overtake', start: end(overtake) }]);
    const leader = planMoves(
      pos([
        ['t1', 6],
        ['t2', 7],
      ]),
      pos([
        ['t1', 9],
        ['t2', 7],
      ]),
      TIMING,
      gates,
      16,
    );
    expect(leader.bursts).toEqual([{ teamId: 't1', kind: 'leader', start: end(leader) }]);
    const finish = planMoves(
      pos([
        ['t1', 14],
        ['t2', 15],
      ]),
      pos([
        ['t1', 17],
        ['t2', 15],
      ]),
      TIMING,
      gates,
      16,
    );
    expect(finish.bursts).toEqual([{ teamId: 't1', kind: 'finish', start: end(finish) }]);
    // A step back makes no burst.
    expect(planMoves(pos([['t1', 9]]), pos([['t1', 6]]), TIMING, gates, 16).bursts).toEqual([]);
  });
});
