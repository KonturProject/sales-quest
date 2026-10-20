/**
 * The repository as the admin writes it (SEC-1…SEC-5, ARCH-1): a thin client of the GitHub REST
 * API on `fetch`, no Octokit (§13.2). The token goes to `https://api.github.com` only.
 */

export type RepoRef = { owner: string; repo: string; branch: string };

/** The game's repository (the site is its GitHub Pages). */
export const REPO: RepoRef = { owner: 'KonturProject', repo: 'sales-quest', branch: 'main' };

const API = 'https://api.github.com';

/** `main` moved since it was read (another tab or admin): read again, apply again (ADM-2). */
export class ConflictError extends Error {
  constructor() {
    super('данные изменились, пока вы смотрели превью — проверьте ещё раз');
    this.name = 'ConflictError';
  }
}

/** The token is wrong, expired, or has no rights for the repository. */
export class AuthError extends Error {
  constructor(message = 'GitHub не принял ключ — проверьте его или создайте новый') {
    super(message);
    this.name = 'AuthError';
  }
}

/** No answer at all: the network, not the token (review 2a). */
export class NetworkError extends Error {
  constructor() {
    super('нет связи с GitHub — проверьте интернет и попробуйте ещё раз');
    this.name = 'NetworkError';
  }
}

/** GitHub's limit of requests: wait, the token is fine. */
export class RateLimitError extends Error {
  constructor() {
    super('GitHub просит подождать: лимит запросов, попробуйте через минуту');
    this.name = 'RateLimitError';
  }
}

/** GitHub refused the move of the branch for another reason than a newer head — in its words. */
export class RefusedError extends Error {
  constructor(message: string) {
    super(`GitHub отказал: ${message}`);
    this.name = 'RefusedError';
  }
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, what: string) {
    super(`GitHub ответил ${status} на «${what}» — попробуйте ещё раз`);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/** A commit of the history (ADM-LOG): its public line and the moment GitHub took it. */
export type CommitInfo = { sha: string; parent: string | null; message: string; at: string };

export interface GitHubRepo {
  /** The commit at the head of the branch. */
  head(): Promise<string>;
  /** A file's text at a commit; null when there is none. */
  read(path: string, commit: string): Promise<string | null>;
  /**
   * One commit of several files on `base` (null deletes), then the branch moved to it without
   * force — `ConflictError` if the branch is no longer at `base`.
   */
  commit(base: string, changes: Map<string, string | null>, message: string): Promise<string>;
  whoAmI(): Promise<{ login: string; canPush: boolean; expiresAt: string | null }>;
  /** The commits that touched `path` on the branch, newest first, at most `max` (ADM-LOG). */
  history(path: string, max: number): Promise<CommitInfo[]>;
}

export class HttpGitHubRepo implements GitHubRepo {
  private readonly token: string;
  private readonly ref: RepoRef;
  private readonly fetchFn: typeof fetch;
  private expiresAt: string | null = null;

  constructor(
    token: string,
    ref: RepoRef = REPO,
    fetchFn: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {
    this.token = token;
    this.ref = ref;
    this.fetchFn = fetchFn;
  }

  private get base(): string {
    return `/repos/${this.ref.owner}/${this.ref.repo}`;
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    accept = 'application/vnd.github+json',
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (e) {
      // `fetch` rejects with a TypeError when no answer came at all.
      if (e instanceof TypeError) throw new NetworkError();
      throw e;
    }
    this.expiresAt = res.headers.get('github-authentication-token-expiration') ?? this.expiresAt;
    if (res.status === 401) throw new AuthError();
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
      throw new RateLimitError();
    if (res.status === 403)
      throw new AuthError(
        'у ключа нет прав на этот репозиторий (нужно «Contents: Read and write»)',
      );
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.call(method, path, body);
    if (!res.ok) throw new GitHubError(res.status, `${method} ${path}`);
    return (await res.json()) as T;
  }

  async head(): Promise<string> {
    const ref = await this.json<{ object: { sha: string } }>(
      'GET',
      `${this.base}/git/ref/heads/${this.ref.branch}`,
    );
    return ref.object.sha;
  }

  async read(path: string, commit: string): Promise<string | null> {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const res = await this.call(
      'GET',
      `${this.base}/contents/${encoded}?ref=${commit}`,
      undefined,
      'application/vnd.github.raw+json',
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new GitHubError(res.status, `чтение ${path}`);
    return res.text();
  }

  async commit(
    base: string,
    changes: Map<string, string | null>,
    message: string,
  ): Promise<string> {
    const parent = await this.json<{ tree: { sha: string } }>(
      'GET',
      `${this.base}/git/commits/${base}`,
    );
    const tree: { path: string; mode: '100644'; type: 'blob'; sha: string | null }[] = [];
    for (const [path, text] of changes) {
      if (text === null) {
        tree.push({ path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const blob = await this.json<{ sha: string }>('POST', `${this.base}/git/blobs`, {
        content: text,
        encoding: 'utf-8',
      });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.json<{ sha: string }>('POST', `${this.base}/git/trees`, {
      base_tree: parent.tree.sha,
      tree,
    });
    const commit = await this.json<{ sha: string }>('POST', `${this.base}/git/commits`, {
      message,
      tree: newTree.sha,
      parents: [base],
    });
    const moved = await this.call('PATCH', `${this.base}/git/refs/heads/${this.ref.branch}`, {
      sha: commit.sha,
      force: false,
    });
    // «Update is not a fast forward»: someone committed after `base`.
    if (moved.status === 409) throw new ConflictError();
    if (moved.status === 422) {
      // Only a branch that moved is a conflict; branch protection and the like are GitHub refusing.
      const answer = (await moved.json().catch(() => ({}))) as { message?: string };
      const message = answer.message ?? '';
      if (/fast.?forward/i.test(message)) throw new ConflictError();
      throw new RefusedError(message || 'без объяснения');
    }
    if (!moved.ok) throw new GitHubError(moved.status, 'запись');
    return commit.sha;
  }

  async history(path: string, max: number): Promise<CommitInfo[]> {
    type Answer = {
      sha: string;
      commit: { message: string; committer: { date: string } };
      parents: { sha: string }[];
    }[];
    const PAGE = 100;
    const found: CommitInfo[] = [];
    for (let page = 1; found.length < max; page += 1) {
      const query = `sha=${this.ref.branch}&path=${encodeURIComponent(path)}&per_page=${String(PAGE)}&page=${String(page)}`;
      const answer = await this.json<Answer>('GET', `${this.base}/commits?${query}`);
      for (const c of answer)
        found.push({
          sha: c.sha,
          parent: c.parents[0]?.sha ?? null,
          message: c.commit.message,
          at: c.commit.committer.date,
        });
      if (answer.length < PAGE) break;
    }
    return found.slice(0, max);
  }

  async whoAmI(): Promise<{ login: string; canPush: boolean; expiresAt: string | null }> {
    const user = await this.json<{ login: string }>('GET', '/user');
    const answer = await this.call('GET', this.base);
    if (answer.status === 404)
      throw new AuthError(
        'у ключа нет доступа к репозиторию sales-quest: в настройках ключа выберите его в Repository access',
      );
    if (!answer.ok) throw new GitHubError(answer.status, `GET ${this.base}`);
    const repo = (await answer.json()) as { permissions?: { push?: boolean } };
    return {
      login: user.login,
      canPush: repo.permissions?.push === true,
      expiresAt: this.expiresAt,
    };
  }
}
