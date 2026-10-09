import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HEROES } from '../src/scene/heroCatalog.ts';
import { KAYKIT } from './lib/assets.ts';

// `npm run fetch-assets` (GFX-SRC-3, D-41): the hero pack's sources at the pinned commit into the
// git-ignored `assets-src/`, for `npm run assets`. A download — run it after the author's "yes" (D-3).

const files = [
  'LICENSE.txt',
  ...Object.values(HEROES).map((h) => `Characters/gltf/${h.source}.glb`),
];

async function fetchWithRetry(url: string, tries = 4): Promise<ArrayBuffer> {
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.arrayBuffer();
    } catch (error) {
      if (i >= tries) throw new Error(`${url}: ${String(error)}`, { cause: error });
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

for (const file of files) {
  const url = `https://raw.githubusercontent.com/${KAYKIT.repo}/${KAYKIT.commit}/${KAYKIT.root}/${file}`;
  const out = join('assets-src', KAYKIT.dir, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await fetchWithRetry(url)));
  console.log(`${out}`);
}
