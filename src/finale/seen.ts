/**
 * The closing whose ceremony this browser played (D-59): a page opened later shows the results at once; a new
 * closing (another `closedAt`) plays it again. One season — the latest — in `localStorage`, every access in
 * try/catch: without storage the ceremony plays on every visit.
 */
const KEY = 'sq.finale.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readFinaleSeen(
  seasonId: string,
  store: Store | null = browserStorage(),
): string | null {
  try {
    const all = JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const at = all[seasonId];
    return typeof at === 'string' ? at : null;
  } catch {
    return null;
  }
}

export function writeFinaleSeen(
  seasonId: string,
  closedAt: string,
  store: Store | null = browserStorage(),
): void {
  try {
    store?.setItem(KEY, JSON.stringify({ [seasonId]: closedAt }));
  } catch {
    // No storage: the ceremony plays again next time — the game itself is not touched.
  }
}
