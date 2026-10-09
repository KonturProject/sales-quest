import {
  BufferAttribute,
  Color,
  Matrix4,
  MeshLambertMaterial,
  SkinnedMesh,
  type Bone,
  type BufferGeometry,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TIMING, type Plan } from './choreography.ts';
import type { CLIPS } from './heroCatalog.ts';

/**
 * The heroes on the board (D-41): one skinned mesh per hero — one draw call — in the team colour,
 * posed from the move plan rather than from a clock, so a hero at rest costs no frames (PERF-1).
 */

/** A hero, helmet to boots, in world units at figure scale 1. */
export const HERO_HEIGHT = 1.55;
/** Height of the pack's knight: the scale every hero shares (a mage's hat may stand taller). */
export const SOURCE_HEIGHT = 2.44;
/** Facing the viewer at rest, turned this much towards the way ahead. */
export const REST_TURN = 0.45;
export const CHEER_MS = TIMING.cheerMs;
/** One loop of the run on long walks, where a hop would be too short to read. */
export const RUN_CYCLE_MS = 600;
/** Hops shorter than this run instead (a reset, a big import). */
export const MIN_HOP_MS = 250;

export type ClipKey = keyof typeof CLIPS;
/** Which clip and how far through it (0…1). */
export type HeroAction = { clip: ClipKey; phase: number };

/** What a hero does at `t` of the plan: hops cell by cell, runs a long walk, cheers at a gate. */
export function heroAction(plan: Plan, teamId: string, t: number): HeroAction {
  const move = plan.moves.find((m) => m.teamId === teamId);
  if (!move || t < move.start) return { clip: 'idle', phase: 0 };
  if (t < move.end) {
    if (move.hopMs >= MIN_HOP_MS) {
      const hops = (t - move.start) / move.hopMs;
      return { clip: 'hop', phase: hops - Math.floor(hops) };
    }
    return { clip: 'run', phase: ((t - move.start) % RUN_CYCLE_MS) / RUN_CYCLE_MS };
  }
  if (move.cheer && t < move.end + CHEER_MS)
    return { clip: 'cheer', phase: (t - move.end) / CHEER_MS };
  return { clip: 'idle', phase: 0 };
}

/**
 * Where a hero looks (radians around y, 0 = +z): along the hop while it moves, else at the
 * viewer (camera yaw), turned a little towards the way ahead.
 */
export function heroYaw(step: { dx: number; dz: number } | null, cameraYawDeg: number): number {
  if (step && Math.hypot(step.dx, step.dz) > 1e-6) return Math.atan2(step.dx, step.dz);
  return (cameraYawDeg * Math.PI) / 180 + REST_TURN;
}

const TEAM_MASK = 'teamMask';

/**
 * Merges the hero's kept parts into one skinned mesh in place (D-41): the skinned body parts and
 * the rigid pieces hung on bones (helmet, cape, weapons) — those get weight 1 on their bone. The
 * cape gets the team-colour mask. Parts not in `keep` are dropped. Returns the merged mesh.
 */
