import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATA } from '../../../scripts/lib/dataDirs.ts';
import {
  buildSeason,
  draftFromFunnel,
  generatePhrase,
  phraseProblem,
  viewerLinks,
  type NewGameDraft,
} from '../../../src/admin/newGame.ts';
import { launchChange, loadRepoState } from '../../../src/admin/pipeline.ts';
import { DecryptError } from '../../../src/data/crypto.ts';
import { starterAchievements } from '../../../src/data/defaults/achievements.ts';
import { parseIndex } from '../../../src/data/files.ts';
import { SeasonConfigSchema } from '../../../src/data/schemas/season.ts';
import type { Parsed } from '../../../src/import/parsed.ts';
import { DEFAULT_PROFILES } from '../../../src/import/profiles.ts';
import { parseWorkbook } from '../../../src/import/xlsx.ts';
import { FakeGitHubRepo } from '../../support/fakeGitHub.ts';

const DEMO_PHRASE = 'sales-quest-demo';
const PHRASE = 'medved-reka-zvezda-kluch-42';
let funnel: Parsed;
beforeAll(() => {
  const bytes = readFileSync('tests/fixtures/import/funnel.xlsx');
  funnel = parseWorkbook(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    DEFAULT_PROFILES,
  ).parsed;
});

function draft(): NewGameDraft {
  const { groups, active } = draftFromFunnel(funnel);
  return {
    start: '2026-10-19',
    end: '2026-11-01',
    holidays: [],
    title: 'Игра 19.10–01.11',
    teams: groups.map((code, i) => ({
      code,
      leaderName: `Руководитель ${i + 1}`,
      color: '#E4572E',
      characterId: 'knight',
      order: i + 1,
    })),
    operators: active,
    norms: { inv6: 2.5, inv20: 1, pay: 0.2 },
  };
}

describe('the «Новая игра» wizard (§10, D-24, D-32, OQ-14)', () => {
  it('groups of the funnel become teams; people with activity are ticked, the rest to check', () => {
    const d = draftFromFunnel(funnel);
    expect(d.groups).toEqual(['СР1', 'СР2', 'СР3', 'СР4', 'СР5', 'СР6']);
    expect(d.active.map((p) => p.name)).toContain('Новикова Фёкла');
    expect(d.active.map((p) => p.name)).not.toContain('Тестов Тест');
    expect(d.check).toEqual([{ name: 'Тестов Тест', group: 'СР1' }]);
  });

  it("builds a valid season: ids team1…, sourceCode СР<n>, norms on everyone and as the default, the demo's metrics, achievements and profiles", () => {
    const d = draft();
    const { config, records, adjustments, imports } = buildSeason(d);
    expect(() => SeasonConfigSchema.parse(config)).not.toThrow();
    expect(config.id).toBe('2026-10-19');
    expect(config.status).toBe('active');
    expect(config.teams.map((t) => [t.id, t.sourceCode])).toEqual(
      d.teams.map((t, i) => [`team${i + 1}`, t.code]),
    );
    expect(config.managers).toHaveLength(d.operators.length);
    expect(config.managers[0]).toMatchObject({
      id: 'op001',
      dailyNorms: d.norms,
      memberships: [{ teamId: 'team1', from: '2026-10-19' }],
    });
    // As the exports write people: single spaces in the roster.
    expect(config.managers.some((m) => m.fullName.includes('  '))).toBe(false);
    expect(config.defaultDailyNorms).toEqual(d.norms);
    expect(config.importProfiles).toEqual(DEFAULT_PROFILES);
    expect(config.achievements).toEqual(starterAchievements);
    expect(config.metrics.map((m) => m.id)).toEqual(['inv6', 'inv20', 'pay']);
    expect([records, adjustments, imports]).toEqual([[], [], []]);
  });

  it('says in words what the draft lacks: a leader, the title, a team of a person, the norms', () => {
    const d = draft();
    const noLeader = {
      ...d,
      teams: d.teams.map((t, i) => (i === 1 ? { ...t, leaderName: ' ' } : t)),
    };
    expect(() => buildSeason(noLeader)).toThrow('команда СР2: не указан руководитель');
    expect(() => buildSeason({ ...d, title: '  ' })).toThrow('у игры нет названия');
    expect(() => buildSeason({ ...d, teams: d.teams.slice(1) })).toThrow(
      /группы СР1 нет среди команд/,
    );
    expect(() => buildSeason({ ...d, teams: [], operators: [] })).toThrow('в игре нет команд');
    expect(() => buildSeason({ ...d, norms: { inv6: 0, inv20: 0, pay: 0 } })).toThrow(
      /нормативы нулевые/,
    );
    expect(() => buildSeason({ ...d, end: '2026-10-01' })).toThrow(/конец периода раньше начала/);
  });

  it('a phrase: random, long enough, never the demo one', () => {
    expect(phraseProblem(DEMO_PHRASE)).toMatch(/демо/);
    expect(phraseProblem('  Sales-Quest-Demo ')).toMatch(/демо/);
    expect(phraseProblem('short')).toMatch(/короткая/);
    expect(phraseProblem(PHRASE)).toBeNull();
    let n = 0;
    const fixed = (size: number) => Uint32Array.from({ length: size }, () => (n += 7));
    expect(generatePhrase(fixed)).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d\d$/);
    expect(generatePhrase()).not.toBe(generatePhrase());
    expect(phraseProblem(generatePhrase())).toBeNull();
  });

  it('gives the link for the department and the one for the wall screen', () => {
    expect(viewerLinks('https://site.example/sales-quest/', 'a b-1')).toEqual({
      viewers: 'https://site.example/sales-quest/#/?k=a%20b-1',
      tv: 'https://site.example/sales-quest/#/?k=a%20b-1&mode=tv',
    });
  });
});

