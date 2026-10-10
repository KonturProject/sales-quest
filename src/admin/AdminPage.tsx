import { useState } from 'react';
import { Home } from './Home.tsx';
import { ImportFlow } from './ImportFlow.tsx';
import { Login } from './Login.tsx';
import { loadRepoState } from './pipeline.ts';
import { Publishing } from './Publishing.tsx';
import { adminMessage, type Session } from './session.ts';
import { forgetToken } from './token.ts';

/**
 * `#/admin` (§8, D-7a): a lazy chunk — viewers never download it, nor SheetJS, nor the GitHub client.
 * Every change goes one way: preview → confirm → one commit → the publication.
 */
export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<'home' | 'import'>('home');
  const [publishing, setPublishing] = useState<{ rev: string; started: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Login onLogin={setSession} />;

  const reload = async (current: Session) => {
    try {
      const state = await loadRepoState(current.repo, current.phrase, current.keys);
      setSession({ ...current, state });
    } catch (e) {
      setError(adminMessage(e));
    }
  };
  const committed = (rev: string) => {
    setPublishing({ rev, started: Date.now() });
    setView('home');
    void reload(session);
  };

  return (
    <main className="sq-screen sq-ui h-full overflow-auto p-4" data-testid="admin">
      <div className="mx-auto max-w-4xl space-y-3">
        <header className="sq-plate flex flex-wrap items-center gap-3 px-3 py-1.5">
          <span className="sq-caps sq-bright">Админка игры</span>
          <span className="sq-muted">{session.login}</span>
          <a className="sq-button ml-auto" href="#/">
            Карта
          </a>
          <button
            className="sq-button"
            onClick={() => {
              forgetToken();
              setSession(null);
            }}
          >
            Выйти
          </button>
        </header>
        {publishing && <Publishing rev={publishing.rev} started={publishing.started} />}
        {error && (
          <p role="alert" className="sq-plate sq-plate-alarm px-3 py-1.5">
            {error}
          </p>
        )}
        {view === 'home' ? (
          <Home session={session} onImport={() => setView('import')} />
        ) : (
          <ImportFlow
            session={session}
            onState={(state) => setSession({ ...session, state })}
            onCancel={() => setView('home')}
            onCommitted={committed}
          />
        )}
      </div>
    </main>
  );
}
