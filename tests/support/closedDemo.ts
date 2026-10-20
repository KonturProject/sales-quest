import { DEMO_DATA } from '../../scripts/lib/dataDirs.ts';
import { commitChange, loadRepoState } from '../../src/admin/pipeline.ts';
import type { EngineInput } from '../../src/engine/prepare.ts';
import { FakeGitHubRepo } from './fakeGitHub.ts';

/** The public demo phrase (D-32). */
export const DEMO_PHRASE = 'sales-quest-demo';

/** A fake repo of the demo: what the site serves through `serveSiteData`. */
export const demoRepo = () => FakeGitHubRepo.fromDir(DEMO_DATA);

/**
 * The demo changed through the admin's own commit path (D-59 tests): close it, reopen it, add a record —
 * the site then serves the new head, as after a real «Записать».
 */
export async function commitDemo(
  fake: FakeGitHubRepo,
  edit: (input: EngineInput) => EngineInput,
  now: string,
  message = 'тест',
): Promise<void> {
  const state = await loadRepoState(fake, DEMO_PHRASE, new Map());
  await commitChange(fake, state, edit(state.input), {
    phrase: DEMO_PHRASE,
    keys: new Map(),
    message,
    by: 'test',
    now,
  });
}
