import type { Route } from './router.ts';

/**
 * The access phrase travels in the link fragment, `#/?k=<phrase>` (SEC-7): the browser never sends
 * it to the server. Returns the phrase and the route without it, to put back into the address bar.
 */
export function takePhrase(route: Route): { phrase: string | null; route: Route } {
  const { k, ...query } = route.query;
  const phrase = k?.trim() ? k.trim() : null;
  return { phrase, route: { path: route.path, query } };
}
