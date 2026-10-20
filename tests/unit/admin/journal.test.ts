import { describe, expect, it } from 'vitest';
import type { CommitInfo } from '../../../src/admin/github.ts';
import {
  commitOf,
  entryDetails,
  journalOf,
  kindOf,
  pastDoubles,
  prepareCancels,
  type JournalEntry,
} from '../../../src/admin/journal.ts';
import type { RepoState } from '../../../src/admin/pipeline.ts';
import type { Adjustment, MetricRecord } from '../../../src/data/schemas/records.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import {
  at,
  daily,
  importLog,
  makeConfig,
  manager,
  managerPoints,
  team,
} from '../../support/builders.ts';

// makeConfig: inv6 «Качественные счета» ×1, inv20 «Разговоры от 20 минут» ×3, pay «Оплаты» ×10.
const config = makeConfig({
  teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2)],
  managers: [manager('a', 't1', { fullName: 'Ершова Мария' }), manager('b', 't2')],
});
const season = (
  records: MetricRecord[],
  adjustments: Adjustment[] = [],
  imports: EngineInput['imports'] = [],
): EngineInput => ({ config, records, adjustments, imports });
/** A «показатели за день» correction as `applyCorrections` writes it. */
const fix = (id: string, reason: string, value: number, date: string, when = at('2026-10-08')) => ({
  ...managerPoints(id, 'a', value, when, date),
  reason,
});
const commit = (sha: string, message: string, when: string): CommitInfo => ({
  sha,
  parent: `${sha}-parent`,
  message,
  at: when,
});

describe('the journal’s entries (ADM-LOG)', () => {
  it('entries from the public lines: kind, line, who; newest first; down to the launch; other seasons out', () => {
    const entries = journalOf(
      [
        commit('c6', 'data(s): корректировки: 1 — показатели [by k]', '2026-10-19T07:33:08Z'),
        commit('c5', 'Stage 4: the leaderboard (D-62)', '2026-10-19T07:00:00Z'),
        commit('c4', 'data(demo): тест [by k]', '2026-10-18T07:00:00Z'),
        commit(
          'c3',
          'data(s): импорт: воронка по дням 12.10–19.10, 59 операторов [by k]',
          '2026-10-17T07:00:00Z',
        ),
        commit('c2', 'data(s): новая игра 12.10–25.10, 6 команд [by k]', '2026-10-11T10:00:00Z'),
        commit('c1', 'data(s): импорт: старое [by k]', '2026-10-10T10:00:00Z'),
      ],
      's',
    );
    expect(entries.map((e) => [e.sha, e.kind])).toEqual([
      ['c6', 'corrections'],
      ['c3', 'import'],
      ['c2', 'launch'],
    ]);
    expect(entries[0]).toEqual({
      sha: 'c6',
      parent: 'c6-parent',
      at: '2026-10-19T07:33:08Z',
      kind: 'corrections',
      line: 'корректировки: 1 — показатели',
      by: 'k',
    });
  });

  it('kindOf: every public line of the admin', () => {
    expect(
      [
        'импорт: воронка по дням 05.10–12.10, 49 операторов',
        'корректировки: 2 — показатели',
        'отмена корректировок: 1',
        'состав: 1 увольнение',
        'итоги игры 12.10–25.10',
        'игра снова идёт: 12.10–25.10',
        'новая игра 12.10–25.10, 6 команд',
        'тест',
      ].map(kindOf),
    ).toEqual([
      'import',
      'corrections',
      'cancels',
      'roster',
      'finale',
      'finale',
      'launch',
      'other',
    ]);
  });

  it('commitOf: the oldest corrections or import entry at or after the correction', () => {
    const entry = (sha: string, kind: JournalEntry['kind'], when: string): JournalEntry => ({
      sha,
      parent: null,
      at: when,
      kind,
      line: '',
      by: 'k',
    });
    const entries = [
      entry('e4', 'corrections', '2026-10-19T10:40:00Z'),
      entry('e3', 'roster', '2026-10-19T10:35:00Z'),
      entry('e2', 'import', '2026-10-19T10:31:00Z'),
      entry('e1', 'corrections', '2026-10-19T10:20:00Z'),
    ];
    const made = (when: string) => fix('p', 'Оплаты +1: …', 10, '2026-10-16', when);
    expect(commitOf(entries, made('2026-10-19T13:30:00+03:00'))?.sha).toBe('e2');
    expect(commitOf(entries, made('2026-10-19T13:36:00+03:00'))?.sha).toBe('e4');
    expect(commitOf(entries, made('2026-10-19T13:50:00+03:00'))).toBeUndefined();
  });
});

