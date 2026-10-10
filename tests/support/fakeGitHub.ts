import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ConflictError, type GitHubRepo } from '../../src/admin/github.ts';

type Commit = { sha: string; parent: string | null; files: Map<string, string>; message: string };

/**
 * GitHub in memory for the admin's tests (plan 2a): commits as maps of repository paths to texts;
 * a commit on a base that is no longer the head is a conflict, as moving `main` without force is.
 */
export class FakeGitHubRepo implements GitHubRepo {
  readonly commits: Commit[];
  login = 'koordinator';
  canPush = true;
  expiresAt: string | null = null;

  constructor(files: Map<string, string>) {
    this.commits = [{ sha: 'c0', parent: null, files, message: 'начало' }];
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
    this.commits.push({ sha, parent: base, files, message });
    return Promise.resolve(sha);
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
    });
  }
}
