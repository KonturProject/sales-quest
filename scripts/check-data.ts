import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { checkDataTree, scanTrackedFiles } from './lib/checkData.ts';

// `check:data` (D-34): the data tree by content, and the hook rules over every tracked file.

const DATA_DIR = 'data';

function dataFiles(): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(DATA_DIR)) return files;
  for (const entry of readdirSync(DATA_DIR, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(relative(DATA_DIR, full).split(sep).join('/'), readFileSync(full, 'utf8'));
  }
  return files;
}

function trackedFiles(): { path: string; text: string | null }[] {
  const list = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return list
    .split('\0')
    .filter((path) => path !== '' && existsSync(path))
    .map((path) => {
      const bytes = readFileSync(path);
      // A NUL in the first 8 KB: a binary file, only its path is checked.
      const binary = bytes.subarray(0, 8192).includes(0);
      return { path, text: binary ? null : bytes.toString('utf8') };
    });
}

const problems = [...(await checkDataTree(dataFiles())), ...scanTrackedFiles(trackedFiles())];
if (problems.length > 0) {
  console.error(`check:data — нашлись проблемы:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('check:data — данные и репозиторий в порядке');
