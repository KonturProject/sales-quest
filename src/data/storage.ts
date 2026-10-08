/**
 * Where data files come from — the read side of ARCH-1's `StorageAdapter`, named `DataSource`
 * (D-33): `fresh` bypasses every cache (the polled `version.json`, SYNC-1); a fingerprint makes
 * the URL unique per content, so the CDN and the browser may cache it (DEP-4); `reload` refetches
 * such a file past the browser cache. Writing (`commit`) arrives with the admin on stage 2.
 */
export type ReadMode = { fresh: true } | { fingerprint: string; reload?: boolean };

export interface DataSource {
  /** The text of a file by its path inside `data/`. */
  read(path: string, mode: ReadMode): Promise<string>;
}

/** The site could not give a file: no network or no answer in time (`status` null), or an HTTP error. */
export class StorageError extends Error {
  readonly path: string;
  readonly status: number | null;
  constructor(path: string, status: number | null) {
    super(status === null ? `нет связи: ${path}` : `${path}: ответ ${status}`);
    this.name = 'StorageError';
    this.path = path;
    this.status = status;
  }
}

/** A request that hangs must not stop the polling for good. */
export const READ_TIMEOUT_MS = 15_000;

/** The published site: `<base>data/<path>` on GitHub Pages or the dev server. */
export class PagesSource implements DataSource {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly clock: () => number;

  constructor(
    base: string,
    fetchFn: typeof fetch = (...args) => globalThis.fetch(...args),
    clock: () => number = () => Date.now(),
  ) {
    this.base = base;
    this.fetchFn = fetchFn;
    this.clock = clock;
  }

  async read(path: string, mode: ReadMode): Promise<string> {
    const fresh = 'fresh' in mode;
    const query = fresh ? `t=${this.clock()}` : `v=${mode.fingerprint}`;
    const cache: RequestCache | undefined = fresh ? 'no-store' : mode.reload ? 'reload' : undefined;
    try {
      const response = await this.fetchFn(`${this.base}${path}?${query}`, {
        ...(cache ? { cache } : {}),
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (!response.ok) throw new StorageError(path, response.status);
      return await response.text();
    } catch (e) {
      throw e instanceof StorageError ? e : new StorageError(path, null);
    }
  }
}

/**
 * Files in memory: tests and Node scripts. Holds its own copy of the files (changing them does not
 * touch the caller's map) and counts reads, so tests see what was fetched.
 */
export class MemorySource implements DataSource {
  readonly files: Map<string, string>;
  readonly reads: string[] = [];

  constructor(files: Map<string, string>) {
    this.files = new Map(files);
  }

  read(path: string): Promise<string> {
    this.reads.push(path);
    const text = this.files.get(path);
    return text === undefined
      ? Promise.reject(new StorageError(path, 404))
      : Promise.resolve(text);
  }
}
