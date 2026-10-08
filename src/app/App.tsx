import { lazy, Suspense, useEffect } from 'react';
import { GameScene } from '../scene/GameScene.tsx';
import { takePhrase } from './access.ts';
import { AccessGate } from './AccessGate.tsx';
import { formatHash, type Route } from './router.ts';
import { useStore } from './store.ts';
import { useHashRoute } from './useHashRoute.ts';
import { getViewer, isDate, type ViewerState } from './viewer.ts';

// A lazy chunk: viewers of the map never download it.
const DebugPage = lazy(() => import('../debug/DebugPage.tsx'));

export function App() {
  const viewer = getViewer();
  const route = useHashRoute();
  const sync = useStore(viewer.store, (s) => s.sync);

  // A link with a phrase opened while the page is open (SEC-7).
  useEffect(() => {
    const { phrase, route: clean } = takePhrase(route);
    if (!phrase) return;
    viewer.setPhrase(phrase);
    window.history.replaceState(window.history.state, '', formatHash(clean));
  }, [route, viewer]);

  if (route.path !== '/' && route.path !== '/debug') return <NotFound />;
  if (sync.phase === 'need-phrase' || sync.phase === 'wrong-phrase')
    return <AccessGate wrong={sync.phase === 'wrong-phrase'} onSubmit={viewer.setPhrase} />;
  if (route.path === '/debug')
    return (
      <Suspense fallback={<main className="p-4">Загрузка…</main>}>
        <DebugPage />
      </Suspense>
    );
  return <MapPage route={route} />;
}

/** The map: the scene of the game (stage 3) with the data line on top until the HUD. */
function MapPage({ route }: { route: Route }) {
  const viewer = getViewer();
  const state = useStore(viewer.store, (s: ViewerState) => s);
  // `?date=` — the game on that day (D-35); `?cells=` — a preview of N cells a day (OQ-18).
  const date = isDate(route.query.date) ? route.query.date : null;
  const cells = route.query.cells ? Number(route.query.cells) : null;
  useEffect(() => {
    viewer.setDate(date);
    return () => viewer.setDate(null);
  }, [date, viewer]);
  useEffect(() => {
    viewer.setCells(cells);
    return () => viewer.setCells(null);
  }, [cells, viewer]);

  const { sync, game } = state;
  return (
    <main className="relative h-full w-full bg-gray-900">
      {sync.phase === 'ready' && game && (
        <GameScene game={game} config={sync.loaded.input.config} />
      )}
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-white/85 px-3 py-2 text-sm text-slate-800 shadow">
        Sales Quest · <Status />
      </div>
    </main>
  );
}

/** One line about the data until the HUD of stage 3. */
function Status() {
  const state = useStore(getViewer().store, (s: ViewerState) => s);
  const { sync, game } = state;
  if (state.error) return <>{state.error}</>;
  if (sync.phase === 'error') return <>{sync.message}</>;
  if (sync.phase !== 'ready' || !game) return <>загрузка данных…</>;
  const config = sync.loaded.input.config;
  const asOf = game.dataAsOf;
  return (
    <>
      {config.title}: {game.teams.length} команд
      {sync.notice?.kind === 'offline'
        ? ` · нет связи${asOf ? `, данные от ${asOf.slice(8, 10)}.${asOf.slice(5, 7)} ${asOf.slice(11, 16)}` : ''}`
        : ''}
      {sync.notice?.kind === 'problem' ? ` · ${sync.notice.message}` : ''}
    </>
  );
}

function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-800">
      <p>Такой страницы нет.</p>
      <a className="text-blue-700 underline" href="#/">
        На карту
      </a>
    </main>
  );
}
