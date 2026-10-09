import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
if (problems.length > 0) {
  console.error(`check:assets — нашлись проблемы:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('check:assets — ассеты в бюджете');
