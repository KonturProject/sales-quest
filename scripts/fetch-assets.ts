import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { HEROES } from '../src/scene/heroCatalog.ts';
import { KAYKIT, MODEL_SOURCES, PACKS } from './lib/assets.ts';

// `npm run fetch-assets` (GFX-SRC-3, D-41, D-44): the KayKit sources at their pinned commits into the
// git-ignored `assets-src/`, for `npm run assets` — the heroes, the table's props, the locations'
// decor, each `.gltf` with the buffers and textures it names. A download: after the author's "yes"
// (D-3).

const packs = [KAYKIT, PACKS.medieval, PACKS.dungeon];

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

/** `dir/inner/path` under `assets-src/` → the file in its pack's repository at the pinned commit. */
async function get(source: string): Promise<string> {
  const pack = packs.find((p) => source.startsWith(`${p.dir}/`));
  if (!pack) throw new Error(`fetch-assets: no pack for ${source}`);
  const inner = source.slice(pack.dir.length + 1);
  const url = `https://raw.githubusercontent.com/${pack.repo}/${pack.commit}/${pack.root}/${inner}`;
  const out = join('assets-src', source);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await fetchWithRetry(url)));
  console.log(out);
  return out;
}

const sources = new Set([
  `${KAYKIT.dir}/LICENSE.txt`,
  `${PACKS.medieval.dir}/LICENSE.txt`,
  `${PACKS.dungeon.dir}/Assets/LICENSE.txt`,
  ...Object.values(HEROES).map((h) => `${KAYKIT.dir}/Characters/gltf/${h.source}.glb`),
  ...Object.values(MODEL_SOURCES),
]);
for (const source of sources) {
  const out = await get(source);
  if (!source.endsWith('.gltf')) continue;
  // A .gltf names its buffers and textures beside it.
  const gltf = JSON.parse(readFileSync(out, 'utf8')) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
  };
  for (const { uri } of [...(gltf.buffers ?? []), ...(gltf.images ?? [])])
    if (uri && !uri.startsWith('data:')) await get(posix.join(posix.dirname(source), uri));
}