export function mergeHero(root: Object3D, keep: ReadonlySet<string>, cape: string): SkinnedMesh {
  root.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  const base = meshes.find((m) => (m as SkinnedMesh).isSkinnedMesh && keep.has(m.name)) as
    SkinnedMesh | undefined;
  if (!base) throw new Error('mergeHero: no skinned body among the kept parts');
  const bones = base.skeleton.bones;
  const toMerged = base.bindMatrix.clone().invert();
  const parts: BufferGeometry[] = [];
  const map = (base.material as { map?: unknown }).map ?? null;

  const found = new Set(meshes.map((m) => m.name));
  const absent = [...keep].filter((name) => !found.has(name));
  if (absent.length > 0) throw new Error(`mergeHero: no mesh named ${absent.join(', ')}`);

  for (const mesh of meshes) {
    if (!keep.has(mesh.name)) continue;
    // One material for the merged hero: a part with another texture would take the body's.
    if (((mesh.material as { map?: unknown }).map ?? null) !== map)
      throw new Error(`mergeHero: ${mesh.name} has a texture of its own`);
    const g = mesh.geometry.clone();
    let placed: Matrix4;
    const n = g.getAttribute('position').count;
    const skinned = (mesh as SkinnedMesh).isSkinnedMesh ? (mesh as SkinnedMesh) : null;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    if (skinned) {
      // Into the merged bind space; joint numbers of this part's skeleton → the body's, whose
      // inverse bind matrices the merged mesh uses: they must be the same.
      placed = toMerged.clone().multiply(skinned.bindMatrix);
      const remap = skinned.skeleton.bones.map((b) => bones.indexOf(b));
      remap.forEach((j, i) => {
        const own = skinned.skeleton.boneInverses[i];
        const body = base.skeleton.boneInverses[j];
        if (
          j >= 0 &&
          own &&
          body &&
          !own.elements.every((e, k) => Math.abs(e - body.elements[k]!) < 1e-5)
        )
          throw new Error(`mergeHero: ${mesh.name} binds its bones otherwise than the body`);
      });
      const si = g.getAttribute('skinIndex');
      const sw = g.getAttribute('skinWeight');
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          const j = remap[si.getComponent(i, k)] ?? -1;
          if (j < 0 && w > 0)
            throw new Error(`mergeHero: ${mesh.name} is bound to a bone the body does not have`);
          index[i * 4 + k] = Math.max(j, 0);
          weight[i * 4 + k] = w;
        }
    } else {
      // A rigid piece follows its bone: v' = bind⁻¹ · boneInverse⁻¹ · boneWorld⁻¹ · pieceWorld · v.
      let bone: Object3D | null = mesh.parent;
      while (bone && !(bone as Bone).isBone) bone = bone.parent;
      const j = bone ? bones.indexOf(bone as Bone) : -1;
      if (j < 0) throw new Error(`mergeHero: ${mesh.name} hangs on no bone of the body`);
      const inverse = base.skeleton.boneInverses[j] as Matrix4;
      placed = toMerged
        .clone()
        .multiply(inverse.clone().invert())
        .multiply((bone as Object3D).matrixWorld.clone().invert())
        .multiply(mesh.matrixWorld);
      for (let i = 0; i < n; i++) {
        index[i * 4] = j;
        weight[i * 4] = 1;
      }
    }
    g.applyMatrix4(placed);
    if (!g.index) g.setIndex([...Array(n).keys()]);
    // A mirrored piece turns inside out under back-face culling: turn its triangles back.
    if (placed.determinant() < 0) {
      const tri = g.index as BufferAttribute;
      for (let i = 0; i + 2 < tri.count; i += 3) {
        const b = tri.getX(i + 1);
        tri.setX(i + 1, tri.getX(i + 2));
        tri.setX(i + 2, b);
      }
    }
    g.setAttribute('skinIndex', new BufferAttribute(index, 4));
    g.setAttribute('skinWeight', new BufferAttribute(weight, 4));
    g.setAttribute(
      TEAM_MASK,
      new BufferAttribute(new Float32Array(n).fill(mesh.name === cape ? 1 : 0), 1),
    );
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight', TEAM_MASK].includes(name))
        g.deleteAttribute(name);
    parts.push(g);
  }

  const geometry = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!geometry) throw new Error('mergeHero: the parts do not merge');
  const merged = new SkinnedMesh(geometry, base.material);
  merged.name = 'hero';
  merged.bind(base.skeleton, base.bindMatrix);
  (base.parent ?? root).add(merged);
  for (const mesh of meshes) mesh.removeFromParent();
  return merged;
}

/** The hero's material: its texture, the cape in the team colour keeping its shading (GFX-CHAR-3). */
export function heroMaterial(map: Texture | null, teamColor: string): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ map });
  const color = new Color(teamColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.teamColor = { value: color };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float ${TEAM_MASK};\nvarying float vTeamMask;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTeamMask = ${TEAM_MASK};`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 teamColor;\nvarying float vTeamMask;',
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'float sqLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
          'diffuseColor.rgb = mix(diffuseColor.rgb, teamColor * (0.55 + 0.9 * sqLuma), vTeamMask);',
        ].join('\n'),
      );
  };
  // One program for every hero: the colour is a uniform.
  material.customProgramCacheKey = () => 'sq-hero';
  return material;
}
