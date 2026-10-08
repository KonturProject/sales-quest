import { beforeAll, describe, expect, it } from 'vitest';
import type { CachedSeason } from '../../../src/data/cache.ts';
import { DecryptError, type KeyCache } from '../../../src/data/crypto.ts';
import { sealSeason } from '../../../src/data/seal.ts';
import { MemorySource, StorageError, type DataSource } from '../../../src/data/storage.ts';
import { createSync, loadSeason, type SyncState } from '../../../src/data/sync.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { at, daily, makeConfig, manager } from '../../support/builders.ts';

const PHRASE = 'фраза';
const base: EngineInput = {
  config: makeConfig({ managers: [manager('a', 't1'), manager('b', 't2')] }),
  records: [daily('a', '2026-10-06', { pay: 1 })],
  adjustments: [],
  imports: [],
};
const seal = (input: EngineInput, updatedAt = at('2026-10-08')) =>
  sealSeason(input, PHRASE, { updatedAt, iterations: 1000 });

let first: Map<string, string>;
let second: Map<string, string>; // only records changed, the other files kept as they were
beforeAll(async () => {
  first = await seal(base);
  const file = (name: string) => first.get(`seasons/test-season/${name}.enc.json`) ?? '';
  const salt = (JSON.parse(file('config')) as { salt: string }).salt;
  const records = [...base.records, daily('b', '2026-10-07', { pay: 2 })];
  second = await sealSeason({ ...base, records }, PHRASE, {
    updatedAt: at('2026-10-08', '15:00'),
    iterations: 1000,
    salt,
    reuse: { config: file('config'), adjustments: file('adjustments'), imports: file('imports') },
  });
});

describe('loadSeason', () => {
  it('loads and decrypts a season', async () => {
    const loaded = await loadSeason(new MemorySource(first), PHRASE, new Map());
    expect(loaded.input).toEqual(base);
    expect(loaded.version.seasonId).toBe('test-season');
  });

  it('reads only the files whose fingerprints changed', async () => {
    const keys: KeyCache = new Map();
    const loaded = await loadSeason(new MemorySource(first), PHRASE, keys);
    const source = new MemorySource(second);
    const next = await loadSeason(source, PHRASE, keys, loaded);
    expect(source.reads).toEqual(['version.json', 'seasons/test-season/records.enc.json']);
    expect(next.input.records).toHaveLength(2);
    expect(next.input.config).toBe(loaded.input.config); // reused, not decrypted again
  });

  it('refuses a file from another publication and a wrong phrase', async () => {
    const mixed = new Map(second);
    mixed.set('seasons/test-season/records.enc.json', first.get('seasons/test-season/records.enc.json') ?? '');
    await expect(loadSeason(new MemorySource(mixed), PHRASE, new Map())).rejects.toBeInstanceOf(
      StorageError,
    );
    await expect(loadSeason(new MemorySource(first), 'нет', new Map())).rejects.toBeInstanceOf(
      DecryptError,
    );
  });
});

/** A source that can go offline. */
class Flaky implements DataSource {
  inner: MemorySource;
  online = true;
  constructor(files: Map<string, string>) {
    this.inner = new MemorySource(files);
  }
  read(path: string) {
    return this.online ? this.inner.read(path) : Promise.reject(new StorageError(path, null));
  }
}

