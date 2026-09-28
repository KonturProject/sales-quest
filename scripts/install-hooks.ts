import { execFileSync } from 'node:child_process';

// Runs on `npm install` / `npm ci` (the `prepare` script). Outside a git checkout
// (for example an unpacked tarball) there is nothing to install.
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  // not a git checkout
}
