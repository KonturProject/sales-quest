import { useEffect, useState } from 'react';
import { getViewer } from '../app/viewer.ts';
import { Home } from './Home.tsx';
import { ImportFlow } from './ImportFlow.tsx';
import { Login } from './Login.tsx';
import { NewGame } from './NewGame.tsx';
import { loadRepoState } from './pipeline.ts';
import { Publishing } from './Publishing.tsx';
import { Roster } from './Roster.tsx';
import type { RosterEdit } from './roster.ts';
import { adminMessage, type Session } from './session.ts';
import { forgetToken } from './token.ts';

/**
 * `#/admin` (§8, D-7a): a lazy chunk — viewers never download it, nor SheetJS, nor the GitHub client.
 * Every change goes one way: preview → confirm → one commit → the publication.
 */
export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setViewRaw] = useState<'home' | 'import' | 'new' | 'roster'>('home');
  // The roster batch lives here: it survives a visit to another screen (plan 2b-1).
  const [rosterEdits, setRosterEdits] = useState<RosterEdit[]>([]);
  const [publishing, setPublishing] = useState<{
    rev: string;
    started: number;
    /** A launch: the map of this browser opens the new game once the site has it. */
    phrase?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An unsaved batch is not lost silently: closing or reloading the page asks first (review 2b-1).
  const unsaved = rosterEdits.length;
  useEffect(() => {
    if (unsaved === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  const leaveBatch = () =>
    unsaved === 0 ||
    window.confirm(
      `Есть несохранённые изменения состава (${String(unsaved)}) — они пропадут. Уйти без записи?`,
    );
  // A new screen is a new action: the last one's error is not its (review 2a).
  const setView = (next: 'home' | 'import' | 'new' | 'roster') => {
    setError(null);
    setViewRaw(next);
  };

  if (!session) return <Login onLogin={setSession} />;

  const reload = async (current: Session) => {
    try {
      const state = await loadRepoState(current.repo, current.phrase, current.keys);
      setSession({ ...current, state });
      setError(null);
    } catch (e) {
      setError(adminMessage(e));
    }
  };
  const committed = (rev: string) => {
    setPublishing({ rev, started: Date.now() });
    setView('home');
    void reload(session);
  };
  const launched = ({ rev, phrase }: { rev: string; phrase: string }) => {
    // A new game has other people under the same ids: a batch of the old one means nothing there.
    setRosterEdits([]);
    const next = { ...session, phrase, keys: new Map() };
    setSession(next);
    setPublishing({ rev, started: Date.now(), phrase });
    setView('home');
    void reload(next);
  };

  return (
    <main className="sq-screen sq-ui h-full overflow-auto p-4" data-testid="admin">
      <div className="mx-auto max-w-4xl space-y-3">
        <header className="sq-plate flex flex-wrap items-center gap-3 px-3 py-1.5">
          <span className="sq-caps sq-bright">Админка игры</span>
          <span className="sq-muted">{session.login}</span>
          <a
            className="sq-button ml-auto"
            href="#/"
            onClick={(e) => {
              if (!leaveBatch()) e.preventDefault();
            }}
          >
            Карта
          </a>
          <button
            className="sq-button"
            onClick={() => {
              if (!leaveBatch()) return;
              setRosterEdits([]);
              forgetToken();
              setSession(null);
            }}
          >
            Выйти
          </button>
        </header>
        {publishing && (
          <Publishing
            // A new commit is a new banner: the last one's «Опубликовано» is not this one's.
            key={publishing.rev}
            rev={publishing.rev}
            started={publishing.started}
            onDone={() => {
              if (publishing.phrase !== undefined) getViewer().setPhrase(publishing.phrase);
            }}
          />
        )}
        {error && (
          <p role="alert" className="sq-plate sq-plate-alarm px-3 py-1.5">
            {error}
          </p>
        )}
        {view === 'home' ? (
          <Home
            session={session}
            onImport={() => setView('import')}
            onNewGame={() => setView('new')}
            onRoster={() => setView('roster')}
          />
        ) : view === 'roster' ? (
          <Roster
            session={session}
            edits={rosterEdits}
            onEdits={setRosterEdits}
            onState={(state) => setSession({ ...session, state })}
            onCancel={() => setView('home')}
            onCommitted={committed}
          />
        ) : view === 'new' ? (
          <NewGame
            session={session}
            onState={(state) => setSession({ ...session, state })}
            onCancel={() => setView('home')}
            onLaunched={launched}
          />
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