function harness(opts: { source: DataSource; phrase?: string | null; cache?: CachedSeason | null }) {
  const states: SyncState[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  let saved: CachedSeason | null = opts.cache ?? null;
  const sync = createSync({
    source: opts.source,
    phrase: () => (opts.phrase === undefined ? PHRASE : opts.phrase),
    cache: { read: () => saved, write: (c) => (saved = c) },
    keys: new Map(),
    intervalSec: 90,
    timers: {
      set: (run, ms) => timers.push({ run, ms }),
      clear: () => undefined,
    },
    now: () => new Date('2026-10-08T12:00:00Z'),
    onState: (s) => states.push(s),
  });
  /** Runs the next scheduled check and waits for it. */
  const tick = async () => {
    const next = timers.shift();
    next?.run();
    await new Promise((r) => setTimeout(r, 30));
    return next?.ms;
  };
  return { sync, states, timers, tick, saved: () => saved };
}

const phases = (states: SyncState[]) => states.map((s) => s.phase);
const last = (states: SyncState[]) => states[states.length - 1];

describe('createSync (SYNC-1…3)', () => {
  it('asks for the phrase first', async () => {
    const source = new MemorySource(first);
    const h = harness({ source, phrase: null });
    await h.sync.start();
    expect(phases(h.states)).toEqual(['need-phrase']);
    expect(source.reads).toEqual([]);
  });

  it('loads, caches and checks again after the interval of the config', async () => {
    const source = new MemorySource(first);
    const h = harness({ source });
    await h.sync.start();
    expect(phases(h.states)).toEqual(['loading', 'ready']);
    expect(h.timers.map((t) => t.ms)).toEqual([60_000]); // ui.pollIntervalSec of the config
    expect(h.saved()?.version.seasonId).toBe('test-season');

    source.files.clear();
    for (const [k, v] of second) source.files.set(k, v);
    source.reads.length = 0;
    expect(await h.tick()).toBe(60_000);
    expect(source.reads).toEqual(['version.json', 'seasons/test-season/records.enc.json']);
    const state = last(h.states);
    expect(state?.phase === 'ready' && state.loaded.input.records.length).toBe(2);
  });

  it('keeps the data offline and slows the retries down to five minutes', async () => {
    const source = new Flaky(first);
    const h = harness({ source });
    await h.sync.start();
    source.online = false;
    await h.tick();
    const offline = last(h.states);
    expect(offline?.phase === 'ready' && offline.notice).toEqual({
      kind: 'offline',
      since: expect.stringMatching(/^2026-10-08T/) as string,
    });
    expect(h.timers.map((t) => t.ms)).toEqual([120_000]);
    await h.tick();
    await h.tick();
    expect(h.timers.map((t) => t.ms)).toEqual([300_000]);
    source.online = true;
    await h.tick();
    const back = last(h.states);
    expect(back?.phase === 'ready' && back.notice).toBeNull();
    expect(h.timers.map((t) => t.ms)).toEqual([60_000]);
  });

  it('shows the cached data at once, even with no network', async () => {
    const warm = harness({ source: new MemorySource(first) });
    await warm.sync.start();
    const source = new Flaky(first);
    source.online = false;
    const h = harness({ source, cache: warm.saved() });
    await h.sync.start();
    expect(phases(h.states)).toEqual(['loading', 'ready', 'ready']);
    const state = last(h.states);
    expect(state?.phase === 'ready' && state.notice?.kind).toBe('offline');
  });

  it('says so when there is neither network nor cache', async () => {
    const source = new Flaky(first);
    source.online = false;
    const h = harness({ source });
    await h.sync.start();
    expect(last(h.states)).toEqual({
      phase: 'error',
      message: 'нет связи с сайтом игры — пробуем снова',
    });
    expect(h.timers.map((t) => t.ms)).toEqual([180_000]); // 90 s before any config, ×2
  });

  it('stops on a phrase that does not decrypt', async () => {
    const h = harness({ source: new MemorySource(first), phrase: 'чужая' });
    await h.sync.start();
    expect(phases(h.states)).toEqual(['loading', 'wrong-phrase']);
    expect(h.timers).toEqual([]);
  });

  it('keeps the data with a notice when new data does not read', async () => {
    const source = new MemorySource(first);
    const h = harness({ source });
    await h.sync.start();
    const version = JSON.parse(first.get('version.json') ?? '') as Record<string, unknown>;
    source.files.set('version.json', JSON.stringify({ ...version, schemaVersion: 2 }));
    await h.tick();
    const state = last(h.states);
    expect(state?.phase === 'ready' && state.notice).toEqual({
      kind: 'problem',
      message: 'данные новее этой версии сайта — обновите страницу',
    });
  });
});
