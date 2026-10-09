import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, MeshBasicMaterial, type Material } from 'three';
import { PANEL_DEPTH, PANEL_WIDTH, type Layout } from './layout.ts';
import { FLOOR_TILE, WOOD_TILE, floorTexture, woodTexture } from './surfaces.ts';
import { panelRows, rectMinus, tablePlan, type Rect } from './table.ts';
import { BOARD_BACKGROUND } from './themes.ts';

/**
 * Under and around the board (D-43): the board's slab in the panels' mist colour, a wooden table,
 * the room's stone floor below. Static: five draw calls. Each surface leaves a hole where the next
 * one lies on it and the sides are walls without lids — no pixel is shaded twice (QA-4), and unlit
 * materials keep software rendering cheap; the painted art is unlit too.
 */

const SEAM = 0.03;

/** Flat rectangles at height `y`, one geometry; UVs in world units / `tile`, so textures run on. */
function flat(rects: readonly Rect[], y: number, tile: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const r of rects) {
    const corners = [
      [r.minX, r.maxZ],
      [r.maxX, r.maxZ],
      [r.maxX, r.minZ],
      [r.minX, r.minZ],
    ] as const;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, z] = corners[i] as readonly [number, number];
      pos.push(x, y, z);
      uv.push(x / tile, -z / tile);
    }
  }
  return geometry(pos, uv, rects.length * 6, [0, 1, 0]);
}

/** The four outer walls of a rectangle from `bottom` to `top`, facing out. */
function walls(r: Rect, top: number, bottom: number, tile: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const sides: [[number, number], [number, number], [number, number]][] = [
    [
      [r.minX, r.maxZ],
      [r.maxX, r.maxZ],
      [0, 1],
    ], // front
    [
      [r.maxX, r.maxZ],
      [r.maxX, r.minZ],
      [1, 0],
    ], // right
    [
      [r.maxX, r.minZ],
      [r.minX, r.minZ],
      [0, -1],
    ], // back
    [
      [r.minX, r.minZ],
      [r.minX, r.maxZ],
      [-1, 0],
    ], // left
  ];
  for (const [[ax, az], [bx, bz], [nx, nz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const quad = [
      [ax, bottom, az, 0, 0],
      [bx, bottom, bz, len, 0],
      [bx, top, bz, len, top - bottom],
      [ax, top, az, 0, top - bottom],
    ] as const;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z, u, v] = quad[i] as readonly [number, number, number, number, number];
      pos.push(x, y, z);
      uv.push(u / tile, v / tile);
      nor.push(nx, 0, nz);
    }
  }
  const g = geometry(pos, uv, 24);
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  return g;
}

function geometry(pos: number[], uv: number[], count: number, normal?: [number, number, number]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  if (normal)
    g.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(Array.from({ length: count }, () => normal).flat()), 3),
    );
  g.computeBoundingSphere();
  return g;
}

export function Table({ layout }: { layout: Layout }) {
  const plan = useMemo(() => tablePlan(layout.bounds), [layout.bounds]);
  const parts = useMemo(() => {
    const wood = woodTexture();
    const floor = floorTexture();
    // Holes a hair smaller than what covers them: no seam of background between two surfaces.
    const under = (r: Rect): Rect => ({
      minX: r.minX + SEAM,
      maxX: r.maxX - SEAM,
      minZ: r.minZ + SEAM,
      maxZ: r.maxZ - SEAM,
    });
    const rows = panelRows(layout.panels, PANEL_WIDTH, PANEL_DEPTH).map(under);
    const geometries = {
      slabTop: flat(rectMinus(plan.slab, rows), plan.slab.top, 1),
      slabSides: walls(plan.slab, plan.slab.top, plan.slab.bottom, 1),
      tableTop: flat(rectMinus(plan.table, [under(plan.slab)]), plan.table.top, WOOD_TILE),
      tableSides: walls(plan.table, plan.table.top, plan.table.bottom, WOOD_TILE / 4),
      floor: flat(rectMinus(plan.floor, [under(plan.table)]), plan.floor.y, FLOOR_TILE),
    };
    const materials = {
      // The slab's top meets the panels' faded edges in exactly their colour.
      slabTop: new MeshBasicMaterial({ color: BOARD_BACKGROUND, toneMapped: false }),
      slabSides: new MeshBasicMaterial({ color: '#16202a', toneMapped: false }),
      tableTop: new MeshBasicMaterial({ map: wood, color: '#e6cfb4', toneMapped: false }),
      tableSides: new MeshBasicMaterial({ map: wood, color: '#7d634d', toneMapped: false }),
      floor: new MeshBasicMaterial({ map: floor, color: '#a0a0a0', toneMapped: false }),
    };
    return {
      geometries,
      materials,
      dispose: () => {
        for (const g of Object.values(geometries)) g.dispose();
        for (const m of Object.values(materials) as Material[]) m.dispose();
        wood.dispose();
        floor.dispose();
      },
    };
  }, [plan, layout.panels]);
  useEffect(() => () => parts.dispose(), [parts]);
  const { geometries: g, materials: m } = parts;
  return (
    <group>
      <mesh geometry={g.slabTop} material={m.slabTop} />
      <mesh geometry={g.slabSides} material={m.slabSides} />
      <mesh geometry={g.tableTop} material={m.tableTop} />
      <mesh geometry={g.tableSides} material={m.tableSides} />
      <mesh geometry={g.floor} material={m.floor} />
    </group>
  );
}
