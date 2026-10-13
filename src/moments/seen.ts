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
    const all = JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const s = all[seasonId];
    return isSnapshot(s) && s.seasonId === seasonId ? s : null;
  } catch {
    return null;
  }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const numbers = (v: unknown) => isObject(v) && Object.values(v).every(isNumber);

/** A snapshot of this code's shape, down to every team and operator (review D-56): another — none. */
function isSnapshot(s: unknown): s is Snapshot {
  return (
    isObject(s) &&
    typeof s.seasonId === 'string' &&
    typeof s.key === 'string' &&
    (s.dataAsOf === null || typeof s.dataAsOf === 'string') &&
    isNumber(s.trackLength) &&
    Array.isArray(s.teams) &&
    s.teams.every(
      (t: unknown) =>
        isObject(t) &&
        typeof t.teamId === 'string' &&
        isNumber(t.position) &&
        isNumber(t.points) &&
        isNumber(t.locationIndex),
    ) &&
    Array.isArray(s.managers) &&
    s.managers.every(
      (m: unknown) =>
        isObject(m) &&
        typeof m.managerId === 'string' &&
        typeof m.teamId === 'string' &&
        isNumber(m.points) &&
        isNumber(m.achievementPoints) &&
        numbers(m.totals),
    ) &&
    numbers(s.unlocks)
  );
}

export function writeSeen(snapshot: Snapshot, store: Store | null = browserStorage()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ [snapshot.seasonId]: snapshot }));
  } catch {
    // A full or blocked storage only costs «Что нового» after a reload.
  }
}
