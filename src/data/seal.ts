import type { EngineInput } from '../engine/prepare.ts';
import { encryptJson, newSalt, type KeyCache } from './crypto.ts';
import {
  SEASON_FILES,
  dataPath,
  fingerprint,
  revOf,
  seasonFileValue,
  serialize,
  type SeasonFile,
  type SeasonSummary,
  type Version,
} from './files.ts';

/**
 * A season's data as the texts of its files in `data/` (path → text): the four encrypted files
 * with one salt (D-12) and `version.json` with their fingerprints (D-33). Used by seed-demo and,
 * on stage 2, by the admin's commit.
 */
export async function sealSeason(
  input: EngineInput,
  phrase: string,
  meta: { updatedAt: string; iterations?: number; keys?: KeyCache },
): Promise<Map<string, string>> {
  const salt = newSalt();
  const seasonId = input.config.id;
  const texts = {} as Record<SeasonFile, string>;
  const files = {} as Record<SeasonFile, string>;
  for (const file of SEASON_FILES) {
    const envelope = await encryptJson(seasonFileValue(file, input[file]), phrase, {
      salt,
      ...(meta.iterations !== undefined ? { iterations: meta.iterations } : {}),
      ...(meta.keys !== undefined ? { keys: meta.keys } : {}),
    });
    texts[file] = serialize(envelope);
    files[file] = await fingerprint(texts[file]);
  }
  const version: Version = {
    schemaVersion: 1,
    rev: await revOf(files),
    seasonId,
    updatedAt: meta.updatedAt,
    lastImportAt: latestImport(input),
    files,
  };
  const out = new Map(SEASON_FILES.map((f) => [dataPath.season(seasonId, f), texts[f]]));
  out.set(dataPath.version, serialize(version));
  return out;
}

export function seasonIndexText(seasons: SeasonSummary[]): string {
  return serialize({ schemaVersion: 1, seasons });
}

function latestImport(input: EngineInput): string | null {
  let latest: string | null = null;
  for (const i of input.imports)
    if (latest === null || Date.parse(i.at) > Date.parse(latest)) latest = i.at;
  return latest;
}
