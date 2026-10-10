import { CLIPS } from '../../src/scene/heroCatalog.ts';

/**
 * The asset pipeline's pure parts (GFX-PIPE, D-41): where the sources are, how a panel's edges fade
 * into the board's mist, the manifest and its budgets (§12.1, GFX-PIPE-3).
 */

/** The author's painted panels, by theme: which variant of `refs/board/` the board uses (D-41). */
export const BOARD_SOURCES: Record<string, string> = {
  ruins: 'ruins1.jfif',
  ice: 'ice1.jfif',
  volcano: 'volcano1.jfif',
  heaven: 'heaven1.jfif',
};

/** Panels are resized to this width (atlases ≤ 1024², §12.1). */
export const BOARD_WIDTH = 1024;
/** Share of the width and of the height that fades into the background at each edge. */
export const BOARD_FADE = { x: 0.06, y: 0.08 };

export const KAYKIT = {
  pack: 'KayKit Character Pack: Adventurers 1.0',
  author: 'Kay Lousberg',
  licence: 'CC0-1.0',
  repo: 'KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
  commit: '672074b73ba276876a19e8816ecdc5241817ab47',
  /** Inside the repo. */
  root: 'addons/kaykit_character_pack_adventures',
  /** Under `assets-src/` (git-ignored). */
  dir: 'kaykit-adventurers-1.0',
};

/** The other KayKit packs (CC0, D-44): static models for the table and the locations. */
export const PACKS = {
  medieval: {
    pack: 'KayKit Medieval Hexagon Pack 1.0',
    repo: 'KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0',
    commit: '84fa4e91af6a88989be7c99e0891cede11f2ca38',
    root: 'addons/kaykit_medieval_hexagon_pack',
    dir: 'kaykit-medieval-hexagon-1.0',
  },
  dungeon: {
    pack: 'KayKit Dungeon Remastered 1.0',
    repo: 'KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0',
    commit: 'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07',
    root: 'addons/kaykit_dungeon_remastered',
    dir: 'kaykit-dungeon-remastered-1.0',
  },
} as const;

const adv = (id: string) => `${KAYKIT.dir}/Assets/gltf/${id}.gltf`;
const med = (id: string) => `${PACKS.medieval.dir}/Assets/gltf/decoration/nature/${id}.gltf`;
const dun = (id: string) => `${PACKS.dungeon.dir}/Assets/gltf/${id}.gltf.glb`;

/** Where each static model comes from, under `assets-src/` (its node there has the same name). */
export const MODEL_SOURCES: Record<string, string> = {
  ...Object.fromEntries(
    [
      'mug_full',
      'spellbook_open',
      'arrow_bundle',
      'quiver',
      'shield_round_color',
      'sword_2handed',
      'smokebomb',
    ].map((id) => [id, adv(id)]),
  ),
  ...Object.fromEntries(
    [
      'tree_single_A',
      'tree_single_B',
      'rock_single_C',
      'rock_single_E',
      'mountain_A',
      'mountain_B',
      'mountain_C',
      'cloud_big',
      'cloud_small',
    ].map((id) => [id, med(id)]),
  ),
  ...Object.fromEntries(
    [
      'pillar',
      'pillar_decorated',
      'column',
      'rubble_half',
      'torch_lit',
      'coin_stack_large',
      'coin_stack_medium',
      'candle_triple',
    ].map((id) => [id, dun(id)]),
  ),
};

/** Hero texture size: the pack's gradient atlas reads the same at 128² (its README). */
export const HERO_TEXTURE = 128;

export const BUDGET = {
  heroTriangles: 3000,
  textureSide: 1024,
  gpuTextureBytes: 64 * 1024 * 1024,
  totalBytes: 20 * 1024 * 1024,
};

const smooth = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};

/**
 * How much of the background a pixel at (x, y) of a w×h panel takes: 1 on the border, 0 past the
 * fade band, smooth in between — the nearest edge decides.
 */
