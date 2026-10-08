import {
  browserCache,
  forgetPhrase as dropPhrase,
  readPhrase,
  writePhrase,
} from '../data/cache.ts';
import type { KeyCache } from '../data/crypto.ts';
import { PagesSource } from '../data/storage.ts';
import { createSync, type Sync, type SyncState } from '../data/sync.ts';
import { localTimestamp } from '../data/time.ts';
import { computeGameState, type GameState } from '../engine/gameState.ts';
import { takePhrase } from './access.ts';
import { formatHash, parseHash } from './router.ts';
import { createStore, type Store } from './store.ts';

export type ViewerState = {
  sync: SyncState;
  game: GameState | null;
  /** A day to show instead of today (`?date=` of the debug page), or null. */
  date: string | null;
  computeMs: number | null;
};

export type Viewer = {
  store: Store<ViewerState>;
  setPhrase(phrase: string): void;
  forgetPhrase(): void;
  refresh(): void;
  setDate(date: string | null): void;
};

let viewer: Viewer | null = null;

/** The one viewer of the page: data sync → engine → store (ARCH-2, SYNC-1…4). */
export function getViewer(): Viewer {
  return (viewer ??= startViewer());
}

function startViewer(): Viewer {
  const store = createStore<ViewerState>({
    sync: { phase: 'loading' },
    game: null,
    date: null,
    computeMs: null,
  });
  const keys: KeyCache = new Map();
  let phrase = readPhrase();
  let computedFor = '';
  let sync: Sync | null = null;

  // SEC-7: a phrase in the opening link goes to storage and leaves the address bar at once.
  const fromLink = takePhrase(parseHash(window.location.hash));
  if (fromLink.phrase) {
    phrase = fromLink.phrase;
    writePhrase(phrase);
    window.history.replaceState(window.history.state, '', formatHash(fromLink.route));
  }

  /** "Now" for the engine: the local time, or the end of the chosen day (D-11, D-35). */
  const nowFor = (date: string | null) => {
    const now = localTimestamp(new Date());
    return date === null ? now : `${date}T23:59:00${now.slice(19)}`;
  };

  // The engine runs on new data or a new day only, not on every poll (BACKLOG, ARCH-2).
  const update = (next: SyncState) => {
    const state = store.get();
    let { game, computeMs } = state;
    if (next.phase === 'ready') {
      const now = nowFor(state.date);
      const key = `${next.loaded.version.rev}|${now.slice(0, 10)}`;
      if (key !== computedFor) {
        const started = performance.now();
        game = computeGameState(next.loaded.input, now);
        computeMs = performance.now() - started;
        computedFor = key;
      }
    } else if (next.phase !== 'loading') {
      game = null;
      computedFor = '';
    }
    store.set({ ...state, sync: next, game, computeMs });
  };

  const restart = () => {
    sync?.stop();
    computedFor = '';
    sync = createSync({
      source: new PagesSource(`${import.meta.env.BASE_URL}data/`),
      phrase: () => phrase,
      cache: browserCache,
      keys,
      intervalSec: 60,
      timers: {
        set: (run, ms) => window.setTimeout(run, ms),
        clear: (id) => window.clearTimeout(id as number),
      },
      now: () => new Date(),
      onState: update,
    });
    void sync.start();
  };
  restart();

  return {
    store,
    setPhrase(next) {
      // The same link opened again (or an effect run twice) is not a reason to reload.
      if (next === phrase && store.get().sync.phase !== 'wrong-phrase') return;
      phrase = next;
      writePhrase(next);
      restart();
    },
    forgetPhrase() {
      phrase = null;
      dropPhrase();
      restart();
    },
    refresh() {
      void sync?.refresh();
    },
    setDate(date) {
      const state = store.get();
      if (state.date === date) return;
      store.set({ ...state, date });
      computedFor = '';
      update(state.sync);
    },
  };
}
