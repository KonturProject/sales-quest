import type { KeyCache } from '../data/crypto.ts';
import {
  DataError,
  EnvelopeSchema,
  SEASON_FILES,
  dataPath,
  parseIndex,
  parseVersion,
  seasonFileValue,
  serialize,
  type SeasonFile,
  type Version,
} from '../data/files.ts';
import { sealSeason, seasonIndexText } from '../data/seal.ts';
import { openSeason } from '../data/sync.ts';
import { computeGameState } from '../engine/gameState.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { dayMonth } from '../import/grid.ts';
import { plural } from '../text.ts';
import type { GitHubRepo } from './github.ts';
import { DEMO_SEASON_ID, phraseProblem } from './newGame.ts';

/**
 * One path for every change of the admin (§8): read the season at the head of `main` → the change
 * (a pure function of the caller) → the preview «было → станет» → one commit of the changed files
 * on the commit that was read (SEC-4, ADM-2) → the publication.
 */

/** A path of `data/` inside the repository. */
const repoPath = (path: string) => `data/${path}`;

export type RepoState = {
  /** The commit everything was read at: the base of the next commit. */
  head: string;
  version: Version;
  texts: Record<SeasonFile, string>;
  /** `seasons/index.json` as it is (empty when missing). */
  index: string;
  input: EngineInput;
};

/** The current season straight from GitHub — the site lags 1–2 minutes behind (SYNC-4). */
export async function loadRepoState(
  repo: GitHubRepo,
  phrase: string,
  keys: KeyCache,
): Promise<RepoState> {
  const head = await repo.head();
  const versionText = await repo.read(repoPath(dataPath.version), head);
  if (versionText === null) throw new DataError('в репозитории нет данных игры');
  const version = parseVersion(versionText);
  const texts = {} as Record<SeasonFile, string>;
  for (const file of SEASON_FILES) {
    const text = await repo.read(repoPath(dataPath.season(version.seasonId, file)), head);
    if (text === null) throw new DataError(`в репозитории нет файла игры «${file}»`);
    texts[file] = text;
  }
  const index = (await repo.read(repoPath(dataPath.index), head)) ?? '';
  const input = await openSeason(version, texts, phrase, keys);
  return { head, version, texts, index, input };
}

export type Preview = {
  teams: { teamId: string; leaderName: string; before: number; after: number }[];
  /** The top 10 after the change, with their places before (null — not ranked before). */
  top: { managerId: string; name: string; before: number | null; after: number }[];
};

/** «Было → станет» (ADM-PREVIEW): the teams' positions and the top 10 operators. */
export function previewChange(before: EngineInput, after: EngineInput, now: string): Preview {
  const a = computeGameState(before, now);
  const b = computeGameState(after, now);
  const was = new Map(a.teams.map((t) => [t.teamId, t.position]));
  const leaders = new Map(after.config.teams.map((t) => [t.id, t.leaderName]));
  const placeBefore = new Map(a.managers.map((m) => [m.managerId, m.rank]));
  return {
    teams: [...after.config.teams]
      .sort((x, y) => x.order - y.order)
      .flatMap((team) => {
        const t = b.teams.find((s) => s.teamId === team.id);
        return t
          ? [
              {
                teamId: team.id,
                leaderName: leaders.get(team.id) ?? team.id,
                before: was.get(team.id) ?? 0,
                after: t.position,
              },
            ]
          : [];
      }),
    top: b.managers
      .filter((m) => m.rank !== null)
      .sort((x, y) => (x.rank as number) - (y.rank as number))
      .slice(0, 10)
      .map((m) => ({
        managerId: m.managerId,
        name: m.fullName,
        before: placeBefore.get(m.managerId) ?? null,
        after: m.rank as number,
      })),
  };
}

/** A name of the game in a public commit message would publish it (the repository is public). */
function nameIn(message: string, input: EngineInput): boolean {
  const names = [
    ...input.config.managers.flatMap((m) => [m.fullName, ...m.aliases]),
    ...input.config.teams.map((t) => t.leaderName),
  ];
  return names.some((n) => n.trim().length > 0 && message.includes(n.trim()));
}

/**
 * The change committed: only the season files that differ are sealed anew — the others keep their
 * bytes, so viewers fetch only what changed (D-33) — with the season's salt and iterations, plus
 * `version.json`. An input equal to the current one is not committed. `ConflictError` when `main`
 * moved since `state` was read.
 */