export function edgeFade(x: number, y: number, w: number, h: number, band = BOARD_FADE): number {
  const dx = Math.min(x + 0.5, w - x - 0.5) / w / band.x;
  const dy = Math.min(y + 0.5, h - y - 0.5) / h / band.y;
  return 1 - smooth(Math.min(dx, dy));
}

/** Blends the edges of raw RGB(A) pixels into `rgb` in place. */
export function fadeEdges(
  pixels: Uint8Array,
  w: number,
  h: number,
  channels: number,
  rgb: [number, number, number],
  band = BOARD_FADE,
): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = edgeFade(x, y, w, h, band);
      if (k <= 0) continue;
      const i = (y * w + x) * channels;
      for (let c = 0; c < 3; c++) {
        const v = pixels[i + c] as number;
        pixels[i + c] = Math.round(v + ((rgb[c] as number) - v) * k);
      }
    }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type ManifestImage = { file: string; width: number; height: number; bytes: number };

export type Manifest = {
  board: (ManifestImage & { theme: string; source: string; licence: string })[];
  heroes: {
    hero: string;
    file: string;
    bytes: number;
    texture: { width: number; height: number };
    clips: string[];
    /** The body's height in the file's units (helmets and hats included). */
    height: number;
    variants: { id: string; triangles: number }[];
    pack: string;
    licence: string;
  }[];
  /** Static models: the table's props (D-43) and the locations' decor (D-44), a file each. */
  models?: {
    file: string;
    bytes: number;
    textures: { width: number; height: number }[];
    items: { id: string; triangles: number }[];
    pack: string;
    licence: string;
  }[];
};

const MIB = 1024 * 1024;

/**
 * Only CC0 or plain CC BY (GFX-SRC-1) — not -NC/-SA/-ND — or the author's own art, published with
 * permission (D-37).
 */
const LICENCES = /^(CC0-1\.0|CC-BY-\d\.\d|own \(D-37\))$/;

/** What breaks the §12.1 budgets; empty when all is well. */
export function budgetProblems(manifest: Manifest, budget = BUDGET): string[] {
  const problems: string[] = [];
  const props = manifest.models ?? [];
  const textures: { file: string; width: number; height: number }[] = [
    ...manifest.board,
    ...manifest.heroes.map((h) => ({ file: h.file, ...h.texture })),
    ...props.flatMap((p) => p.textures.map((t) => ({ file: p.file, ...t }))),
  ];
  for (const t of textures)
    if (t.width > budget.textureSide || t.height > budget.textureSide)
      problems.push(`${t.file}: текстура ${t.width}×${t.height} больше ${budget.textureSide}²`);
  // RGBA with mipmaps: × 4/3.
  const gpu = textures.reduce((s, t) => s + (t.width * t.height * 4 * 4) / 3, 0);
  if (gpu > budget.gpuTextureBytes)
    problems.push(
      `текстуры в GPU ${(gpu / MIB).toFixed(1)} МБ больше ${budget.gpuTextureBytes / MIB} МБ`,
    );
  for (const h of manifest.heroes)
    for (const v of h.variants)
      if (v.triangles > budget.heroTriangles)
        problems.push(`${v.id}: ${v.triangles} треугольников больше ${budget.heroTriangles}`);
  const total = [...manifest.board, ...manifest.heroes, ...props].reduce((s, a) => s + a.bytes, 0);
  if (total > budget.totalBytes)
    problems.push(`ассеты ${(total / MIB).toFixed(1)} МБ больше ${budget.totalBytes / MIB} МБ`);
  for (const a of [...manifest.board, ...manifest.heroes, ...props])
    if (!LICENCES.test(a.licence)) problems.push(`${a.file}: лицензия «${a.licence}»`);
  for (const h of manifest.heroes) {
    const missing = Object.values(CLIPS).filter((c) => !h.clips.includes(c));
    if (missing.length > 0) problems.push(`${h.file}: нет клипов ${missing.join(', ')}`);
  }
  return problems;
}
