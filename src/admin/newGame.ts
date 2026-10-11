import { seasonDefaults } from '../data/defaults/season.ts';
import { SeasonConfigSchema } from '../data/schemas/season.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { cleanName, namesWithNumbers, normalizeName } from '../import/match.ts';
import type { Parsed, Person } from '../import/parsed.ts';
import { DEFAULT_PROFILES } from '../import/profiles.ts';
import { WORDS } from './words.ts';

/**
 * The «Новая игра» wizard (§10, plan 2a): the teams and operators from the funnel, the norms, the
 * secret phrase — and the season config the launch commit writes. Pure; the screen is `NewGame.tsx`.
 */

/** The demo game of the site until the launch (D-32): its id and its phrase are public. */
export const DEMO_SEASON_ID = 'demo';
export const DEMO_PHRASE = 'sales-quest-demo';
export const MIN_PHRASE_LENGTH = 16;
/**
 * Per working day of an operator (R-2): the first game's, chosen by the author 11.10.2026 — 3 quality
 * invoices, 1.5 talks of 20+ minutes, 1 payment a week: 3 × 1 + 1.5 × 3 + 0.2 × 10 = 9.5 points.
 */
export const DEFAULT_NORMS: Record<string, number> = { inv6: 3, inv20: 1.5, pay: 0.2 };

/** The same norms a week of five working days — how the department thinks of payments. */
export function weeklyNorms(norms: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(norms).map(([k, v]) => [k, Math.round(v * 50) / 10]));
}

export type TeamDraft = {
  /** The group's code in the exports, `СР1` (D-21). */
  code: string;
  leaderName: string;
  color: string;
  characterId: string;
  order: number;
};

export type NewGameDraft = {
  start: string;
  end: string;
  holidays: string[];
  title: string;
  teams: TeamDraft[];
  /** Operators with the group they play for. */
  operators: Person[];
  /** People with numbers in the funnel the admin left out: imports skip them (`importIgnore`). */
  excluded?: Person[];
  /** Per working day, by metric: on everyone and for those an import adds later. */
  norms: Record<string, number>;
};

/**
 * What the funnel tells about the department: its groups and its people — those with any number in
 * the file are ticked, the rest (on leave, fired, a test account) are left for the admin to check.
 */
export function draftFromFunnel(parsed: Parsed): {
  groups: string[];
  active: Person[];
  check: Person[];
} {
  const busy = namesWithNumbers(parsed.rows);
  const seen = new Set<string>();
  const active: Person[] = [];
  const check: Person[] = [];
  for (const p of parsed.people) {
    const norm = normalizeName(p.name);
    if (seen.has(norm)) continue;
    seen.add(norm);
    (busy.has(norm) ? active : check).push({ name: cleanName(p.name), group: p.group });
  }
  return { groups: [...parsed.groups], active, check };
}

/**
 * The season of the draft: id = the first day; teams `team1…` in their order with the group's code
 * (D-21); operators `op001…` team by team, each with the norms and in the team from the first day;
 * the target of a day without norms = the norms in points; the profiles of the department's exports.
 * Records, adjustments and imports start empty. An error in words when the draft does not make a game.
 */
export function buildSeason(d: NewGameDraft): EngineInput {
  const defaults = seasonDefaults();
  if (d.title.trim() === '') throw new Error('у игры нет названия');
  if (d.teams.length === 0) throw new Error('в игре нет команд');
  for (const t of d.teams)
    if (t.leaderName.trim() === '') throw new Error(`команда ${t.code}: не указан руководитель`);
  const teams = [...d.teams].sort((a, b) => a.order - b.order);
  const teamOf = new Map(teams.map((t, i) => [t.code, `team${i + 1}`]));
  const placed = d.operators.map((p) => {
    const teamId = p.group === null ? undefined : teamOf.get(p.group);
    if (teamId === undefined)
      throw new Error(`${cleanName(p.name)}: группы ${p.group ?? '«—»'} нет среди команд игры`);
    return { name: cleanName(p.name), teamId };
  });
  const seen = new Set<string>();
  for (const p of placed) {
    if (seen.has(normalizeName(p.name))) throw new Error(`${p.name} — в списке дважды`);
    seen.add(normalizeName(p.name));
  }
  // Team by team, in the file's order inside a team (`team<N>`: N is the team's place).
  const place = (teamId: string) => Number(teamId.slice('team'.length));
  placed.sort((a, b) => place(a.teamId) - place(b.teamId));

  const weight = new Map(defaults.metrics.map((m) => [m.id, m.weight]));
  const target = Object.entries(d.norms).reduce((s, [m, v]) => s + v * (weight.get(m) ?? 0), 0);
  if (!(target > 0)) throw new Error('нормативы нулевые — у игры не будет цели');

  const parsed = SeasonConfigSchema.safeParse({
    ...defaults,
    id: d.start,
    title: d.title.trim(),
    status: 'active',
    period: { start: d.start, end: d.end },
    holidays: [...new Set(d.holidays)].sort(),
    defaultDailyTargetPoints: Math.round(target * 100) / 100,
    defaultDailyNorms: { ...d.norms },
    teams: teams.map((t, i) => ({
      id: `team${i + 1}`,
      leaderName: t.leaderName.trim(),
      characterId: t.characterId,
      color: t.color,
      sourceCode: t.code,
      order: i + 1,
    })),
    managers: placed.map((p, i) => ({
      id: `op${String(i + 1).padStart(3, '0')}`,
      fullName: p.name,
      aliases: [],
      dailyNorms: { ...d.norms },
      memberships: [{ teamId: p.teamId, from: d.start }],
    })),
    importProfiles: DEFAULT_PROFILES,
    importIgnore: [...new Set((d.excluded ?? []).map((p) => normalizeName(p.name)))],
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`игра не собирается: ${issue?.path.join('.') ?? ''} — ${issue?.message ?? ''}`);
  }
  return { config: parsed.data, records: [], adjustments: [], imports: [] };
}

const randomWords = (n: number) => crypto.getRandomValues(new Uint32Array(n));

/** Four simple words and two digits, `medved-reka-zvezda-kluch-42`: easy to dictate, hard to guess. */
export function generatePhrase(random: (n: number) => Uint32Array = randomWords): string {
  const r = random(5);
  const words = [0, 1, 2, 3].map((i) => WORDS[(r[i] ?? 0) % WORDS.length] as string);
  return [...words, String(10 + ((r[4] ?? 0) % 90))].join('-');
}

/** Why a phrase will not do for the real game, or null (SEC-6, D-32). */
export function phraseProblem(phrase: string): string | null {
  const p = phrase.trim();
  if (p.toLowerCase() === DEMO_PHRASE)
    return 'это фраза демо-игры — она открыта всем, для настоящей игры нужна своя';
  if (p.length < MIN_PHRASE_LENGTH)
    return `фраза короткая: нужно не меньше ${MIN_PHRASE_LENGTH} знаков`;
  return null;
}

/** The link for the department and the one for the office wall screen (SEC-7, PERF-5). */
export function viewerLinks(siteUrl: string, phrase: string): { viewers: string; tv: string } {
  const viewers = `${siteUrl}#/?k=${encodeURIComponent(phrase)}`;
  return { viewers, tv: `${viewers}&mode=tv` };
}
