import type { EngineInput } from '../engine/prepare.ts';
import { KDF_ITERATIONS, encryptJson, fromBase64, newSalt, type KeyCache } from './crypto.ts';
import {
  EnvelopeSchema,
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

export type SealOptions = {
  updatedAt: string;
  iterations?: number;
  keys?: KeyCache;
  /** Base64 salt to keep (the season's salt while the phrase stays): clients keep their key. */
  salt?: string;
  /**
   * Encrypted texts of files that did not change — written as they are, same fingerprints. Only
   * while the phrase stays: they must carry `salt` and the same iterations, or nobody could open
   * the mixed publication.
   */
  reuse?: Partial<Record<SeasonFile, string>>;
};

/**
 * A season's data as the texts of its files in `data/` (path → text): the encrypted files with one
 * salt (D-12) and `version.json` with their fingerprints (D-33). Used by seed-demo and, on stage 2,
 * by the admin's commit, which reuses the unchanged files so viewers fetch only what changed.
 */
export async function sealSeason(
  input: EngineInput,
  phrase: string,
  meta: SealOptions,
): Promise<Map<string, string>> {
  const iterations = meta.iterations ?? KDF_ITERATIONS;
  const reuse = meta.reuse ?? {};
  if (Object.keys(reuse).length > 0) {
    if (meta.salt === undefined) throw new Error('sealSeason: reuse без salt — файлы разошлись бы по ключам');
    for (const [file, text] of Object.entries(reuse)) {
      const envelope = EnvelopeSchema.parse(JSON.parse(text));
      if (envelope.salt !== meta.salt || envelope.iter !== iterations)
        throw new Error(`sealSeason: ${file} зашифрован с другой солью или параметрами ключа`);
    }
  }
  const salt = meta.salt !== undefined ? fromBase64(meta.salt) : newSalt();
  const seasonId = input.config.id;
  const texts = {} as Record<SeasonFile, string>;
  const files = {} as Record<SeasonFile, string>;
  for (const file of SEASON_FILES) {
    const reused = reuse[file];
    if (reused !== undefined) texts[file] = reused;
    else {
      const envelope = await encryptJson(seasonFileValue(file, input[file]), phrase, {
        salt,
        iterations,
        ...(meta.keys !== undefined ? { keys: meta.keys } : {}),
      });
      texts[file] = serialize(envelope);
    }
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
