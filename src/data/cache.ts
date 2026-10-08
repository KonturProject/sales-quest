import { SEASON_FILES, VersionSchema, type SeasonFile, type Version } from './files.ts';

/**
 * The viewer's browser storage (SEC-7, SYNC-3). Every access is in try/catch: storage can be
 * missing or blocked (private windows, policies), and the game must still work without it.
 */

const PHRASE_KEY = 'sq.phrase';
const CACHE_KEY = 'sq.cache.v1';

/** The last good season files, still encrypted (D-33). */
export type CachedSeason = { version: Version; texts: Record<SeasonFile, string>; savedAt: string };

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readPhrase(): string | null {
  try {
    return storage()?.getItem(PHRASE_KEY) || null;
  } catch {
    return null;
  }
}

export function writePhrase(phrase: string): void {
  try {
    storage()?.setItem(PHRASE_KEY, phrase);
  } catch {
    // Without storage the phrase lives for this page only.
  }
}

export function forgetPhrase(): void {
  try {
    storage()?.removeItem(PHRASE_KEY);
  } catch {
    // nothing to forget
  }
}

export const browserCache = {
  read(): CachedSeason | null {
    try {
      const raw = storage()?.getItem(CACHE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<CachedSeason>;
      const version = VersionSchema.parse(value.version);
      const texts = value.texts ?? ({} as Record<SeasonFile, string>);
      if (!SEASON_FILES.every((f) => typeof texts[f] === 'string')) return null;
      return { version, texts, savedAt: String(value.savedAt ?? '') };
    } catch {
      return null;
    }
  },
  write(cached: CachedSeason): void {
    try {
      storage()?.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch {
      // A full or blocked storage only costs the offline fallback.
    }
  },
};
