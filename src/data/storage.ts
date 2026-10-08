/**
 * Where data files come from (ARCH-1). The read side only: `fresh` bypasses every cache (the
 * polled `version.json`, SYNC-1); a fingerprint makes the URL unique per content, so the CDN and
 * the browser may cache it (DEP-4, D-33). Writing (`commit`) arrives with the admin on stage 2.
 */
export type ReadMode = { fresh: true } | { fingerprint: string };

export interface DataSource {
  /** The text of a file by its path inside `data/`. */
  read(path: string, mode: ReadMode): Promise<string>;
}

/** The site could not give a file: no network (`status` null), or an HTTP error. */
export class StorageError extends Error {
  readonly path: string;
  readonly status: number | null;
  constructor(path: string, status: number | null, detail?: string) {
    super(detail ?? (status === null ? `нет связи: ${path}` : `${path}: ответ ${status}`));
    this.name = 'StorageError';
    this.path = path;
    this.status = status;
  }
}

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
    let response: Response;
    try {
      response = await this.fetchFn(`${this.base}${path}?${query}`, fresh ? { cache: 'no-store' } : {});
    } catch {
      throw new StorageError(path, null);
    }
    if (!response.ok) throw new StorageError(path, response.status);
    return response.text();
  }
}

/** Files in memory: tests and Node scripts. Counts reads, so tests see what was fetched. */
export class MemorySource implements DataSource {
  readonly files: Map<string, string>;
  readonly reads: string[] = [];

  constructor(files: Map<string, string>) {
    this.files = files;
  }

  read(path: string): Promise<string> {
    this.reads.push(path);
    const text = this.files.get(path);
    return text === undefined
      ? Promise.reject(new StorageError(path, 404))
      : Promise.resolve(text);
  }
}
