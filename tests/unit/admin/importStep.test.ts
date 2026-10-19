import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import {
  importCommitMessage,
  periodText,
  prepareImport,
  toAsk,
} from '../../../src/admin/importStep.ts';
import { applyCorrections, type Correction } from '../../../src/admin/corrections.ts';
import { doubleCounts, importChanges } from '../../../src/admin/importDiff.ts';
import { isPublished, publishingText } from '../../../src/admin/publishing.ts';
import { loadRepoState, type RepoState } from '../../../src/admin/pipeline.ts';
import { matchPeople } from '../../../src/import/match.ts';
import type { ParsedFile } from '../../../src/import/parseFile.ts';
import { DEFAULT_PROFILES } from '../../../src/import/profiles.ts';
import { parseWorkbook } from '../../../src/import/xlsx.ts';
import { FakeGitHubRepo } from '../../support/fakeGitHub.ts';

const NOW = '2026-10-13T10:00:00+03:00';
let state: RepoState;
let file: ParsedFile;
beforeAll(async () => {
  state = await loadRepoState(FakeGitHubRepo.fromDir(DEMO_DATA), 'sales-quest-demo', new Map());
  const bytes = readFileSync('tests/fixtures/import/funnel.xlsx');
  const { profile, parsed } = parseWorkbook(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    DEFAULT_PROFILES,
    '2026-10-13',
  );
  file = { profile, parsed, sha256: 'f'.repeat(64), fileName: 'funnel.xlsx' };
});

describe('one import from a file to a commit (plan 2a)', () => {
  it('asks only about the unknown with numbers in the file; nothing is preselected (review 2a)', () => {
    const match = matchPeople(file.parsed.people, state.input.config, file.parsed.period[0]);
    expect(match.unknown.map((u) => u.name)).toEqual(['Новикова Фёкла', 'Тестов Тест']);
    // «Тестов Тест» has no number in the file: nothing of theirs to lose, nothing to ask.
    expect(toAsk(match.unknown, file.parsed).map((u) => u.name)).toEqual(['Новикова Фёкла']);
  });

  it('the step keeps the season it was computed on: its commit goes on that base (review 2a)', () => {
    const step = prepareImport(state, file, new Map(), { by: 'k', at: NOW, now: NOW });
    expect(step.state).toBe(state);
  });

  it('applies the file, previews it and writes a message of counts, never of names', () => {
    const step = prepareImport(
      state,
      file,
      new Map([
        ['новикова фекла', { kind: 'new', teamId: 't1' }],
        ['тестов тест', { kind: 'ignore' }],
      ]),
      { by: 'koordinator', at: NOW, now: NOW },
    );
    expect(step.result.summary).toMatchObject({ added: 1, ignored: 1 });
    expect(step.preview.teams.some((t) => t.after !== t.before)).toBe(true);
    expect(step.message).toBe('импорт: воронка по дням 05.10–12.10, 49 операторов, 1 новый');
    for (const m of state.input.config.managers) expect(step.message).not.toContain(m.fullName);
  });

  it('the same file once more changes no team', () => {
    const resolutions = new Map([
      ['новикова фекла', { kind: 'new' as const, teamId: 't1' }],
      ['тестов тест', { kind: 'ignore' as const }],
    ]);
    const first = prepareImport(state, file, resolutions, { by: 'k', at: NOW, now: NOW });
    const again = prepareImport({ ...state, input: first.result.input }, file, new Map(), {
      by: 'k',
      at: NOW,
      now: NOW,
    });
    expect(again.preview.teams.every((t) => t.before === t.after)).toBe(true);
    expect(again.result.input.records).toEqual(first.result.input.records);
  });

  it('a commit message of the paid invoices and one operator reads right', () => {
    expect(importCommitMessage('Оплаченные счета', ['2026-10-05', '2026-10-07'], 1, 0)).toBe(
      'импорт: оплаченные счета 05.10–07.10, 1 оператор',
    );
  });

  it('a one-day file reads as one date (D-55)', () => {
    expect(importCommitMessage('Промежуточные итоги', ['2026-10-13', '2026-10-13'], 49, 0)).toBe(
      'импорт: промежуточные итоги 13.10, 49 операторов',
    );
    expect(periodText(['2026-10-05', '2026-10-07'])).toBe('05.10–07.10');
  });
});

