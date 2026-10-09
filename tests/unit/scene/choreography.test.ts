import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAN,
  TIMING,
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
