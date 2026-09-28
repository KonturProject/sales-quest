/** A parsed hash route: `#/leaderboard?week=2` → { path: '/leaderboard', query: { week: '2' } }. */
export type Route = {
  path: string;
  query: Record<string, string>;
};

/**
 * Parses `location.hash`. GitHub Pages has no index.html fallback for deep links, so all
 * routing lives in the fragment (DEP-3). The fragment also carries the access phrase
 * `#/?k=...` (SEC-7), which the browser never sends to the server.
 */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const pathPart = q === -1 ? raw : raw.slice(0, q);
  const queryPart = q === -1 ? '' : raw.slice(q + 1);
  return {
    path: normalizePath(pathPart),
    query: Object.fromEntries(new URLSearchParams(queryPart)),
  };
}

export function formatHash(route: { path: string; query?: Record<string, string> }): string {
  const qs = new URLSearchParams(route.query ?? {}).toString();
  return `#${normalizePath(route.path)}${qs ? `?${qs}` : ''}`;
}

function normalizePath(path: string): string {
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}
