/**
 * Where the site's `data/` comes from (plan 2a): the published game in `data/` — what the deploy
 * builds; the demo (D-32, fictional people, a public phrase) in `tests/fixtures/demo-data/` — what
 * the dev server, the tests and the screenshots use, so they never need the real game or its phrase.
 */
export const SITE_DATA = 'data';
export const DEMO_DATA = 'tests/fixtures/demo-data';

/** `check:data` checks both. */
export const dataDirs = [SITE_DATA, DEMO_DATA] as const;

/** The folder served and built as `data/`: `SQ_DATA_DIR`, else the game for a build, the demo for the dev server. */
export function dataDirFor(
  command: 'build' | 'serve',
  env: Record<string, string | undefined>,
): string {
  const forced = env.SQ_DATA_DIR?.trim();
  if (forced) return forced;
  return command === 'build' ? SITE_DATA : DEMO_DATA;
}
