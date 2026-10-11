import { describe, expect, it } from 'vitest';
import {
  applyCorrections,
  clampSteps,
  parseCount,
  stepsHint,
  type Correction,
  type CorrectionsResult,
} from '../../../src/admin/corrections.ts';
import { computeGameState, type TeamState } from '../../../src/engine/gameState.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { at, daily, makeConfig, manager, team, teamSteps } from '../../support/builders.ts';

// A two-week game 05.10–18.10 (10 working days, 2 cells a day, overflow 50 %: the end is cell 30).
const NOW = '2026-10-12T14:05:00+03:00';
const OPTS = { now: NOW, by: 'admin' };
const input: EngineInput = {
  config: makeConfig({
    teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
    managers: [
      manager('op001', 't1', { fullName: 'Ершова Мария' }),
      manager('op002', 't2', { fullName: 'Федоров Иван', firedAt: '2026-10-09' }),
      manager('op003', 't2', { fullName: 'Белова Анна' }),
    ],
  }),
  records: [daily('op001', '2026-10-05', { inv6: 30 }), daily('op003', '2026-10-06', { pay: 1 })],
  adjustments: [],
  imports: [],
};
const place = (i: EngineInput, teamId: string, now = NOW) =>
  computeGameState(i, now).teams.find((t) => t.teamId === teamId) as TeamState;
const MAX = computeGameState(input, NOW).track.maxPosition;
const P = place(input, 't1').position;
const added = (r: CorrectionsResult) => r.input.adjustments.slice(input.adjustments.length);
const steps = (n: number, teamId = 't1', reason = 'конкурс'): Correction => ({
  kind: 'steps',
  teamId,
  steps: n,
  reason,
});

