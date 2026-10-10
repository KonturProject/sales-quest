import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import { ConflictError } from '../../../src/admin/github.ts';
import { commitChange, loadRepoState, previewChange } from '../../../src/admin/pipeline.ts';
import { DecryptError, type KeyCache } from '../../../src/data/crypto.ts';
import { fingerprint, parseVersion } from '../../../src/data/files.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { FakeGitHubRepo } from '../../support/fakeGitHub.ts';

const PHRASE = 'sales-quest-demo';
const NOW = '2026-10-09T18:00:00+03:00';
const keys: KeyCache = new Map();
let fake: FakeGitHubRepo;
beforeEach(() => {
  fake = FakeGitHubRepo.fromDir(DEMO_DATA);
});

/** Team t6 gets 40 talks of 20+ minutes on the first day: it moves, the others do not. */
function boost(input: EngineInput): EngineInput {
  const m = input.config.managers.find((x) => x.memberships[0]?.teamId === 't6');
  if (!m) throw new Error('в демо нет команды t6');
  const date = input.config.period.start;
  return {
    ...input,
    records: [
      ...input.records.filter((r) => !(r.managerId === m.id && r.date === date)),
      {
        managerId: m.id,
        date,
        kind: 'daily',
        values: { inv6: 0, inv20: 40, pay: 0 },
        importId: 'imp-test',
      },
    ],
  };
}
const opts = (message = 'импорт воронки — 1 оператор') => ({
  phrase: PHRASE,
  keys,
  message,
  by: 'koordinator',
  now: NOW,
});

describe('the write path of the admin (§8, ADM-2, SEC-4, SEC-5)', () => {
  it('reads the season at the head of main and opens it with the phrase', async () => {
    const state = await loadRepoState(fake, PHRASE, keys);
    expect(state.head).toBe('c0');
    expect(state.version.seasonId).toBe('demo');
    expect(state.input.config.id).toBe('demo');
    await expect(loadRepoState(fake, 'не та фраза', new Map())).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it('previews the teams before → after and the top 10', async () => {
    const state = await loadRepoState(fake, PHRASE, keys);
    const p = previewChange(state.input, boost(state.input), NOW);
    const t6 = p.teams.find((t) => t.teamId === 't6');
    expect(t6 && t6.after > t6.before).toBe(true);
    expect(p.teams.filter((t) => t.teamId !== 't6').every((t) => t.before === t.after)).toBe(true);
    expect(p.top).toHaveLength(10);
    expect(p.top[0]?.after).toBe(1);
  });

  it('commits only changed files, the others byte for byte, version.json with the new fingerprints', async () => {
    const state = await loadRepoState(fake, PHRASE, keys);
    const after = boost(state.input);
    const result = await commitChange(fake, state, after, opts());
    expect(result).not.toBe('unchanged');
    const files = fake.last.files;
    for (const f of ['config', 'adjustments', 'imports'] as const)
      expect(files.get(`data/seasons/demo/${f}.enc.json`)).toBe(state.texts[f]);
    const records = files.get('data/seasons/demo/records.enc.json') as string;
    expect(records).not.toBe(state.texts.records);
    const version = parseVersion(files.get('data/version.json') as string);
    expect(version.files.records).toBe(await fingerprint(records));
    expect(version.files.config).toBe(state.version.files.config);
    if (result !== 'unchanged') expect(version.rev).toBe(result.rev);
    const reread = await loadRepoState(fake, PHRASE, keys);
    expect(reread.input.records).toEqual(after.records);
  });

  it('an unchanged input is not committed', async () => {
    const state = await loadRepoState(fake, PHRASE, keys);
    expect(await commitChange(fake, state, state.input, opts())).toBe('unchanged');
    expect(fake.commits).toHaveLength(1);
  });

  it('a moved branch is a conflict, not an overwrite', async () => {
    const state = await loadRepoState(fake, PHRASE, keys);
    fake.advance();
    await expect(commitChange(fake, state, boost(state.input), opts())).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(fake.commits).toHaveLength(2); // the start and the other admin's only
  });

  it('the commit message carries counts and the login, never a name', async () => {
    const state = await loadRepoState(fake, PHRASE, keys);
    await commitChange(fake, state, boost(state.input), opts());
    expect(fake.last.message).toBe('data(demo): импорт воронки — 1 оператор [by koordinator]');
    const name = state.input.config.managers[0]?.fullName as string;
    const again = await loadRepoState(fake, PHRASE, keys);
    await expect(
      commitChange(fake, again, boost(boost(again.input)), opts(`исправление для ${name}`)),
    ).rejects.toThrow(/имя/);
  });
});
