import type { Mesh, Object3D } from 'three';
import { bakeScenery } from './scenery.ts';
import { propSpot, type PropSpot, type TablePlan } from './table.ts';

/**
 * The table's props as a few static meshes (D-43): each prop of the file placed on its spot, laid
 * flat or standing, resting on the table top; then merged by texture — one draw call per texture.
 */
export function buildProps(source: Object3D, plan: TablePlan, spots: readonly PropSpot[]): Mesh[] {
  return bakeScenery(
    source,
    spots.map((spot) => ({
      id: spot.id,
      ...propSpot(plan, spot),
      ground: plan.table.top,
      yaw: spot.yaw,
      lie: spot.lie,
      scale: spot.scale,
    })),
  );
}
