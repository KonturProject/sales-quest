import { useState, type FormEvent } from 'react';
import type { KeyCache } from '../data/crypto.ts';
import { getViewer } from '../app/viewer.ts';
import { readPhrase } from '../data/cache.ts';
import { localDate } from '../data/time.ts';
import { AuthError, HttpGitHubRepo } from './github.ts';
import { loadRepoState } from './pipeline.ts';
import { adminMessage, type Session } from './session.ts';
import { expiryWarning, readToken, writeToken } from './token.ts';

const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new';

/** «Войти» (SEC-1, SEC-2): the GitHub token and the access phrase; both stay in this browser. */
export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [token, setToken] = useState(() => readToken() ?? '');
  const [phrase, setPhrase] = useState(() => readPhrase() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const repo = new HttpGitHubRepo(token.trim());
      const who = await repo.whoAmI();
      if (!who.canPush)
        throw new AuthError(
          'у ключа нет права записи в репозиторий sales-quest (нужно «Contents: Read and write»)',
        );
      const keys: KeyCache = new Map();
      const state = await loadRepoState(repo, phrase.trim(), keys);
      writeToken(token.trim());
      // The map of this page opens with the same phrase, not the access gate (QA-3 found it).
      getViewer().setPhrase(phrase.trim());
      onLogin({
        repo,
        login: who.login,
        phrase: phrase.trim(),
        keys,
        expiry: expiryWarning(who.expiresAt, localDate(new Date())),
        state,
      });
    } catch (err) {
      setError(adminMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="sq-screen sq-ui flex h-full items-center justify-center overflow-auto p-4">
      <form
        className="sq-panel w-full max-w-lg space-y-3 px-5 py-4"
        onSubmit={(e) => void submit(e)}
        data-testid="admin-login"
      >
        <h1 className="sq-title sq-caps text-[13px]">Вход в админку</h1>
        <details className="sq-muted text-sm">
          <summary className="cursor-pointer">Как получить ключ GitHub</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Откройте{' '}
              <a className="underline" href={TOKEN_PAGE} target="_blank" rel="noreferrer">
                страницу ключей GitHub
              </a>{' '}
              (Settings → Developer settings → Fine-grained tokens → Generate new token).
            </li>
            <li>
              Срок — до конца года; Repository access — Only select repositories → sales-quest.
            </li>
            <li>Permissions → Repository → Contents: Read and write. Больше ничего не нужно.</li>
            <li>
              Скопируйте ключ (github_pat_…) и вставьте сюда. Он хранится только в этом браузере.
            </li>
          </ol>
        </details>
        <label className="block text-sm">
          Ключ GitHub
          <input
            className="sq-input mt-1"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Фраза доступа к данным игры
          <input
            className="sq-input mt-1"
            type="password"
            autoComplete="off"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="sq-pace-down text-sm">
            {error}
          </p>
        )}
        <button
          className="sq-button w-full"
          type="submit"
          disabled={busy || !token.trim() || !phrase.trim()}
        >
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