describe('what one commit changed (ADM-LOG)', () => {
  it('the import added and its per-operator change; corrections added and cancelled', () => {
    const p1 = fix('p1', 'Качественные счета +1: нет в воронке', 1, '2026-10-07');
    const before = season([daily('a', '2026-10-06', { inv6: 1 })], [p1]);
    const after = season(
      [daily('a', '2026-10-06', { inv6: 2 })],
      [
        { ...p1, revoked: { by: 'k', at: at('2026-10-09'), reason: 'пришло в воронке' } },
        fix('p2', 'Оплаты +1: поздняя оплата', 10, '2026-10-06'),
      ],
      [importLog('imp-2', at('2026-10-09'), { dateRange: ['2026-10-06', '2026-10-06'] })],
    );
    const details = entryDetails(before, after);
    expect(details.imports.map((i) => i.id)).toEqual(['imp-2']);
    expect(details.changes.map((r) => r.managerId)).toEqual(['a']);
    expect(details.changes[0]?.metrics.find((m) => m.metricId === 'inv6')).toMatchObject({
      before: 1,
      file: 2,
    });
    expect(details.added.map((x) => x.id)).toEqual(['p2']);
    expect(details.revoked.map((x) => x.id)).toEqual(['p1']);
  });

  it('a commit without an import has no table', () => {
    const before = season([]);
    const after = season([], [fix('p1', 'Оплаты +1: …', 10, '2026-10-06')]);
    expect(entryDetails(before, after).changes).toEqual([]);
  });
});

describe('past double counts (ADM-UNDO)', () => {
  const p1 = fix('p1', 'Качественные счета +1: нет в воронке', 1, '2026-10-06');

  it('a past double count: the records grew after the correction was written', () => {
    const now = season([daily('a', '2026-10-06', { inv6: 2 })], [p1]);
    const then = season([daily('a', '2026-10-06', { inv6: 1 })], [p1]);
    expect(pastDoubles(now, (id) => (id === 'p1' ? then : undefined))).toEqual([
      {
        managerId: 'a',
        date: '2026-10-06',
        metricId: 'inv6',
        manual: 1,
        then: 1,
        now: 2,
        adjustmentIds: ['p1'],
      },
    ]);
  });

  it('no past double count: not grown, offset by «−1», or its commit unknown', () => {
    const grown = [daily('a', '2026-10-06', { inv6: 2 })];
    const then = season([daily('a', '2026-10-06', { inv6: 1 })], [p1]);
    expect(pastDoubles(season(grown, [p1]), () => season(grown, [p1]))).toEqual([]);
    const minus = fix('p2', 'Качественные счета −1: посчитан дважды', -1, '2026-10-06');
    expect(pastDoubles(season(grown, [p1, minus]), () => then)).toEqual([]);
    expect(pastDoubles(season(grown, [p1]), () => undefined)).toEqual([]);
  });
});

describe('cancels as a batch (ADM-UNDO)', () => {
  const p1 = fix('p1', 'Качественные счета +1: нет в воронке', 1, '2026-10-06');
  const p2 = fix('p2', 'Оплаты +1: поздняя оплата', 10, '2026-10-07');
  const state = { input: season([], [p1, p2]) } as unknown as RepoState;
  const opts = { by: 'k', now: '2026-10-20T10:00:00+03:00' };

  it('lines, the revoked reasons as typed, the public message', () => {
    const view = prepareCancels(
      state,
      [
        { id: 'p1', reason: 'пришло в воронке' },
        { id: 'p2', reason: 'оплата пришла в выгрузке' },
      ],
      opts,
    );
    expect(view.problems).toEqual([]);
    expect(view.lines).toEqual([
      'Отменить «Качественные счета +1: нет в воронке» — Ершова Мария, 06.10: пришло в воронке',
      'Отменить «Оплаты +1: поздняя оплата» — Ершова Мария, 07.10: оплата пришла в выгрузке',
    ]);
    expect(view.input.adjustments.map((x) => x.revoked?.reason)).toEqual([
      'пришло в воронке',
      'оплата пришла в выгрузке',
    ]);
    expect(view.message).toBe('отмена корректировок: 2');
    expect(view.state).toBe(state);
  });

  it('an empty reason or a correction gone is a problem at its index; the others apply', () => {
    const view = prepareCancels(
      state,
      [
        { id: 'p1', reason: '  ' },
        { id: 'zz', reason: 'дубль' },
        { id: 'p2', reason: 'дубль' },
      ],
      opts,
    );
    expect(view.problems).toEqual([
      { index: 0, message: 'укажите причину отмены' },
      { index: 1, message: 'корректировки больше нет' },
    ]);
    expect(view.message).toBe('отмена корректировок: 1');
    expect(view.input.adjustments[0]?.revoked).toBeUndefined();
  });
});
