import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Hud } from '../hud/Hud.tsx';
import { GameScene } from '../scene/GameScene.tsx';
import { qualityAt, readStoredLevel } from '../scene/runtime/quality.ts';
import { takePhrase } from './access.ts';
import { AccessGate } from './AccessGate.tsx';
import { formatHash, type Route } from './router.ts';
import { useStore } from './store.ts';
import { useHashRoute } from './useHashRoute.ts';
import { useIdleCursor } from './useIdleCursor.ts';
import { chooseView, hasWebGL2, isTv, parseView, readView, storeView, type View } from './view.ts';
import { getViewer, isDate, type ViewerState } from './viewer.ts';

// Lazy chunks: viewers of the map never download them.
const DebugPage = lazy(() => import('../debug/DebugPage.tsx'));
const Scheme = lazy(() => import('../scheme/Scheme.tsx'));

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

/**
 * The map: the scene of the game (stage 3) or the 2D scheme (GFX-6) under the HUD. The scheme
 * without WebGL 2, by `?view=2d`, or by the viewer's choice when the scene offers it at the bottom
 * of the quality ladder (D-45); the choice is remembered.
 */
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

  const [webgl] = useState(hasWebGL2);
  const [chosen, setChosen] = useState(readView);
  const forced = parseView(route.query.view);
  // A link's `?view=` is the choice from now on, also after the link drops it.
  if (forced && forced !== chosen) setChosen(forced);
  useEffect(() => {
    if (forced) storeView(forced);
  }, [forced]);
  // The scene's level of the quality ladder: the remembered one until the scene reports (D-45).
  const [level, setLevel] = useState(() => readStoredLevel() ?? 0);
  const bottom = qualityAt(level, 1).offerScheme;
  // `?mode=tv` (PERF-5): a wall screen; nobody there can press «Включить простую схему».
  const tv = isTv(route.query);
  const view = chooseView({ forced, chosen: tv && bottom ? '2d' : chosen, webgl });
  const cursorHidden = useIdleCursor(tv);
  const pick = useCallback(
    (next: View) => {
      storeView(next);
      setChosen(next);
      // The link's `?view=` would keep forcing the old one.
      if (route.query.view) {
        const query = Object.fromEntries(Object.entries(route.query).filter(([k]) => k !== 'view'));
        window.location.replace(formatHash({ path: route.path, query }));
      }
    },
    [route],
  );

  const { sync, game } = state;
  if (sync.phase === 'ready' && game) {
    const { config } = sync.loaded.input;
    return (
      <main
        className={`relative h-full w-full bg-gray-900 ${cursorHidden ? 'sq-cursor-none' : ''}`}
      >
        {view === '3d' ? (
          <GameScene game={game} config={config} tv={tv} onLevel={setLevel} />
        ) : (
          <Suspense fallback={<div className="sq-screen absolute inset-0" />}>
            <Scheme game={game} config={config} />
          </Suspense>
        )}
        <Hud
          game={game}
          config={config}
          checkedAt={sync.checkedAt}
          notice={sync.notice}
          view={view}
          tv={tv}
          offerScheme={view === '3d' && bottom}
          canUse3d={webgl}
          onView={pick}
        />
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