describe('fixes and cancels in the import preview (2b-3)', () => {
  const OPTS = { by: 'k', at: NOW, now: NOW };
  /** An operator of the demo with numbers in the file. */
  const someone = () => {
    const match = matchPeople(file.parsed.people, state.input.config, file.parsed.period[0]);
    return [...match.managerOf.values()][0] as string;
  };
  const fixOf = (reason: string): Correction => ({
    kind: 'metric',
    managerId: someone(),
    date: '2026-10-12',
    metricId: 'inv6',
    count: 1,
    reason,
  });
  /** The demo with a correction committed before the file. */
  const corrected = () => {
    const made = applyCorrections(state.input, [fixOf('нет в воронке')], {
      now: '2026-10-12T09:00:00+03:00',
      by: 'k',
    });
    const id = made.input.adjustments.at(-1)?.id as string;
    return { state: { ...state, input: made.input }, id };
  };

  it('a fix in the preview goes into the same step: the adjustment, the line, the message', () => {
    const step = prepareImport(state, file, new Map(), OPTS, {
      fixes: [fixOf('нет в воронке')],
      cancels: [],
    });
    expect(step.problems).toEqual([]);
    const made = step.result.input.adjustments.at(-1);
    expect(made).toMatchObject({
      type: 'manager_points',
      managerId: someone(),
      date: '2026-10-12',
      reason: 'Качественные счета +1: нет в воронке',
    });
    expect(step.lines).toHaveLength(1);
    expect(step.message).toMatch(/, корректировок: 1$/);
  });

  it('a cancel ticked in the preview revokes the correction in the same step', () => {
    const { state: before, id } = corrected();
    const step = prepareImport(before, file, new Map(), OPTS, { fixes: [], cancels: [id] });
    expect(step.problems).toEqual([]);
    const gone = step.result.input.adjustments.find((a) => a.id === id);
    expect(gone?.revoked).toEqual({ by: 'k', at: NOW, reason: 'пришло в выгрузке 12.10' });
    expect(step.message).toMatch(/, отменено корректировок: 1$/);
  });

  it('a fix without a reason, or any fix in an intraday file, is a problem — nothing else changes', () => {
    const plain = prepareImport(state, file, new Map(), OPTS);
    const blank = prepareImport(state, file, new Map(), OPTS, {
      fixes: [fixOf('  ')],
      cancels: [],
    });
    expect(blank.problems).toEqual([{ index: 0, message: 'укажите причину' }]);
    expect(blank.result.input.adjustments).toEqual(plain.result.input.adjustments);
    const intraday = { ...file, profile: { ...file.profile, kind: 'list' as const } };
    const listed = prepareImport(state, intraday, new Map(), OPTS, {
      fixes: [fixOf('нет в воронке')],
      cancels: [],
    });
    expect(listed.problems).toEqual([
      { index: 0, message: 'в промежуточных итогах правок нет — правьте после утренней воронки' },
    ]);
    expect(listed.result.input.adjustments).toEqual(state.input.adjustments);
  });

  it('the step’s changes and doubles come from the same before and after', () => {
    const { state: before } = corrected();
    const step = prepareImport(before, file, new Map(), OPTS);
    const period = step.result.summary.period;
    expect(step.changes).toEqual(importChanges(before.input, step.result.input, period));
    expect(step.doubles).toEqual(doubleCounts(before.input, step.result.input, period));
  });

  it('on a fresh read the same fixes and cancels apply; a cancel of a correction gone meanwhile is a problem', () => {
    const { state: before, id } = corrected();
    const once = prepareImport(before, file, new Map(), OPTS, { fixes: [], cancels: [id] });
    const fresh = { ...before, input: once.result.input };
    const again = prepareImport(fresh, file, new Map(), OPTS, { fixes: [], cancels: [id] });
    expect(again.problems).toEqual([
      {
        index: -1,
        message: 'Отмена «Качественные счета +1: нет в воронке»: корректировка уже отменена',
      },
    ]);
    const lost = prepareImport(state, file, new Map(), OPTS, { fixes: [], cancels: [id] });
    expect(lost.problems).toEqual([
      { index: -1, message: `Отмена корректировки ${id}: корректировки больше нет` },
    ]);
  });
});

describe('the publication (SYNC-4)', () => {
  it('is done when the site gives the new revision', () => {
    const v = (rev: string) =>
      ({
        schemaVersion: 1,
        rev,
        seasonId: 'x',
        updatedAt: NOW,
        lastImportAt: null,
        files: {},
      }) as never;
    expect(isPublished('abc', v('abc'))).toBe(true);
    expect(isPublished('abc', v('old'))).toBe(false);
  });

  it('says how long it usually takes, and when it is late', () => {
    expect(publishingText(30_000)).toBe('Публикуется… обычно 1–2 минуты');
    expect(publishingText(6 * 60_000)).toMatch(/дольше обычного/);
  });
});
