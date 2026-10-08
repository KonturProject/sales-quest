import type { EngineInput } from '../engine/prepare.ts';
import type { CachedSeason } from './cache.ts';
import { DecryptError, decryptJson, type KeyCache } from './crypto.ts';
import {
  DataError,
  DataVersionError,
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
      const expected = version.files[file];
      let text = await source.read(path, { fingerprint: expected });
      // The browser may hold a copy from another publication under this URL: ask once more past it.
      if ((await fingerprint(text)) !== expected)
        text = await source.read(path, { fingerprint: expected, reload: true });
      if ((await fingerprint(text)) !== expected)
        throw new DataError('сайт обновляется — новые данные подтянутся через пару минут');
      texts[file] = text;
    }),
  );
  const fetched = clock();
  const input = await openSeason(version, texts, phrase, keys, previous);
  return {
    version,
    texts,
    input,
    timings: { fetchMs: fetched - started, decryptMs: clock() - fetched },
  };
}

/**
 * Decrypts and validates the season files; unchanged ones are taken from `previous`. A phrase
 * that opens none of the new files is wrong (`DecryptError`); a file that does not open while the
 * others do is damaged (`DataError`) — the files of a publication share one key (D-12).
 */
export async function openSeason(
  version: Version,
  texts: Record<SeasonFile, string>,
  phrase: string,
  keys: KeyCache,
  previous?: Previous,
): Promise<EngineInput> {
  const reused = (file: SeasonFile) =>
    previous !== undefined && sameFile(previous, version, file) && previous.texts[file] === texts[file];
  const fresh = SEASON_FILES.filter((f) => !reused(f));
  const opened = await Promise.allSettled(
    fresh.map(async (file) => {
      let envelope;
      try {
        envelope = EnvelopeSchema.parse(JSON.parse(texts[file]));
      } catch {
        throw new DataError(`файл данных «${file}» повреждён`);
      }
      return decryptJson(envelope, phrase, keys);
    }),
  );
  const failed = opened.filter((r) => r.status === 'rejected').map((r) => r.reason as unknown);
  const damaged = failed.find((e) => !(e instanceof DecryptError));
  if (damaged !== undefined) throw damaged;
  if (failed.length === SEASON_FILES.length) throw new DecryptError();
  if (failed.length > 0) throw new DataError('файл данных повреждён');
  const values = new Map(
    fresh.map((file, i) => [file, (opened[i] as PromiseFulfilledResult<unknown>).value]),
  );
  const take = <F extends SeasonFile>(file: F): EngineInput[F] =>
    values.has(file)
      ? (parseSeasonFile(file, values.get(file)) as EngineInput[F])
      : (previous as Previous).input[file];
  return {
    config: take('config'),
    records: take('records'),
    adjustments: take('adjustments'),
    imports: take('imports'),
  };
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

/** What a viewer is told when data does not read, though the phrase is right. */
function problemText(e: unknown): string {
  if (e instanceof DataError || e instanceof DataVersionError) return e.message;
  return 'данные на сайте не читаются — посмотрим снова при следующей проверке';
}

/**
 * Loads the season and keeps it fresh (SYNC-1…3): a version check every interval; on a network
 * error the last good data stays with an «offline» notice and the retries slow down ×2 up to
 * five minutes; a phrase that does not decrypt the site's data stops the polling until a new
 * phrase. A stopped sync says nothing more, even if a check was still under way.
 */
export function createSync(deps: SyncDeps): Sync {
  let current: Loaded | null = null;
  let checkedAt: string | null = null;
  let cachedRev: string | null = null;
  let offlineSince: string | null = null;
  let failures = 0;
  let timer: unknown = null;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const emit = (state: SyncState) => {
    if (stopped) return;
    try {
      deps.onState(state);
    } catch (e) {
      // A failing listener must not stop the polling; the viewer reports its own errors.
      console.error(e);
    }
  };
  const interval = () => (current?.input.config.ui.pollIntervalSec ?? deps.intervalSec) * 1000;
  const clearTimer = () => {
    if (timer !== null) deps.timers.clear(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    if (stopped) return;
    clearTimer();
    timer = deps.timers.set(() => void check(), ms);
  };
  const ready = (notice: SyncNotice | null) => {
    if (current) emit({ phase: 'ready', loaded: current, checkedAt, notice });
  };

  async function run(): Promise<void> {
    clearTimer();
    const phrase = deps.phrase();
    if (!phrase) return emit({ phase: 'need-phrase' });
    try {
      const loaded = await loadSeason(deps.source, phrase, deps.keys, current ?? undefined);
      if (stopped) return;
      current = loaded;
      checkedAt = localTimestamp(deps.now());
      offlineSince = null;
      failures = 0;
      if (loaded.version.rev !== cachedRev) {
        deps.cache.write({ version: loaded.version, texts: loaded.texts, savedAt: checkedAt });
        cachedRev = loaded.version.rev;
      }
      ready(null);
      schedule(interval());
    } catch (e) {
      if (stopped) return;
      if (e instanceof DecryptError) return emit({ phase: 'wrong-phrase' });
      if (e instanceof StorageError) {
        failures += 1;
        offlineSince ??= localTimestamp(deps.now());
        if (current) ready({ kind: 'offline', since: offlineSince });
        else emit({ phase: 'error', message: 'нет связи с сайтом игры — пробуем снова' });
        schedule(Math.min(interval() * 2 ** failures, MAX_RETRY_SEC * 1000));
        return;
      }
      // Damaged, mid-deploy or too new data: keep what we have and look again next time.
      if (current) ready({ kind: 'problem', message: problemText(e) });
      else emit({ phase: 'error', message: problemText(e) });
      schedule(interval());
    }
  }

  /** One check at a time: «Обновить» during a check waits for it instead of racing it. */
  function check(): Promise<void> {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async start() {
      stopped = false;
      const phrase = deps.phrase();
      if (!phrase) return emit({ phase: 'need-phrase' });
      emit({ phase: 'loading' });
      // Show the last good data at once; the check below brings it up to date.
      const cached = deps.cache.read();
      if (cached && !current) {
        try {
          const input = await openSeason(cached.version, cached.texts, phrase, deps.keys);
          if (stopped) return;
          current = { ...cached, input, timings: { fetchMs: 0, decryptMs: 0 } };
          checkedAt = cached.savedAt || null;
          cachedRev = cached.version.rev;
          ready(null);
        } catch {
          // A cache under an old phrase (SEC-8) or a damaged one: the site decides (review 1c).
        }
      }
      await check();
    },
    refresh() {
      return check();
    },
    stop() {
      stopped = true;
      clearTimer();
    },
  };
}
