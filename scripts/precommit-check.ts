import { execFileSync } from 'node:child_process';
import { findViolations, parseStagedDiff } from './lib/precommit.ts';

const diff = execFileSync('git', ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const problems = findViolations(parseStagedDiff(diff));
if (problems.length > 0) {
  console.error(`pre-commit: коммит остановлен\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
