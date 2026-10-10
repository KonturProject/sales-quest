import { lazy, Suspense, useEffect } from 'react';
import { Hud } from '../hud/Hud.tsx';
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
  if (sync.phase === 'ready' && game) {
    const { config } = sync.loaded.input;
    return (
      <main className="relative h-full w-full bg-gray-900">
        <GameScene game={game} config={config} />
        <Hud game={game} config={config} checkedAt={sync.checkedAt} notice={sync.notice} />
      </main>
    );
  }
  return (
    <main className="sq-screen sq-ui flex h-full w-full items-center justify-center p-4">
      <p className="sq-plate px-4 py-1.5">
        {state.error ?? (sync.phase === 'error' ? sync.message : 'Загрузка данных…')}
      </p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="sq-screen sq-ui flex h-full flex-col items-center justify-center gap-3">
      <p className="sq-title sq-caps w-72 text-[13px]">Такой страницы нет</p>
      <a className="sq-button" href="#/">
        На карту
      </a>
    </main>
  );
}
