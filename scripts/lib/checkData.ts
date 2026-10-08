import {
  EnvelopeSchema,
  SEASON_FILES,
  dataPath,
  fingerprint,
  parseIndex,
  parseVersion,
  revOf,
  type SeasonFile,
} from '../../src/data/files.ts';
import { findViolations } from './precommit.ts';

/** Published data must not be cheaper to brute-force than SEC-6 allows. */
export const MIN_KDF_ITERATIONS = 100_000;

const SEASON_FILE =
  /^seasons\/([A-Za-z0-9_-]{1,64})\/(config|records|adjustments|imports)\.enc\.json$/;

/**
 * Checks the published data tree by content, not by name (D-34): every path is one of the known
 * files, every `*.enc.json` is an encryption envelope, the open files follow their schemas and
 * `version.json` matches the files it fingerprints. `files`: path inside `data/` → text.
 */
export async function checkDataTree(files: Map<string, string>): Promise<string[]> {
  const problems: string[] = [];
  const problem = (path: string, text: string) => problems.push(`data/${path}: ${text}`);
  if (files.size === 0) return problems;

  for (const [path, text] of files) {
    if (path === dataPath.version || path === dataPath.index) continue;
    if (!SEASON_FILE.test(path)) {
      problem(
        path,
        'лишний файл: в data/ лежат только version.json, seasons/index.json и *.enc.json игр',
      );
      continue;
    }
    const envelope = EnvelopeSchema.safeParse(safeJson(text));
    if (!envelope.success)
      problem(path, 'не шифр-конверт {v, alg, kdf, iter, salt, iv, ciphertext} (SEC-6)');
    else if (envelope.data.iter < MIN_KDF_ITERATIONS)
      problem(
        path,
        `ключ выводится за ${envelope.data.iter} итераций, нужно не меньше ${MIN_KDF_ITERATIONS}`,
      );
  }

  const versionText = files.get(dataPath.version);
  if (versionText === undefined) {
    problem(dataPath.version, 'нет файла, а данные есть');
    return problems;
  }
  try {
    const version = parseVersion(versionText);
    const actual = {} as Record<SeasonFile, string>;
    for (const file of SEASON_FILES) {
      const path = dataPath.season(version.seasonId, file);
      const text = files.get(path);
      if (text === undefined) {
        problem(path, `нет файла игры ${version.seasonId}, на которую указывает version.json`);
        continue;
      }
      actual[file] = await fingerprint(text);
      if (actual[file] !== version.files[file])
        problem(path, 'отпечаток не совпадает с version.json — файлы записаны не вместе');
    }
    if (version.rev !== (await revOf(version.files)))
      problem(dataPath.version, 'rev не совпадает с отпечатками файлов');
  } catch (e) {
    problem(dataPath.version, `не читается: ${message(e)}`);
  }

  const indexText = files.get(dataPath.index);
  if (indexText === undefined) problem(dataPath.index, 'нет списка игр');
  else
    try {
      for (const season of parseIndex(indexText).seasons)
        if (!files.has(dataPath.season(season.id, 'config')))
          problem(dataPath.index, `игра ${season.id} в списке, но её файлов нет`);
    } catch (e) {
      problem(dataPath.index, `не читается: ${message(e)}`);
    }
  return problems;
}

/**
 * The pre-commit rules over every tracked file (D-34): catches what the hook could not see —
 * `--no-verify`, clones without hooks, commits through the GitHub API. `text` is null for binaries.
 */
export function scanTrackedFiles(files: { path: string; text: string | null }[]): string[] {
  return findViolations(
    files.map((f) => f.path),
    files.flatMap((f) =>
      f.text === null ? [] : [{ path: f.path, addedLines: f.text.split('\n') }],
    ),
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function message(e: unknown): string {
  return e instanceof Error ? (e.message.split('\n')[0] ?? e.name) : String(e);
}