describe('steps to a team (ADM-STEPS, no debt — the author 11.10.2026)', () => {
  it('the fixture: team СР1 stands inside the track', () => {
    expect(P).toBeGreaterThan(2);
    expect(MAX - P).toBeGreaterThan(2);
  });

  it('a bonus as typed: the reason kept, the admin and the time, an id of the minute', () => {
    const r = applyCorrections(input, [steps(3)], OPTS);
    expect(r.problems).toEqual([]);
    expect(added(r)).toEqual([
      {
        id: 'adj-202610121405-1',
        type: 'team_steps',
        teamId: 't1',
        value: 3,
        reason: 'конкурс',
        by: 'admin',
        at: NOW,
      },
    ]);
    expect(place(r.input, 't1').position).toBe(P + 3);
    expect(r.lines).toEqual([`Шаги: СР1 +3 — клетка ${P} → ${P + 3} (конкурс)`]);
  });

  it('a penalty larger than the cell is written as what the figure really loses', () => {
    const r = applyCorrections(input, [steps(-(P + 5), 't1', 'штраф')], OPTS);
    expect(r.problems).toEqual([]);
    expect(added(r)).toMatchObject([{ type: 'team_steps', value: -P }]);
    expect(place(r.input, 't1').position).toBe(0);
    expect(r.lines).toEqual([
      `Шаги: СР1 −${P + 5} — клетка ${P} → 0: запишется −${P}, ниже старта нельзя (штраф)`,
    ]);
  });

  it('a bonus past the end of the overflow zone is cut to the end', () => {
    const r = applyCorrections(input, [steps(MAX - P + 4)], OPTS);
    expect(added(r)).toMatchObject([{ type: 'team_steps', value: MAX - P }]);
    expect(place(r.input, 't1').position).toBe(MAX);
    expect(r.lines[0]).toContain(`запишется +${MAX - P}, дальше конца трека нельзя`);
  });

  it("the batch's earlier corrections count: nothing to take at the start, nothing to give at the end", () => {
    const down = applyCorrections(input, [steps(-P), steps(-1)], OPTS);
    expect(down.problems).toEqual([
      { index: 1, message: 'команда уже на старте — штрафовать нечего' },
    ]);
    expect(added(down)).toHaveLength(1);
    const up = applyCorrections(input, [steps(MAX - P), steps(1)], OPTS);
    expect(up.problems).toEqual([{ index: 1, message: 'команда уже в конце трека' }]);
    expect(up.lines[1]).toBe('Шаги: СР1 +1 (конкурс)');
  });

  it('steps are a whole number, not 0; a team of the game; a reason for every kind', () => {
    const r = applyCorrections(
      input,
      [
        steps(0),
        steps(1.5),
        steps(Number.NaN),
        steps(2, 'нет'),
        steps(2, 't1', '   '),
        { kind: 'reset', teamId: 't1', reason: '' },
      ],
      OPTS,
    );
    expect(r.problems.map((p) => p.message)).toEqual([
      'шаги — целое число, не 0',
      'шаги — целое число, не 0',
      'шаги — целое число, не 0',
      'этой команды нет в игре',
      'укажите причину',
      'укажите причину',
    ]);
    expect(r.input).toBe(input);
    expect(r.lines[2]).toBe('Шаги: СР1 ? (конкурс)');
  });

  it('parseCount reads a sign typed any way and refuses what is not a whole number', () => {
    expect(['3', '+3', ' 3 ', '-3', '−3', '–3', '- 3'].map(parseCount)).toEqual([
      3, 3, 3, -3, -3, -3, -3,
    ]);
    for (const bad of ['', '3,5', '1.5', 'три', '+', '3+', '0x10', '1e3'])
      expect(parseCount(bad)).toBeNaN();
  });

  it('clampSteps and stepsHint: what the steps do to a figure, in words', () => {
    expect(clampSteps(5, -8, 30)).toBe(-5);
    expect(clampSteps(28, 4, 30)).toBe(2);
    expect(stepsHint(12, 2, 30)).toBe('клетка 12 → 14');
    expect(stepsHint(0, -1, 30)).toBe('команда уже на старте — штрафовать нечего');
    expect(stepsHint(30, 1, 30)).toBe('команда уже в конце трека');
  });

  it("ids continue the minute's numbers in the file; another minute starts at 1", () => {
    const earlier = teamSteps('adj-202610121405-2', 't2', 1, NOW);
    const same = applyCorrections({ ...input, adjustments: [earlier] }, [steps(1), steps(1)], OPTS);
    expect(same.input.adjustments.map((a) => a.id)).toEqual([
      'adj-202610121405-2',
      'adj-202610121405-3',
      'adj-202610121405-4',
    ]);
    const later = applyCorrections({ ...input, adjustments: [earlier] }, [steps(1)], {
      now: '2026-10-12T14:06:10+03:00',
      by: 'admin',
    });
    expect(later.input.adjustments.at(-1)?.id).toBe('adj-202610121406-1');
  });
});

describe('a team back to the start (ADM-RESET-TEAM, D-17)', () => {
  it('removes the computed cell and the steps; later data move the figure on from the start', () => {
    const stepped = { ...input, adjustments: [teamSteps('a1', 't1', 2, at('2026-10-07'))] };
    const before = place(stepped, 't1');
    const r = applyCorrections(
      stepped,
      [{ kind: 'reset', teamId: 't1', reason: 'ошибка в данных' }],
      OPTS,
    );
    expect(r.problems).toEqual([]);
    // The earlier steps stay in the file; the reset is appended and outweighs them (D-17).
    expect(r.input.adjustments.map((a) => a.type)).toEqual(['team_steps', 'team_reset']);
    expect(r.input.adjustments.at(-1)).toMatchObject({
      type: 'team_reset',
      teamId: 't1',
      value: before.computedPosition,
      reason: 'ошибка в данных',
    });
    expect(place(r.input, 't1').position).toBe(0);
    expect(r.lines).toEqual([`На старт: СР1 — клетка ${before.position} → 0 (ошибка в данных)`]);
    const more = {
      ...r.input,
      records: [...r.input.records, daily('op001', '2026-10-12', { inv6: 15 })],
    };
    const after = place(more, 't1');
    expect(after.position).toBe(after.computedPosition - before.computedPosition);
    expect(after.position).toBeGreaterThan(0);
  });
});
