import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import {
  applyCorrections,
  clampSteps,
  correctionsCommitMessage,
  metricDay,
  metricText,
  parseCount,
  prepareCorrections,
  stepsHint,
  type Correction,
  type CorrectionsResult,
} from '../../../src/admin/corrections.ts';
import { commitChange, loadRepoState, type RepoState } from '../../../src/admin/pipeline.ts';
import { computeGameState, type TeamState } from '../../../src/engine/gameState.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { at, daily, makeConfig, manager, team, teamSteps } from '../../support/builders.ts';
import { FakeGitHubRepo } from '../../support/fakeGitHub.ts';

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

const metric = (
  managerId: string,
  date: string,
  metricId: string,
  count: number,
  reason = 'поздняя оплата',
): Correction => ({ kind: 'metric', managerId, date, metricId, count, reason });
const operator = (i: EngineInput, id: string, now = NOW) =>
  computeGameState(i, now).managers.find((m) => m.managerId === id);
const pay = input.config.metrics.find((m) => m.id === 'pay');

describe("an operator's numbers for a day (D-25, the author's choice A 11.10.2026)", () => {
  it('become points of that day by the weight, with the count in words in the reason', () => {
    const r = applyCorrections(input, [metric('op001', '2026-10-09', 'pay', 1)], OPTS);
    expect(r.problems).toEqual([]);
    expect(added(r)).toEqual([
      {
        id: 'adj-202610121405-1',
        type: 'manager_points',
        managerId: 'op001',
        date: '2026-10-09',
        value: 10,
        reason: 'Оплаты +1: поздняя оплата',
        by: 'admin',
        at: NOW,
      },
    ]);
    expect(
      (operator(r.input, 'op001')?.points ?? 0) - (operator(input, 'op001')?.points ?? 0),
    ).toBe(10);
    expect(r.lines).toEqual([
      'Показатели: Ершова Мария (СР1), 09.10 — Оплаты +1 = +10 баллов (поздняя оплата)',
    ]);
  });

  it("a minus takes points; the metric's counters stay as the exports gave them", () => {
    const r = applyCorrections(input, [metric('op001', '2026-10-05', 'inv20', -2, 'не тот')], OPTS);
    expect(added(r)).toMatchObject([{ value: -6, reason: 'Разговоры от 20 минут −2: не тот' }]);
    expect(operator(r.input, 'op001')?.totals).toEqual(operator(input, 'op001')?.totals);
  });

  it('the day is of the game and not after today', () => {
    const r = applyCorrections(
      input,
      [
        metric('op001', '2026-10-13', 'pay', 1),
        metric('op001', '2026-10-01', 'pay', 1),
        metric('op001', '', 'pay', 1),
      ],
      OPTS,
    );
    expect(r.problems.map((p) => p.message)).toEqual([
      '13.10 ещё не наступило',
      '01.10 — не день игры (05.10–18.10)',
      'укажите день',
    ]);
    expect(r.lines[2]).toBe('Показатели: Ершова Мария, без дня — Оплаты +1 (поздняя оплата)');
  });

  it('a fired operator may get a late payment: it counts for the team of that day (R-1)', () => {
    const r = applyCorrections(input, [metric('op002', '2026-10-08', 'pay', 1)], OPTS);
    expect(r.problems).toEqual([]);
    expect(place(r.input, 't2').points - place(input, 't2').points).toBe(10);
  });

  it('an unknown operator or metric, a count of 0 or a fraction are problems', () => {
    const r = applyCorrections(
      input,
      [
        metric('op999', '2026-10-09', 'pay', 1),
        metric('op001', '2026-10-09', 'xxx', 1),
        metric('op001', '2026-10-09', 'pay', 0),
        metric('op001', '2026-10-09', 'pay', 0.5),
      ],
      OPTS,
    );
    expect(r.problems.map((p) => p.message)).toEqual([
      'этого оператора нет в составе',
      'такого показателя нет в игре',
      'сколько — целое число, не 0',
      'сколько — целое число, не 0',
    ]);
  });

  it('a minus below zero for the day is warned about, never refused', () => {
    const none = applyCorrections(
      input,
      [metric('op003', '2026-10-05', 'pay', -1, 'ошибка')],
      OPTS,
    );
    expect(none.problems).toEqual([]);
    expect(none.warnings).toEqual([
      'Белова Анна, 05.10: баллов за день станет меньше нуля (−10) — проверьте день и оператора',
    ]);
    const some = applyCorrections(
      input,
      [metric('op003', '2026-10-06', 'pay', -1, 'ошибка')],
      OPTS,
    );
    expect(some.warnings).toEqual([]);
  });

  it('metricText: the count and its points in words', () => {
    if (!pay) throw new Error('нет метрики pay');
    expect(metricText(pay, 1)).toBe('Оплаты +1 = +10 баллов');
    expect(metricText(pay, -2)).toBe('Оплаты −2 = −20 баллов');
    expect(metricText({ ...pay, weight: 1 }, 1)).toBe('Оплаты +1 = +1 балл');
    expect(metricText({ ...pay, weight: 1.5 }, 1)).toBe('Оплаты +1 = +1,5 балла');
  });
});

