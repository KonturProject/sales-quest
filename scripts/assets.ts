import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO, getBounds, type Document } from '@gltf-transform/core';
import { dedup, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { CLIPS, HEROES, VARIANTS, type Hero } from '../src/scene/heroCatalog.ts';
import { BOARD_BACKGROUND, PANEL_ASPECT } from '../src/scene/themes.ts';
import {
  BOARD_SOURCES,
  BOARD_WIDTH,
  BUDGET,
  HERO_TEXTURE,
  KAYKIT,
  budgetProblems,
  fadeEdges,
  hexToRgb,
  type Manifest,
} from './lib/assets.ts';

// `npm run assets` (GFX-PIPE, D-41): the author's panels from `refs/board/` and the KayKit heroes
// from `assets-src/` (`npm run fetch-assets`) → optimized files and the manifest in `src/assets/`.
// Both sources stay out of git; the results are committed.

const OUT = 'src/assets';
const MANIFEST = join(OUT, 'manifest.json');

async function board(): Promise<Manifest['board']> {
  mkdirSync(join(OUT, 'board'), { recursive: true });
  const out: Manifest['board'] = [];
  for (const [theme, source] of Object.entries(BOARD_SOURCES)) {
    const path = join('refs/board', source);
    const meta = await sharp(path).metadata();
    const aspect = (meta.width ?? 0) / (meta.height ?? 1);
    if (Math.abs(aspect / PANEL_ASPECT - 1) > 0.01)
      throw new Error(`${path}: пропорции ${meta.width}×${meta.height}, нужны 11:6 (1408×768)`);
    const height = Math.round(BOARD_WIDTH / PANEL_ASPECT);
    const { data, info } = await sharp(path)
      .resize(BOARD_WIDTH, height, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    fadeEdges(pixels, info.width, info.height, info.channels, hexToRgb(BOARD_BACKGROUND));
    const file = `board/${theme}.webp`;
    await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .webp({ quality: 82, effort: 6 })
      .toFile(join(OUT, file));
    out.push({
      theme,
      source,
      file,
      width: info.width,
      height: info.height,
      bytes: statSync(join(OUT, file)).size,
      licence: 'own (D-37)',
    });
  }
  return out;
}

const triangles = (doc: Document, names: string[]) =>
  doc
    .getRoot()
    .listNodes()
    .filter((n) => names.includes(n.getName()))
    .reduce(
      (sum, n) =>
        sum +
        (n.getMesh()?.listPrimitives() ?? []).reduce(
          (s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3,
          0,
        ),
      0,
    );

/** The file trimmed to the kept clips and pieces, simplified by `ratio`. */
async function trimmed(hero: Hero, ratio: number): Promise<Document> {
  const io = new NodeIO();
  const doc = await io.read(
    join('assets-src', KAYKIT.dir, 'Characters/gltf', `${hero.source}.glb`),
  );
  const root = doc.getRoot();
  const clips = new Set<string>(Object.values(CLIPS));
  // An animation's samplers outlive it and keep their keyframes: dispose of them too.
  for (const a of root.listAnimations())
    if (!clips.has(a.getName())) {
      for (const c of a.listChannels()) c.dispose();
      for (const sampler of a.listSamplers()) sampler.dispose();
      a.dispose();
    }
  const keep = new Set([
    ...hero.base,
    ...VARIANTS.filter((v) => v.hero === hero.id).flatMap((v) => v.pieces),
  ]);
  // Nodes only: a mesh may be shared with a kept node (review 3b); prune() drops the orphans.
  for (const node of root.listNodes())
    if (node.getMesh() && !keep.has(node.getName())) node.dispose();
  const missing = [...keep].filter((name) => !root.listNodes().some((n) => n.getName() === name));
  if (missing.length > 0) throw new Error(`${hero.source}: нет частей ${missing.join(', ')}`);
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true }),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 })] : []),
    resample(),
    prune({ keepLeaves: true }),
    textureCompress({ encoder: sharp, resize: [HERO_TEXTURE, HERO_TEXTURE] }),
  );
  const empty = [...keep].filter((name) => triangles(doc, [name]) === 0);
  if (empty.length > 0) throw new Error(`${hero.source}: без геометрии ${empty.join(', ')}`);
  return doc;
}

async function heroes(): Promise<Manifest['heroes']> {
  await MeshoptSimplifier.ready;
  mkdirSync(join(OUT, 'heroes'), { recursive: true });
  const out: Manifest['heroes'] = [];
  for (const hero of Object.values(HEROES)) {
    const variants = VARIANTS.filter((v) => v.hero === hero.id);
    // The mildest simplification that keeps every variant within the figure budget (§12.1).
    let ratio = 1;
    let doc = await trimmed(hero, ratio);
    const worst = (d: Document) =>
      Math.max(...variants.map((v) => triangles(d, [...hero.base, ...v.pieces])));
    while (worst(doc) > BUDGET.heroTriangles * 0.95 && ratio > 0.2) {
      ratio = Math.round((ratio - 0.05) * 100) / 100;
      doc = await trimmed(hero, ratio);
    }
    const root = doc.getRoot();
    const base = root.listNodes().filter((n) => hero.base.includes(n.getName()));
    const bounds = base.map((n) => getBounds(n));
    const height =
      Math.max(...bounds.map((b) => b.max[1])) - Math.min(...bounds.map((b) => b.min[1]));
    const texture = root.listTextures()[0]?.getSize() ?? [0, 0];
    const file = `heroes/${hero.id}.glb`;
    await new NodeIO().write(join(OUT, file), doc);
    out.push({
      hero: hero.id,
      file,
      bytes: statSync(join(OUT, file)).size,
      texture: { width: texture[0], height: texture[1] },
      clips: root.listAnimations().map((a) => a.getName()),
      height: Math.round(height * 1000) / 1000,
      variants: variants.map((v) => ({
        id: v.id,
        triangles: triangles(doc, [...hero.base, ...v.pieces]),
      })),
      pack: `${KAYKIT.pack}, ${KAYKIT.author}`,
      licence: KAYKIT.licence,
    });
    console.log(`${hero.id}: упрощение ×${ratio}, ${out.at(-1)?.bytes} Б`);
  }
  return out;
}

const only = process.argv[2];
const previous: Manifest = existsSync(MANIFEST)
  ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest)
  : { board: [], heroes: [] };
const manifest: Manifest = {
  board: only === 'heroes' ? previous.board : await board(),
  heroes: only === 'board' ? previous.heroes : await heroes(),
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
const problems = budgetProblems(manifest);
for (const p of problems) console.error(`  - ${p}`);
console.log(problems.length === 0 ? 'assets: бюджеты соблюдены' : 'assets: бюджеты нарушены');
process.exit(problems.length === 0 ? 0 : 1);
