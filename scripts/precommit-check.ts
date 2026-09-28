import { execFileSync } from 'node:child_process';
import { findViolations, parseNameList, parseStagedDiff } from './lib/precommit.ts';

function git(args: string[]): string {
  // core.quotePath=false keeps non-ASCII (Cyrillic) paths readable instead of octal-escaped.
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Paths come from --name-only: a pure rename or a binary file has no `+++` header in the diff.
const paths = parseNameList(
  git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', '--no-renames']),
);
// Explicit prefixes: a user's diff.mnemonicPrefix / diff.noprefix would otherwise change `b/`.
const diff = git([
  'diff',
  '--cached',
  '-U0',
  '--no-color',
  '--no-ext-diff',
  '--no-renames',
  '--src-prefix=a/',
  '--dst-prefix=b/',
]);

const problems = findViolations(paths, parseStagedDiff(diff));
if (problems.length > 0) {
  console.error(`pre-commit: коммит остановлен\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
