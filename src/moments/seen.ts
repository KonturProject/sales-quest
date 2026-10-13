import type { Snapshot } from './snapshot.ts';

/**
 * The snapshot this browser showed last (D-56): «Что нового с вашего прошлого визита». One season — the
 * latest — in `localStorage`, every access in try/catch: without storage the game works, it only forgets.
 */
const KEY = 'sq.seen.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readSeen(
  seasonId: string,
  store: Store | null = browserStorage(),
): Snapshot | null {
  try {
    const all = JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, Partial<Snapshot>>;
    const s = all[seasonId];
    const ok =
      s !== undefined &&
      s.seasonId === seasonId &&
      typeof s.key === 'string' &&
      typeof s.trackLength === 'number' &&
      Array.isArray(s.teams) &&
      Array.isArray(s.managers) &&
      typeof s.unlocks === 'object' &&
      s.unlocks !== null;
    return ok ? (s as Snapshot) : null;
  } catch {
    return null;
  }
}

export function writeSeen(snapshot: Snapshot, store: Store | null = browserStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ [snapshot.seasonId]: snapshot }));
  } catch {
    // A full or blocked storage only costs «Что нового» after a reload.
  }
}
