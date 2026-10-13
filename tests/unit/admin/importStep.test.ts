import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import { importCommitMessage, prepareImport, toAsk } from '../../../src/admin/importStep.ts';
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
