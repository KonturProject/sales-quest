import type { EngineInput } from '../engine/prepare.ts';
import type { CachedSeason } from './cache.ts';
import { DecryptError, decryptJson, type KeyCache } from './crypto.ts';
import {
  EnvelopeSchema,
  SEASON_FILES,
  dataPath,
  fingerprint,
  parseSeasonFile,
  parseVersion,
  type SeasonFile,
  type Version,
} from './files.ts';
import { StorageError, type DataSource } from './storage.ts';
import { localTimestamp } from './time.ts';

/** A season as loaded: its version, the encrypted texts (for the cache) and the engine input. */
export type Loaded = {
  version: Version;
  texts: Record<SeasonFile, string>;
  input: EngineInput;
  timings: { fetchMs: number; decryptMs: number };
};

type Previous = Pick<Loaded, 'version' | 'texts' | 'input'>;

const sameFile = (a: Previous | undefined, version: Version, file: SeasonFile) =>
  a !== undefined &&
  a.version.seasonId === version.seasonId &&
  a.version.files[file] === version.files[file];

/**
 * Reads `version.json` past every cache, then only the season files whose fingerprints changed
 * since `previous` (D-33), checks them against the fingerprints and decrypts them.
 */
export async function loadSeason(
  source: DataSource,
  phrase: string,
  keys: KeyCache,
  previous?: Previous,
  clock: () => number = () => performance.now(),
): Promise<Loaded> {
  const started = clock();
  const version = parseVersion(await source.read(dataPath.version, { fresh: true }));
  const texts = {} as Record<SeasonFile, string>;
  await Promise.all(
    SEASON_FILES.map(async (file) => {
      if (previous && sameFile(previous, version, file)) {
        texts[file] = previous.texts[file];
        return;
      }
      const path = dataPath.season(version.seasonId, file);
      const text = await source.read(path, { fingerprint: version.files[file] });
      // A file from another publication (the site is mid-deploy): try again later.
      if ((await fingerprint(text)) !== version.files[file])
        throw new StorageError(path, null, `${path}: файл не совпал с version.json`);
      texts[file] = text;
    }),
  );
  const fetched = clock();
  const input = await openSeason(version, texts, phrase, keys, previous);
  return { version, texts, input, timings: { fetchMs: fetched - started, decryptMs: clock() - fetched } };
}

/** Decrypts and validates the season files; unchanged ones are taken from `previous`. */
export async function openSeason(
  version: Version,
  texts: Record<SeasonFile, string>,
  phrase: string,
  keys: KeyCache,
  previous?: Previous,
): Promise<EngineInput> {
  const open = async <F extends SeasonFile>(file: F): Promise<EngineInput[F]> => {
    if (previous && sameFile(previous, version, file) && previous.texts[file] === texts[file])
      return previous.input[file];
    let envelope;
    try {
      envelope = EnvelopeSchema.parse(JSON.parse(texts[file]));
    } catch {
      throw new DecryptError();
    }
    return parseSeasonFile(file, await decryptJson(envelope, phrase, keys)) as EngineInput[F];
  };
  const [config, records, adjustments, imports] = await Promise.all([
    open('config'),
    open('records'),
    open('adjustments'),
    open('imports'),
  ]);
  return { config, records, adjustments, imports };
}

export type SyncNotice = { kind: 'offline'; since: string } | { kind: 'problem'; message: string };

export type SyncState =
  | { phase: 'need-phrase' }
  | { phase: 'loading' }
  | { phase: 'wrong-phrase' }
  | { phase: 'error'; message: string }
  /** `checkedAt` — the last successful check of the site (FR-LB-4); `notice` — why it is stale. */
  | { phase: 'ready'; loaded: Loaded; checkedAt: string | null; notice: SyncNotice | null };

export type SyncDeps = {
  source: DataSource;
  phrase: () => string | null;
  cache: { read(): CachedSeason | null; write(cached: CachedSeason): void };
  keys: KeyCache;
  /** Until the config says otherwise (`ui.pollIntervalSec`). */
  intervalSec: number;
  timers: { set(run: () => void, ms: number): unknown; clear(id: unknown): void };
  now: () => Date;
  onState: (state: SyncState) => void;
};

export type Sync = { start(): Promise<void>; refresh(): Promise<void>; stop(): void };

/** Longest pause between retries while the site does not answer (SYNC-3). */
export const MAX_RETRY_SEC = 300;

/**
 * Loads the season and keeps it fresh (SYNC-1…3): a version check every interval; on a network
 * error the last good data stays with an «offline» notice and the retries slow down ×2 up to
 * five minutes; a phrase that does not decrypt stops the polling until a new phrase.
 */
export function createSync(deps: SyncDeps): Sync {
  let current: Loaded | null = null;
  let checkedAt: string | null = null;
  let offlineSince: string | null = null;
  let failures = 0;
  let timer: unknown = null;
  let stopped = false;

  const interval = () => (current?.input.config.ui.pollIntervalSec ?? deps.intervalSec) * 1000;
  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer !== null) deps.timers.clear(timer);
    timer = deps.timers.set(() => void check(), ms);
  };
  const ready = (notice: SyncNotice | null) => {
    if (current) deps.onState({ phase: 'ready', loaded: current, checkedAt, notice });
  };

  async function check(): Promise<void> {
    timer = null;
    const phrase = deps.phrase();
    if (!phrase) return deps.onState({ phase: 'need-phrase' });
    try {
      current = await loadSeason(deps.source, phrase, deps.keys, current ?? undefined);
      checkedAt = localTimestamp(deps.now());
      offlineSince = null;
      failures = 0;
      deps.cache.write({ version: current.version, texts: current.texts, savedAt: checkedAt });
      ready(null);
      schedule(interval());
    } catch (e) {
      if (e instanceof DecryptError) return deps.onState({ phase: 'wrong-phrase' });
      if (e instanceof StorageError) {
        failures += 1;
        offlineSince ??= localTimestamp(deps.now());
        if (current) ready({ kind: 'offline', since: offlineSince });
        else deps.onState({ phase: 'error', message: 'нет связи с сайтом игры — пробуем снова' });
        schedule(Math.min(interval() * 2 ** failures, MAX_RETRY_SEC * 1000));
        return;
      }
      // Broken or too new data: keep what we have and look again at the next check.
      const message = e instanceof Error ? e.message : String(e);
      if (current) ready({ kind: 'problem', message });
      else deps.onState({ phase: 'error', message });
      schedule(interval());
    }
  }

  return {
    async start() {
      stopped = false;
      const phrase = deps.phrase();
      if (!phrase) return deps.onState({ phase: 'need-phrase' });
      deps.onState({ phase: 'loading' });
      // Show the last good data at once; the check below brings it up to date.
      const cached = deps.cache.read();
      if (cached && !current) {
        try {
          const input = await openSeason(cached.version, cached.texts, phrase, deps.keys);
          current = { ...cached, input, timings: { fetchMs: 0, decryptMs: 0 } };
          checkedAt = cached.savedAt || null;
          ready(null);
        } catch (e) {
          if (e instanceof DecryptError) return deps.onState({ phase: 'wrong-phrase' });
          // An unreadable cache is no reason to stop: the site has the data.
        }
      }
      await check();
    },
    refresh() {
      if (timer !== null) deps.timers.clear(timer);
      return check();
    },
    stop() {
      stopped = true;
      if (timer !== null) deps.timers.clear(timer);
      timer = null;
    },
  };
}
