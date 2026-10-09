import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { budgetProblems, type Manifest } from './lib/assets.ts';

// `npm run check:assets` (GFX-PIPE-3, §12.1): the committed assets keep their budgets, and the
// manifest tells the truth about the files' sizes.

const DIR = 'src/assets';
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as Manifest;
const problems = budgetProblems(manifest);
for (const asset of [...manifest.board, ...manifest.heroes]) {
  const path = join(DIR, asset.file);
  if (!existsSync(path)) problems.push(`${asset.file}: файла нет`);
  else if (statSync(path).size !== asset.bytes)
    problems.push(`${asset.file}: размер не совпадает с манифестом — перезапустите npm run assets`);
}
// A file the manifest does not list escapes the size and licence checks.
const listed = new Set([
  'manifest.json',
  ...[...manifest.board, ...manifest.heroes].map((a) => a.file),
]);
for (const entry of readdirSync(DIR, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = relative(DIR, join(entry.parentPath, entry.name)).split(sep).join('/');
  if (!listed.has(file)) problems.push(`${file}: нет в манифесте`);
}
if (problems.length > 0) {
  console.error(`check:assets — нашлись проблемы:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('check:assets — ассеты в бюджете');
