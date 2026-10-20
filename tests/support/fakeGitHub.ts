import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { ConflictError, type CommitInfo, type GitHubRepo } from '../../src/admin/github.ts';

type Commit = {
  sha: string;
  parent: string | null;
  files: Map<string, string>;
  message: string;
  /** The moment of the commit, as GitHub gives it (ISO). */
  at: string;
};

/**
 * GitHub in memory for the admin's tests (plan 2a): commits as maps of repository paths to texts;
 * a commit on a base that is no longer the head is a conflict, as moving `main` without force is.
 */
export class FakeGitHubRepo implements GitHubRepo {
  readonly commits: Commit[];
  login = 'koordinator';
  canPush = true;
  expiresAt: string | null = null;
  /** The moment the next commit gets: set it for a history with known times. */
  clock: () => string = () => new Date().toISOString();

  constructor(files: Map<string, string>) {
    this.commits = [{ sha: 'c0', parent: null, files, message: 'начало', at: this.clock() }];
  }

  /** The repository's `data/` from a folder on disk (the demo of the tests). */
  static fromDir(dir: string): FakeGitHubRepo {
    const files = new Map<string, string>();
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath, entry.name);
      files.set(`data/${relative(dir, full).split(sep).join('/')}`, readFileSync(full, 'utf8'));
    }
    return new FakeGitHubRepo(files);
  }

  get last(): Commit {
    return this.commits[this.commits.length - 1] as Commit;
  }

  head(): Promise<string> {
    return Promise.resolve(this.last.sha);
  }

  read(path: string, commit: string): Promise<string | null> {
    const c = this.commits.find((x) => x.sha === commit);
    if (!c) return Promise.reject(new Error(`нет коммита ${commit}`));
    return Promise.resolve(c.files.get(path) ?? null);
  }

  commit(base: string, changes: Map<string, string | null>, message: string): Promise<string> {
    if (base !== this.last.sha) return Promise.reject(new ConflictError());
    const files = new Map(this.last.files);
    for (const [path, text] of changes) {
      if (text === null) files.delete(path);
      else files.set(path, text);
    }
    const sha = `c${this.commits.length}`;
    this.commits.push({ sha, parent: base, files, message, at: this.clock() });
    return Promise.resolve(sha);
  }

  history(_path: string, max: number): Promise<CommitInfo[]> {
    return Promise.resolve(
      [...this.commits]
        .reverse()
        .slice(0, max)
        .map(({ sha, parent, message, at }) => ({ sha, parent, message, at })),
    );
  }

  whoAmI(): Promise<{ login: string; canPush: boolean; expiresAt: string | null }> {
    return Promise.resolve({ login: this.login, canPush: this.canPush, expiresAt: this.expiresAt });
  }

  /** Another admin commits meanwhile: `main` moves on. */
  advance(): void {
    this.commits.push({
      sha: `c${this.commits.length}`,
      parent: this.last.sha,
      files: new Map(this.last.files),
      message: 'другой админ',
      at: this.clock(),
    });
  }
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * The GitHub REST API of `HttpGitHubRepo` answered by a `FakeGitHubRepo` inside the browser of a
 * Playwright test (QA-3): no token, no network. `beforeMove` runs between the commit and the move of
 * the branch — to let «another admin» commit there.
 */
export async function serveFakeGitHub(
  page: Page,
  fake: FakeGitHubRepo,
  opts: { beforeMove?: () => void; moveDelayMs?: number; failHistory?: boolean } = {},
): Promise<void> {
  const blobs = new Map<string, string>();
  const trees = new Map<string, { path: string; sha: string | null }[]>();
  const pending = new Map<string, { parent: string; tree: string; message: string }>();
  let n = 0;
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname);
    const method = request.method();
    const body = request.postData()
      ? (JSON.parse(request.postData() as string) as Record<string, unknown>)
      : {};
    const repo = '/repos/KonturProject/sales-quest';
    if (method === 'GET' && path === '/user') return json(route, { login: fake.login });
    if (method === 'GET' && path === repo)
      return json(route, { permissions: { push: fake.canPush } });
    if (method === 'GET' && path === `${repo}/git/ref/heads/main`)
      return json(route, { object: { sha: fake.last.sha } });
    if (method === 'GET' && path.startsWith(`${repo}/contents/`)) {
      const text = await fake
        .read(path.slice(`${repo}/contents/`.length), url.searchParams.get('ref') ?? '')
        .catch(() => null);
      return text === null
        ? route.fulfill({ status: 404, body: 'Not Found' })
        : route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: text });
    }
    if (method === 'GET' && path === `${repo}/commits`) {
      if (opts.failHistory) return json(route, { message: 'Server Error' }, 500);
      const size = Number(url.searchParams.get('per_page') ?? 30);
      const page = Number(url.searchParams.get('page') ?? 1);
      const all = await fake.history('data', fake.commits.length);
      return json(
        route,
        all.slice((page - 1) * size, page * size).map((c) => ({
          sha: c.sha,
          commit: { message: c.message, committer: { date: c.at } },
          parents: c.parent === null ? [] : [{ sha: c.parent }],
        })),
      );
    }
    if (method === 'GET' && path.startsWith(`${repo}/git/commits/`))
      return json(route, { tree: { sha: `tree-of-${path.split('/').pop() ?? ''}` } });
    if (method === 'POST' && path === `${repo}/git/blobs`) {
      const sha = `blob${(n += 1)}`;
      blobs.set(sha, String(body.content));
      return json(route, { sha }, 201);
    }
    if (method === 'POST' && path === `${repo}/git/trees`) {
      const sha = `tree${(n += 1)}`;
      trees.set(sha, body.tree as { path: string; sha: string | null }[]);
      return json(route, { sha }, 201);
    }
    if (method === 'POST' && path === `${repo}/git/commits`) {
      const sha = `commit${(n += 1)}`;
      const parents = body.parents as string[];
      pending.set(sha, {
        parent: parents[0] ?? '',
        tree: String(body.tree),
        message: String(body.message),
      });
      return json(route, { sha }, 201);
    }
    if (method === 'PATCH' && path === `${repo}/git/refs/heads/main`) {
      // A slow GitHub: the admin's screen while «Записываю…» can be looked at.
      if (opts.moveDelayMs) await new Promise((r) => setTimeout(r, opts.moveDelayMs));
      opts.beforeMove?.();
      const c = pending.get(String(body.sha));
      if (!c) return json(route, { message: 'no such commit' }, 422);
      const changes = new Map(
        (trees.get(c.tree) ?? []).map((e) => [
          e.path,
          e.sha === null ? null : (blobs.get(e.sha) ?? ''),
        ]),
      );
      try {
        const sha = await fake.commit(c.parent, changes, c.message);
        return json(route, { object: { sha } });
      } catch {
        return json(route, { message: 'Update is not a fast forward' }, 422);
      }
    }
    return json(route, { message: `fake GitHub: ${method} ${path}` }, 404);
  });
}

/**
 * The site's `data/` answered from the head of the fake: the viewer sees what the admin committed.
 * `files` — what the site gives instead (a site that has not rebuilt yet); registered later, it wins.
 */
export async function serveSiteData(
  page: Page,
  fake: FakeGitHubRepo,
  opts: { files?: () => Map<string, string> } = {},
): Promise<void> {
  await page.route('**/sales-quest/data/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/sales-quest\//, '');
    const text = (opts.files?.() ?? fake.last.files).get(decodeURIComponent(path));
    return text === undefined
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: text });
  });
}
