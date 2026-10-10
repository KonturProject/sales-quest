import { DecryptError, type KeyCache } from '../data/crypto.ts';
import type { GitHubRepo } from './github.ts';
import type { RepoState } from './pipeline.ts';

/** The admin after «Войти»: the repository, the login, the phrase and the season as read last. */
export type Session = {
  repo: GitHubRepo;
  login: string;
  phrase: string;
  keys: KeyCache;
  /** The token's expiry warning (SEC-3), or null. */
  expiry: string | null;
  state: RepoState;
};

/** An error in words for the admin's screen. */
export function adminMessage(error: unknown): string {
  if (error instanceof DecryptError) return 'фраза доступа не подходит к данным игры';
  if (error instanceof TypeError)
    return 'нет связи с GitHub — проверьте интернет и попробуйте ещё раз';
  if (error instanceof Error) return error.message;
  return String(error);
}
