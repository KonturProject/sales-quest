import { describe, expect, it } from 'vitest';
import {
  AuthError,
  ConflictError,
  HttpGitHubRepo,
  NetworkError,
  RateLimitError,
} from '../../../src/admin/github.ts';

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** A stub of `fetch`: answers by method and path, records every request. */
function stub(
  routes: Record<
    string,
    (body: unknown) => {
      status?: number;
      json?: unknown;
      text?: string;
      headers?: Record<string, string>;
    }
  >,
) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    calls.push({ method, url, headers: init?.headers as Record<string, string>, body });
    const path = url.replace('https://api.github.com', '').split('?')[0] ?? '';
    const route = routes[`${method} ${path}`];
    if (!route) return new Response('not found', { status: 404 });
    const r = route(body);
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), {
      status: r.status ?? 200,
      headers: r.headers ?? {},
    });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const REF = { owner: 'o', repo: 'r', branch: 'main' };

describe('the GitHub client (SEC-1…SEC-5)', () => {
  it('reads the head of the branch and a file at a commit; a missing file is null', async () => {
    const { calls, fetchFn } = stub({
      'GET /repos/o/r/git/ref/heads/main': () => ({ json: { object: { sha: 'abc' } } }),
      'GET /repos/o/r/contents/data/version.json': () => ({ text: '{"rev":"1"}' }),
    });
    const repo = new HttpGitHubRepo('tok', REF, fetchFn);
    expect(await repo.head()).toBe('abc');
    expect(await repo.read('data/version.json', 'abc')).toBe('{"rev":"1"}');
    expect(await repo.read('data/nope.json', 'abc')).toBeNull();
    const read = calls[1] as Call;
    expect(read.url).toBe('https://api.github.com/repos/o/r/contents/data/version.json?ref=abc');
    expect(read.headers.Accept).toBe('application/vnd.github.raw+json');
    for (const c of calls) {
      expect(c.url.startsWith('https://api.github.com/')).toBe(true);
      expect(c.headers.Authorization).toBe('Bearer tok');
      expect(c.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    }
  });

  it('commits several files in one commit on the base, deletes with null, moves the branch without force', async () => {
    const blobs: unknown[] = [];
    const { calls, fetchFn } = stub({
      'GET /repos/o/r/git/commits/base1': () => ({ json: { tree: { sha: 'tree0' } } }),
      'POST /repos/o/r/git/blobs': (body) => {
        blobs.push(body);
        return { status: 201, json: { sha: `blob${blobs.length}` } };
      },
      'POST /repos/o/r/git/trees': () => ({ status: 201, json: { sha: 'tree1' } }),
      'POST /repos/o/r/git/commits': () => ({ status: 201, json: { sha: 'new1' } }),
      'PATCH /repos/o/r/git/refs/heads/main': () => ({ json: { object: { sha: 'new1' } } }),
    });
    const repo = new HttpGitHubRepo('tok', REF, fetchFn);
    const sha = await repo.commit(
      'base1',
      new Map([
        ['data/a.json', 'A'],
        ['data/old.json', null],
      ]),
      'data(x): тест [by k]',
    );
    expect(sha).toBe('new1');
    expect(blobs).toEqual([{ content: 'A', encoding: 'utf-8' }]);
    const body = (m: string) => calls.find((c) => `${c.method} ${c.url}`.startsWith(m))?.body;
    expect(body('POST https://api.github.com/repos/o/r/git/trees')).toEqual({
      base_tree: 'tree0',
      tree: [
        { path: 'data/a.json', mode: '100644', type: 'blob', sha: 'blob1' },
        { path: 'data/old.json', mode: '100644', type: 'blob', sha: null },
      ],
    });
    expect(body('POST https://api.github.com/repos/o/r/git/commits')).toEqual({
      message: 'data(x): тест [by k]',
      tree: 'tree1',
      parents: ['base1'],
    });
    expect(body('PATCH https://api.github.com/repos/o/r/git/refs/heads/main')).toEqual({
      sha: 'new1',
      force: false,
    });
  });

  it('a branch that moved meanwhile is a conflict, not an overwrite', async () => {
    const { fetchFn } = stub({
      'GET /repos/o/r/git/commits/base1': () => ({ json: { tree: { sha: 't' } } }),
      'POST /repos/o/r/git/blobs': () => ({ status: 201, json: { sha: 'b' } }),
      'POST /repos/o/r/git/trees': () => ({ status: 201, json: { sha: 't2' } }),
      'POST /repos/o/r/git/commits': () => ({ status: 201, json: { sha: 'n' } }),
      'PATCH /repos/o/r/git/refs/heads/main': () => ({
        status: 422,
        json: { message: 'Update is not a fast forward' },
      }),
    });
    const repo = new HttpGitHubRepo('tok', REF, fetchFn);
    await expect(repo.commit('base1', new Map([['data/a.json', 'A']]), 'm')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('a 422 that is not about a fast forward is GitHub refusing, in its words — not a conflict', async () => {
    const { fetchFn } = stub({
      'GET /repos/o/r/git/commits/base1': () => ({ json: { tree: { sha: 't' } } }),
      'POST /repos/o/r/git/blobs': () => ({ status: 201, json: { sha: 'b' } }),
      'POST /repos/o/r/git/trees': () => ({ status: 201, json: { sha: 't2' } }),
      'POST /repos/o/r/git/commits': () => ({ status: 201, json: { sha: 'n' } }),
      'PATCH /repos/o/r/git/refs/heads/main': () => ({
        status: 422,
        json: { message: 'Protected branch update failed' },
      }),
    });
    const repo = new HttpGitHubRepo('tok', REF, fetchFn);
    await expect(repo.commit('base1', new Map([['data/a.json', 'A']]), 'm')).rejects.toThrow(
      'GitHub отказал: Protected branch update failed',
    );
  });

  it('a 403 of the rate limit asks to wait, not «no rights»', async () => {
    const { fetchFn } = stub({
      'GET /repos/o/r/git/ref/heads/main': () => ({
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    });
    await expect(new HttpGitHubRepo('tok', REF, fetchFn).head()).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('a token without access to the repository says so at the login', async () => {
    const { fetchFn } = stub({ 'GET /user': () => ({ json: { login: 'k' } }) }); // the repo: 404
    await expect(new HttpGitHubRepo('tok', REF, fetchFn).whoAmI()).rejects.toThrow(
      /нет доступа к репозиторию sales-quest/,
    );
  });

  it('a network failure is NetworkError', async () => {
    const fetchFn = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    await expect(new HttpGitHubRepo('tok', REF, fetchFn).head()).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it('a wrong token or one without rights is an AuthError', async () => {
    const { fetchFn } = stub({
      'GET /repos/o/r/git/ref/heads/main': () => ({
        status: 401,
        json: { message: 'Bad credentials' },
      }),
    });
    await expect(new HttpGitHubRepo('bad', REF, fetchFn).head()).rejects.toBeInstanceOf(AuthError);
  });

  it('tells who the token is, whether it may push, and when it expires', async () => {
    const { fetchFn } = stub({
      'GET /user': () => ({
        json: { login: 'koordinator' },
        headers: { 'github-authentication-token-expiration': '2026-10-20 10:00:00 +0300' },
      }),
      'GET /repos/o/r': () => ({ json: { permissions: { push: true } } }),
    });
    expect(await new HttpGitHubRepo('tok', REF, fetchFn).whoAmI()).toEqual({
      login: 'koordinator',
      canPush: true,
      expiresAt: '2026-10-20 10:00:00 +0300',
    });
  });
});

describe('the history of data/ (ADM-LOG, 2b-3)', () => {
  const commit = (n: number) => ({
    sha: `c${String(n)}`,
    commit: {
      message: `data(s): импорт: … ${String(n)} [by k]`,
      committer: { date: '2026-10-19T07:30:00Z' },
    },
    parents: [{ sha: `c${String(n - 1)}` }],
  });

  it('reads the history of a path page by page, newest first', async () => {
    let page = 0;
    const { calls, fetchFn } = stub({
      'GET /repos/o/r/commits': () => {
        page += 1;
        return {
          json:
            page === 1
              ? Array.from({ length: 100 }, (_, i) => commit(200 - i))
              : [{ ...commit(1), parents: [] }],
        };
      },
    });
    const repo = new HttpGitHubRepo('tok', REF, fetchFn);
    const history = await repo.history('data', 500);
    expect(history).toHaveLength(101);
    expect(history[0]).toEqual({
      sha: 'c200',
      parent: 'c199',
      message: 'data(s): импорт: … 200 [by k]',
      at: '2026-10-19T07:30:00Z',
    });
    expect(history[100]?.parent).toBeNull();
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.github.com/repos/o/r/commits?sha=main&path=data&per_page=100&page=1',
      'https://api.github.com/repos/o/r/commits?sha=main&path=data&per_page=100&page=2',
    ]);
  });

  it('stops at max', async () => {
    const { calls, fetchFn } = stub({
      'GET /repos/o/r/commits': () => ({
        json: Array.from({ length: 100 }, (_, i) => commit(200 - i)),
      }),
    });
    const repo = new HttpGitHubRepo('tok', REF, fetchFn);
    expect(await repo.history('data', 100)).toHaveLength(100);
    expect(calls).toHaveLength(1);
  });
});
