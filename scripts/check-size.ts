import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BASE_PATH } from './lib/site.ts';
import { INITIAL_JS_BUDGET_BYTES, collectInitialJs, toDistPath } from './lib/size.ts';

const DIST = 'dist';
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const files = collectInitialJs(html).map((url) => toDistPath(url, BASE_PATH));
if (files.length === 0) {
  console.error('size: no initial JS in dist/index.html — run `npm run build` first');
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const gz = gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
  total += gz;
  console.log(`${kb(gz).padStart(10)}  ${file}`);
}
console.log(`initial JS (gzip): ${kb(total)} of ${kb(INITIAL_JS_BUDGET_BYTES)}`);
if (total > INITIAL_JS_BUDGET_BYTES) {
  console.error('size: over the PERF-BUDGET limit for initial JS');
  process.exit(1);
}