describe('the launch commit (plan 2a)', () => {
  it('writes the season, points version and index at it, removes the demo', async () => {
    const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
    const state = await loadRepoState(fake, DEMO_PHRASE, new Map());
    const input = buildSeason(draft());
    await launchChange(fake, state, input, {
      phrase: PHRASE,
      by: 'koordinator',
      now: '2026-10-16T18:00:00+03:00',
    });
    const files = [...fake.last.files.keys()];
    expect(files.filter((f) => f.includes('/demo/'))).toEqual([]);
    expect(files.filter((f) => f.includes('/2026-10-19/'))).toHaveLength(4);
    expect(parseIndex(fake.last.files.get('data/seasons/index.json') as string).seasons).toEqual([
      {
        id: '2026-10-19',
        title: 'Игра 19.10–01.11',
        status: 'active',
        period: { start: '2026-10-19', end: '2026-11-01' },
      },
    ]);
    const opened = await loadRepoState(fake, PHRASE, new Map());
    expect(opened.input.config.managers).toHaveLength(input.config.managers.length);
    await expect(loadRepoState(fake, DEMO_PHRASE, new Map())).rejects.toBeInstanceOf(DecryptError);
    expect(fake.last.message).toBe(
      `data(2026-10-19): новая игра 19.10–01.11, 6 команд, ${input.config.managers.length} операторов [by koordinator]`,
    );
  });

  it('never over a game that runs; an ended game stays, closed', async () => {
    const fake = FakeGitHubRepo.fromDir(DEMO_DATA);
    const demo = await loadRepoState(fake, DEMO_PHRASE, new Map());
    const first = buildSeason(draft());
    await launchChange(fake, demo, first, {
      phrase: PHRASE,
      by: 'k',
      now: '2026-10-16T18:00:00+03:00',
    });
    const running = await loadRepoState(fake, PHRASE, new Map());
    const next = buildSeason({
      ...draft(),
      start: '2026-11-02',
      end: '2026-11-15',
      title: 'Игра 2',
    });
    await expect(
      launchChange(fake, running, next, {
        phrase: PHRASE,
        by: 'k',
        now: '2026-10-28T18:00:00+03:00',
      }),
    ).rejects.toThrow(/идёт/);
    await launchChange(fake, running, next, {
      phrase: PHRASE,
      by: 'k',
      now: '2026-11-02T08:00:00+03:00',
    });
    const index = parseIndex(fake.last.files.get('data/seasons/index.json') as string).seasons;
    expect(index.map((s) => [s.id, s.status])).toEqual([
      ['2026-10-19', 'closed'],
      ['2026-11-02', 'active'],
    ]);
    expect([...fake.last.files.keys()].filter((f) => f.includes('/2026-10-19/'))).toHaveLength(4);
  });
});