describe('the batch as a whole (plan 2b-2)', () => {
  it('the default day: yesterday, inside the game, never after today', () => {
    expect(metricDay(input.config, '2026-10-12')).toBe('2026-10-11');
    expect(metricDay(input.config, '2026-10-05')).toBe('2026-10-05');
    expect(metricDay(input.config, '2026-10-25')).toBe('2026-10-18');
  });

  it('after the end of the game: the cells of the end, the last day allowed', () => {
    const late = { now: '2026-10-20T10:00:00+03:00', by: 'admin' };
    const end = place(input, 't1', late.now).position;
    const r = applyCorrections(input, [steps(1), metric('op001', '2026-10-18', 'pay', 1)], late);
    expect(r.problems).toEqual([]);
    expect(place(r.input, 't1', late.now).position).toBeGreaterThan(end);
    expect(metricDay(input.config, '2026-10-20')).toBe('2026-10-18');
  });

  it('the same batch on a season changed meanwhile takes that season’s values (ADM-2)', () => {
    const batch = [steps(MAX)];
    const value = (r: CorrectionsResult) => (r.input.adjustments.at(-1) as { value: number }).value;
    expect(value(applyCorrections(input, batch, OPTS))).toBe(MAX - P);
    const moved = {
      ...input,
      adjustments: [teamSteps('other', 't1', 3, at('2026-10-12', '10:00'))],
    };
    expect(value(applyCorrections(moved, batch, OPTS))).toBe(MAX - P - 3);
  });

  it('the public message: counts only, zero counts left out (D-51)', () => {
    const all: Correction[] = [
      steps(1),
      steps(-1, 't2'),
      metric('op001', '2026-10-09', 'pay', 1),
      { kind: 'reset', teamId: 't2', reason: 'ошибка' },
    ];
    expect(correctionsCommitMessage(all)).toBe(
      'корректировки: 2 — шаги, 1 — показатели, 1 — старт',
    );
    expect(correctionsCommitMessage([all[2] as Correction])).toBe('корректировки: 1 — показатели');
  });
});

describe('a corrections batch from the screen to a commit (plan 2b-2)', () => {
  const DEMO = 'sales-quest-demo';
  const DEMO_NOW = '2026-10-14T12:00:00+03:00';
  let state: RepoState;
  beforeAll(async () => {
    state = await loadRepoState(FakeGitHubRepo.fromDir(DEMO_DATA), DEMO, new Map());
  });

  it('the step: the preview, the cells after the batch, the message of what applies', () => {
    const step = prepareCorrections(
      state,
      [steps(1), { kind: 'reset', teamId: 'нет', reason: 'тест' }],
      { now: DEMO_NOW, by: 'k' },
    );
    const row = step.preview.teams.find((t) => t.teamId === 't1');
    expect(row && row.after - row.before).toBe(1);
    expect(step.positions.get('t1')).toBe(row?.after);
    expect(step.max).toBe(computeGameState(state.input, DEMO_NOW).track.maxPosition);
    expect(step.result.problems).toEqual([{ index: 1, message: 'этой команды нет в игре' }]);
    expect(step.message).toBe('корректировки: 1 — шаги');
    expect(step.state).toBe(state);
  });

  it('a commit of the batch changes only the adjustments and the version', async () => {
    const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
    const s = await loadRepoState(fake, DEMO, new Map());
    const step = prepareCorrections(s, [steps(1, 't2', 'тест')], { now: DEMO_NOW, by: 'k' });
    await commitChange(fake, s, step.result.input, {
      phrase: DEMO,
      keys: new Map(),
      message: step.message,
      by: 'k',
      now: DEMO_NOW,
    });
    const first = fake.commits[0]?.files ?? new Map<string, string>();
    const changed = [...fake.last.files]
      .filter(([path, text]) => first.get(path) !== text)
      .map(([path]) => path)
      .sort();
    expect(changed).toEqual(['data/seasons/demo/adjustments.enc.json', 'data/version.json']);
    expect(fake.last.message).toBe('data(demo): корректировки: 1 — шаги [by k]');
  });
});
