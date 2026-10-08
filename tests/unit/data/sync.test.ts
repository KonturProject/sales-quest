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
    const source = new MemorySource(mixed);
    await expect(loadSeason(source, PHRASE, new Map())).rejects.toThrow(
      'сайт обновляется — новые данные подтянутся через пару минут',
    );
    // Asked once more past the browser cache before giving up.
    expect(source.reads.filter((p) => p.endsWith('records.enc.json'))).toHaveLength(2);
    await expect(loadSeason(new MemorySource(first), 'нет', new Map())).rejects.toBeInstanceOf(
      DecryptError,
    );
  });
});

/** A source that can go offline, or hold its answers until released. */
class Flaky implements DataSource {
  inner: MemorySource;
  online = true;
  held: (() => void)[] | null = null;
  constructor(files: Map<string, string>) {
    this.inner = new MemorySource(files);
  }
  async read(path: string) {
    if (this.held) await new Promise<void>((release) => this.held?.push(release));
    return this.online ? this.inner.read(path) : Promise.reject(new StorageError(path, null));
  }
  release() {
    const held = this.held ?? [];
    this.held = null;
    for (const r of held) r();
  }
}

function harness(opts: {
  source: DataSource;
  phrase?: string | null;
  cache?: CachedSeason | null;
  onState?: (s: SyncState) => void;
}) {
  const states: SyncState[] = [];
  const timers: { ms: number }[] = [];
  let saved: CachedSeason | null = opts.cache ?? null;
  let writes = 0;
  const sync = createSync({
    source: opts.source,
    phrase: () => (opts.phrase === undefined ? PHRASE : opts.phrase),
    cache: {
      read: () => saved,
      write: (c) => {
        saved = c;
        writes += 1;
      },
    },
    keys: new Map(),
    intervalSec: 90,
    timers: { set: (_run, ms) => timers.push({ ms }), clear: () => undefined },
    now: () => new Date('2026-10-08T12:00:00Z'),
    onState: (s) => {
      states.push(s);
      opts.onState?.(s);
    },
  });
  /** The scheduled check, run now: deterministic, no real timers. */
  const tick = async () => {
    const next = timers.shift();
    await sync.refresh();
    return next?.ms;
  };
  return { sync, states, timers, tick, saved: () => saved, writes: () => writes };
}

const phases = (states: SyncState[]) => states.map((s) => s.phase);
const last = (states: SyncState[]) => states[states.length - 1];
const noticeOf = (s: SyncState | undefined) => (s?.phase === 'ready' ? s.notice : undefined);

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

  it('writes the cache only when the data changes', async () => {
    const h = harness({ source: new MemorySource(first) });
    await h.sync.start();
    await h.tick();
    await h.tick();
    expect(h.writes()).toBe(1);
  });

  it('keeps the data offline and slows the retries down to five minutes', async () => {
    const source = new Flaky(first);
    const h = harness({ source });
    await h.sync.start();
    source.online = false;
    await h.tick();
    expect(noticeOf(last(h.states))).toEqual({
      kind: 'offline',
      since: expect.stringMatching(/^2026-10-08T/) as string,
    });
    expect(h.timers.map((t) => t.ms)).toEqual([120_000]);
    await h.tick();
    await h.tick();
    expect(h.timers.map((t) => t.ms)).toEqual([300_000]);
    source.online = true;
    await h.tick();
    expect(noticeOf(last(h.states))).toBeNull();
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
    expect(noticeOf(last(h.states))?.kind).toBe('offline');
  });

  it('lets the site decide when the cache is under an old phrase (SEC-8)', async () => {
    const warm = harness({ source: new MemorySource(first) });
    await warm.sync.start();
    const renewed = await sealSeason(base, 'новая фраза', {
      updatedAt: at('2026-10-09'),
      iterations: 1000,
    });
    const h = harness({
      source: new MemorySource(renewed),
      phrase: 'новая фраза',
      cache: warm.saved(),
    });
    await h.sync.start();
    expect(phases(h.states)).toEqual(['loading', 'ready']);
    // The old phrase with the new data is refused by the site, not by the cache.
    const old = harness({ source: new MemorySource(renewed), cache: warm.saved() });
    await old.sync.start();
    expect(phases(old.states)).toEqual(['loading', 'ready', 'wrong-phrase']);
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

  it('takes a damaged file for damage, not for a wrong phrase', async () => {
    const source = new MemorySource(first);
    const h = harness({ source });
    await h.sync.start();
    const broken = await sealSeason(
      { ...base, records: [] },
      PHRASE,
      { updatedAt: at('2026-10-09'), iterations: 1000 },
    );
    const records = 'seasons/test-season/records.enc.json';
    const envelope = JSON.parse(broken.get(records) ?? '') as { ciphertext: string };
    // One file whose ciphertext is cut: the others open, so the phrase is right.
    broken.set(records, JSON.stringify({ ...envelope, ciphertext: envelope.ciphertext.slice(8) }));
    const { fingerprint, revOf } = await import('../../../src/data/files.ts');
    const version = JSON.parse(broken.get('version.json') ?? '') as {
      files: Record<'config' | 'records' | 'adjustments' | 'imports', string>;
      rev: string;
    };
    version.files.records = await fingerprint(broken.get(records) ?? '');
    version.rev = await revOf(version.files);
    broken.set('version.json', JSON.stringify(version));
    source.files.clear();
    for (const [k, v] of broken) source.files.set(k, v);
    await h.tick();
    expect(noticeOf(last(h.states))).toEqual({ kind: 'problem', message: 'файл данных повреждён' });
    expect(h.timers.map((t) => t.ms)).toEqual([60_000]);
  });

  it('keeps the data with a notice when new data is too new', async () => {
    const source = new MemorySource(first);
    const h = harness({ source });
    await h.sync.start();
    const version = JSON.parse(first.get('version.json') ?? '') as Record<string, unknown>;
    source.files.set('version.json', JSON.stringify({ ...version, schemaVersion: 2 }));
    await h.tick();
    expect(noticeOf(last(h.states))).toEqual({
      kind: 'problem',
      message: 'данные новее этой версии сайта — обновите страницу',
    });
  });

  it('says nothing once stopped, even if a check was under way', async () => {
    const source = new Flaky(first);
    source.held = [];
    const h = harness({ source });
    const started = h.sync.start();
    h.sync.stop();
    source.release();
    await started;
    expect(phases(h.states)).toEqual(['loading']);
    expect(h.saved()).toBeNull();
  });

  it('runs one check at a time: «Обновить» during a check joins it', async () => {
    const source = new Flaky(first);
    const h = harness({ source });
    await h.sync.start();
    source.inner.reads.length = 0;
    source.held = [];
    const a = h.sync.refresh();
    const b = h.sync.refresh();
    source.release();
    await Promise.all([a, b]);
    expect(source.inner.reads).toEqual(['version.json']);
  });

  it('keeps polling when a listener fails', async () => {
    let fail = true;
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (e: unknown) => errors.push(e);
    try {
      const h = harness({
        source: new MemorySource(first),
        onState: (s) => {
          if (s.phase === 'ready' && fail) {
            fail = false;
            throw new Error('движок упал');
          }
        },
      });
      await h.sync.start();
      expect(h.timers.map((t) => t.ms)).toEqual([60_000]);
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});