export async function commitChange(
  repo: GitHubRepo,
  state: RepoState,
  after: EngineInput,
  opts: { phrase: string; keys: KeyCache; message: string; by: string; now: string },
): Promise<{ commit: string; rev: string } | 'unchanged'> {
  if (nameIn(opts.message, after) || nameIn(opts.message, state.input))
    throw new Error('в подписи коммита — имя: подпись публична, в ней только счётчики');
  const text = (file: SeasonFile, input: EngineInput) =>
    serialize(seasonFileValue(file, input[file]));
  const changed = SEASON_FILES.filter((f) => text(f, after) !== text(f, state.input));
  if (changed.length === 0) return 'unchanged';

  const envelope = EnvelopeSchema.parse(JSON.parse(state.texts.config));
  const reuse = Object.fromEntries(
    SEASON_FILES.filter((f) => !changed.includes(f)).map((f) => [f, state.texts[f]]),
  ) as Partial<Record<SeasonFile, string>>;
  const sealed = await sealSeason(after, opts.phrase, {
    updatedAt: opts.now,
    salt: envelope.salt,
    iterations: envelope.iter,
    keys: opts.keys,
    reuse,
  });
  const changes = new Map<string, string | null>();
  for (const file of changed) {
    const path = dataPath.season(after.config.id, file);
    changes.set(repoPath(path), sealed.get(path) as string);
  }
  const versionText = sealed.get(dataPath.version) as string;
  changes.set(repoPath(dataPath.version), versionText);
  const commit = await repo.commit(
    state.head,
    changes,
    `data(${after.config.id}): ${opts.message} [by ${opts.by}]`,
  );
  return { commit, rev: parseVersion(versionText).rev };
}

/**
 * The launch of a new game (plan 2a): its four files sealed with a fresh salt under the new phrase,
 * `version.json` pointing at it and the index listing it — one commit on the commit `state` was read
 * at. The demo goes away whole; a real game that has ended stays, `closed` in the index (its files
 * and its phrase as they were); over a game that runs — refused. The title is public, like the
 * message: no names in it.
 */
export async function launchChange(
  repo: GitHubRepo,
  state: RepoState,
  input: EngineInput,
  opts: { phrase: string; by: string; now: string },
): Promise<{ commit: string; rev: string }> {
  const current = state.input.config;
  const next = input.config;
  const isDemo = current.id === DEMO_SEASON_ID;
  if (!isDemo && current.status === 'active' && opts.now.slice(0, 10) <= current.period.end)
    throw new Error(
      `идёт игра «${current.title}» до ${dayMonth(current.period.end)} — новую можно создать после её конца`,
    );
  const problem = phraseProblem(opts.phrase);
  if (problem !== null) throw new Error(problem);
  if (nameIn(next.title, input) || nameIn(next.title, state.input))
    throw new Error('в названии игры — имя: название видно всем, в нём только даты или номер');
  const index = state.index.trim() === '' ? [] : parseIndex(state.index).seasons;
  if (next.id === current.id || index.some((s) => s.id === next.id))
    throw new Error(
      `игра с началом ${dayMonth(next.period.start)} уже есть — выберите другие даты`,
    );

  const changes = new Map<string, string | null>();
  for (const [path, text] of await sealSeason(input, opts.phrase, { updatedAt: opts.now }))
    changes.set(repoPath(path), text);
  if (isDemo)
    for (const file of SEASON_FILES)
      changes.set(repoPath(dataPath.season(DEMO_SEASON_ID, file)), null);
  const seasons = index
    .filter((s) => s.id !== DEMO_SEASON_ID)
    .map((s) => (s.status === 'active' ? { ...s, status: 'closed' as const } : s));
  seasons.push({ id: next.id, title: next.title, status: 'active', period: next.period });
  changes.set(repoPath(dataPath.index), seasonIndexText(seasons));

  const teams = next.teams.length;
  const people = next.managers.length;
  const message =
    `новая игра ${dayMonth(next.period.start)}–${dayMonth(next.period.end)}, ` +
    `${teams} ${plural(teams, 'команда', 'команды', 'команд')}, ` +
    `${people} ${plural(people, 'оператор', 'оператора', 'операторов')}`;
  const commit = await repo.commit(
    state.head,
    changes,
    `data(${next.id}): ${message} [by ${opts.by}]`,
  );
  return { commit, rev: parseVersion(changes.get(repoPath(dataPath.version)) as string).rev };
}
