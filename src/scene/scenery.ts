import {
  Box3,
  BufferAttribute,
  Color,
  Euler,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tint } from './decor.ts';

/**
 * Static scenery baked once (D-43, D-44): models of a file placed on their spots — turned, laid flat
 * or standing, scaled, resting on a height, recoloured by an optional tint — then merged by texture:
 * one draw call per texture for the whole table, one per texture for every location.
 */

export type Placement = {
  /** The model's node name in the file. */
  id: string;
  x: number;
  z: number;
  /** The height its lowest point rests on, plus `lift`. */
  ground: number;
  lift?: number;
  yaw: number;
  /** Laid flat (a book, a sword). */
  lie?: boolean;
  scale: number;
  /** Stretches the model along its own height before it is laid or turned (a gate's lintel). */
  stretch?: number;
  tint?: Tint;
};

const TINT = 'tint';

/** A model's size in the file: its height and its widest side across (for fitting it). */
export function sizeOf(source: Object3D, id: string): { height: number; width: number } | null {
  const node = source.getObjectByName(id);
  if (!node) return null;
  source.updateMatrixWorld(true);
  const box = new Box3().setFromObject(node);
  return {
    height: box.max.y - box.min.y,
    width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z),
  };
}

export function bakeScenery(source: Object3D, placements: readonly Placement[]): Mesh[] {
  source.updateMatrixWorld(true);
  const byMap = new Map<Texture | null, BufferGeometry[]>();
  const colour = new Color();
  for (const place of placements) {
    const node = source.getObjectByName(place.id);
    if (!node) {
      console.warn(`Нет модели «${place.id}» в файле сцены`);
      continue;
    }
    const turn = new Matrix4().makeRotationFromQuaternion(
      new Quaternion().setFromEuler(new Euler(place.lie ? -Math.PI / 2 : 0, place.yaw, 0, 'YXZ')),
    );
    const scale = new Matrix4().makeScale(
      place.scale,
      place.scale * (place.stretch ?? 1),
      place.scale,
    );
    const parts: { geometry: BufferGeometry; map: Texture | null }[] = [];
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry
        .clone()
        .applyMatrix4(new Matrix4().multiplyMatrices(turn, scale).multiply(mesh.matrixWorld));
      parts.push({ geometry, map: (mesh.material as { map?: Texture | null }).map ?? null });
    });
    // On its spot whatever the file's own offsets (centred), resting on the ground (its lowest point).
    const box = new Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
    }
    const y = place.ground + (place.lift ?? 0) - box.min.y;
    const dx = place.x - (box.min.x + box.max.x) / 2;
    const dz = place.z - (box.min.z + box.max.z) / 2;
    if (place.tint) colour.set(place.tint.color);
    for (const p of parts) {
      p.geometry.translate(dx, y, dz);
      for (const name of Object.keys(p.geometry.attributes))
        if (!['position', 'normal', 'uv'].includes(name)) p.geometry.deleteAttribute(name);
      const n = p.geometry.getAttribute('position').count;
      const tint = new Float32Array(n * 4);
      if (place.tint)
        for (let i = 0; i < n; i++)
          tint.set([colour.r, colour.g, colour.b, place.tint.amount], i * 4);
      p.geometry.setAttribute(TINT, new BufferAttribute(tint, 4));
      if (!p.geometry.index) p.geometry.setIndex([...Array(n).keys()]); // merge wants all indexed
      byMap.set(p.map, [...(byMap.get(p.map) ?? []), p.geometry]);
    }
  }
  const meshes: Mesh[] = [];
  for (const [map, geometries] of byMap) {
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (merged) meshes.push(new Mesh(merged, sceneryMaterial(map)));
    else console.warn('Модели сцены не слились в одну сетку: у частей разные атрибуты');
  }
  return meshes;
}

/** Lit like the heroes; a tint moves the colour towards its own, keeping the light and shade. */
export function sceneryMaterial(map: Texture | null): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ map });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec4 ${TINT};\nvarying vec4 vTint;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTint = ${TINT};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTint;')
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'float sqTintLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb * (0.45 + 0.8 * sqTintLuma), vTint.a);',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => 'sq-scenery';
  return material;
}
