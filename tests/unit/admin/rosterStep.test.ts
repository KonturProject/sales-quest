import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import { commitChange, loadRepoState, type RepoState } from '../../../src/admin/pipeline.ts';
import type { RosterEdit } from '../../../src/admin/roster.ts';
import { gameDay, prepareRoster, withEdit, withoutEdit } from '../../../src/admin/rosterStep.ts';
import { FakeGitHubRepo } from '../../support/fakeGitHub.ts';

const DEMO = 'sales-quest-demo';
let state: RepoState;
beforeAll(async () => {
  state = await loadRepoState(FakeGitHubRepo.fromDir(DEMO_DATA), DEMO, new Map());
});
const now = (day: string) => `${day}T12:00:00+03:00`;

describe('a roster batch from the screen to a commit (plan 2b-1)', () => {
  it('previews the people of each team on the day and writes a message of counts', () => {
    const { start } = state.input.config.period;
    const first = state.input.config.managers.find((m) => m.memberships[0]?.teamId === 't1');
    if (!first) throw new Error('в демо нет команды t1');
    const step = prepareRoster(state, [{ kind: 'fire', managerId: first.id, date: start }], {
      today: start,
      now: now(start),
    });
    const t1 = step.people.find((p) => p.teamId === 't1');
    expect(t1 && t1.before - t1.after).toBe(1);
    expect(step.people.filter((p) => p.before !== p.after)).toHaveLength(1);
    expect(step.preview.teams).toHaveLength(6);
    expect(step.message).toBe('состав: 1 увольнение');
    expect(step.state).toBe(state);
  });

  it('today before the start counts people on the first day; after the end, on the last', () => {
    const { start, end } = state.input.config.period;
    expect(gameDay(state.input.config, '2026-01-01')).toBe(start);
    expect(gameDay(state.input.config, '2030-01-01')).toBe(end);
  });

  it('a new order replaces the previous one in the batch', () => {
    const a: RosterEdit = { kind: 'order', teamIds: ['t2', 't1', 't3', 't4', 't5', 't6'] };
    const b: RosterEdit = { kind: 'order', teamIds: ['t3', 't1', 't2', 't4', 't5', 't6'] };
    const fire: RosterEdit = { kind: 'fire', managerId: 'm01', date: '2026-10-12' };
    expect(withEdit(withEdit([a, fire], b), fire)).toEqual([fire, b, fire]);
  });

  it('removing a new operator removes the edits that refer to him', () => {
    const add: RosterEdit = {
      kind: 'add',
      ref: 'new-1',
      name: 'Аа Аа',
      teamId: 't1',
      from: '2026-10-12',
      norms: {},
    };
    const rename: RosterEdit = { kind: 'rename', managerId: 'new-1', name: 'Аа Бб' };
    const other: RosterEdit = { kind: 'fire', managerId: 'm02', date: '2026-10-12' };
    expect(withoutEdit([add, rename, other], 0)).toEqual([other]);
    expect(withoutEdit([add, rename, other], 1)).toEqual([add, other]);
  });

  it('the commit carries the config only — the import log untouched', async () => {
    const own = FakeGitHubRepo.fromDir(DEMO_DATA);
    const s = await loadRepoState(own, DEMO, new Map());
    const day = s.input.config.period.start;
    const step = prepareRoster(s, [{ kind: 'team', teamId: 't4', color: '#123456' }], {
      today: day,
      now: now(day),
    });
    await commitChange(own, step.state, step.input, {
      phrase: DEMO,
      keys: new Map(),
      message: step.message,
      by: 'k',
      now: now(day),
    });
    const before = own.commits[0]?.files ?? new Map<string, string>();
    const changed = [...own.last.files].filter(([p, t]) => before.get(p) !== t).map(([p]) => p);
    expect(changed.sort()).toEqual(['data/seasons/demo/config.enc.json', 'data/version.json']);
  });
});
