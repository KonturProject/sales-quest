import {
  Box3,
  Euler,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { propSpot, type PropSpot, type TablePlan } from './table.ts';

/**
 * The table's props as a few static meshes (D-43): each prop of the file placed on its spot, laid
 * flat or standing, resting on the table top; then merged by texture — one draw call per texture.
 */
export function buildProps(source: Object3D, plan: TablePlan, spots: readonly PropSpot[]): Mesh[] {
  source.updateMatrixWorld(true);
  const byMap = new Map<Texture | null, BufferGeometry[]>();
  for (const spot of spots) {
    const node = source.getObjectByName(spot.id);
    if (!node) continue;
    const at = propSpot(plan, spot);
    const turn = new Matrix4().makeRotationFromQuaternion(
      new Quaternion().setFromEuler(new Euler(spot.lie ? -Math.PI / 2 : 0, spot.yaw, 0, 'YXZ')),
    );
    const scale = new Matrix4().makeScale(spot.scale, spot.scale, spot.scale);
    const parts: { geometry: BufferGeometry; map: Texture | null }[] = [];
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry
        .clone()
        .applyMatrix4(new Matrix4().multiplyMatrices(turn, scale).multiply(mesh.matrixWorld));
      const map = (mesh.material as { map?: Texture | null }).map ?? null;
      parts.push({ geometry, map });
    });
    // Rest on the table: the lowest point of the prop on its top.
    const box = new Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
    }
    const lift = new Vector3(at.x, plan.table.top - box.min.y, at.z);
    for (const p of parts) {
      p.geometry.translate(lift.x, lift.y, lift.z);
      for (const name of Object.keys(p.geometry.attributes))
        if (!['position', 'normal', 'uv'].includes(name)) p.geometry.deleteAttribute(name);
      byMap.set(p.map, [...(byMap.get(p.map) ?? []), p.geometry]);
    }
  }
  const meshes: Mesh[] = [];
  for (const [map, geometries] of byMap) {
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (merged) meshes.push(new Mesh(merged, new MeshLambertMaterial({ map })));
  }
  return meshes;
}
