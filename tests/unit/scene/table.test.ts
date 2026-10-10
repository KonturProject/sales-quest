import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../../src/engine/track.ts';
import { PANEL_DEPTH, PANEL_WIDTH, buildLayout } from '../../../src/scene/layout.ts';
import { buildProps } from '../../../src/scene/props.ts';
import {
  PROPS,
  panelRows,
  propSpot,
  rectMinus,
  tablePlan,
  type Rect,
} from '../../../src/scene/table.ts';
import { themeOf } from '../../../src/scene/themes.ts';
import { makeConfig } from '../../support/builders.ts';

const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
  Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
const track = buildTrack(
  { ...makeConfig(), track: { cellsPerWorkingDay: 3, overflowPct: 50 } },
  10,
);
const themes = ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf);

describe('rectMinus (D-43: no pixel shaded twice)', () => {
  it('covers the outer rectangle but its holes, exactly once', () => {
    const outer = { minX: 0, maxX: 100, minZ: 0, maxZ: 40 };
    const holes = [
      { minX: 10, maxX: 50, minZ: 5, maxZ: 15 },
      { minX: 30, maxX: 90, minZ: 20, maxZ: 30 },
      { minX: 95, maxX: 120, minZ: -5, maxZ: 10 }, // sticks out: clipped
    ];
    const parts = rectMinus(outer, holes);
    const clipped = 40 * 10 + 60 * 10 + 5 * 10;
    expect(parts.reduce((s, r) => s + area(r), 0)).toBeCloseTo(area(outer) - clipped);
    for (const p of parts) {
      for (const h of holes) expect(overlap(p, h)).toBe(0);
      for (const q of parts) if (q !== p) expect(overlap(p, q)).toBe(0);
    }
  });

  it('leaves the whole rectangle without holes', () => {
    const outer = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };
    expect(rectMinus(outer, [])).toEqual([outer]);
  });
});

describe('the table under the board (D-43)', () => {
  it('stacks the slab on the table and leaves the panels a hole in the slab', () => {
    const layout = buildLayout(track, themes);
    const plan = tablePlan(layout.bounds);
    expect(plan.slab.top).toBeLessThan(0);
    expect(plan.table.top).toBe(plan.slab.bottom);
    for (const k of ['minX', 'minZ'] as const) {
      expect(plan.table[k]).toBeLessThan(plan.slab[k]);
      expect(plan.slab[k]).toBeLessThan(layout.bounds[k]);
    }
    const rows = panelRows(layout.panels, PANEL_WIDTH, PANEL_DEPTH);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.maxX).toBeCloseTo(4 * PANEL_WIDTH);
    expect(
      panelRows(buildLayout(track, themes, 'snake').panels, PANEL_WIDTH, PANEL_DEPTH),
    ).toHaveLength(2);
  });

  it('puts the props off the slab, the ones in front lying flat', () => {
    const plan = tablePlan(buildLayout(track, themes).bounds);
    for (const spot of PROPS) {
      const at = propSpot(plan, spot);
      const onSlab =
        at.x > plan.slab.minX &&
        at.x < plan.slab.maxX &&
        at.z > plan.slab.minZ &&
        at.z < plan.slab.maxZ;
      expect(onSlab).toBe(false);
      if (spot.side === 'front') expect(spot.lie).toBe(true);
    }
  });

  it('builds the props as one mesh per texture, resting on the table top', () => {
    const plan = tablePlan(buildLayout(track, themes).bounds);
    const source = new Object3D();
    const maps = [new Texture(), new Texture()];
    PROPS.forEach((spot, i) => {
      const prop = new Mesh(
        new BoxGeometry(0.4, 0.6, 0.2),
        new MeshBasicMaterial({ map: maps[i % 2] }),
      );
      prop.name = spot.id;
      source.add(prop);
    });
    const meshes = buildProps(source, plan, PROPS);
    expect(meshes).toHaveLength(2);
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      expect(m.geometry.boundingBox?.min.y).toBeCloseTo(plan.table.top, 5);
    }
  });

  it('puts each prop on its spot, a laid one flat, whatever its offset in the file', () => {
    const plan = tablePlan(buildLayout(track, themes).bounds);
    const sword = {
      id: 'sword',
      side: 'front',
      along: 0.5,
      out: 4,
      yaw: 0,
      lie: true,
      scale: 2,
    } as const;
    const mug = {
      id: 'mug',
      side: 'back',
      along: 0.5,
      out: 4,
      yaw: 0,
      lie: false,
      scale: 2,
    } as const;
    const source = new Object3D();
    const long = new Mesh(new BoxGeometry(0.2, 2, 0.1), new MeshBasicMaterial());
    long.name = 'sword';
    long.position.set(5, 1, -3); // an offset in the file must not move it off its spot
    const tall = new Mesh(
      new BoxGeometry(0.4, 0.6, 0.4),
      new MeshBasicMaterial({ map: new Texture() }),
    );
    tall.name = 'mug';
    source.add(long, tall);
    const place = (spot: typeof sword | typeof mug) => {
      const [mesh] = buildProps(source, plan, [spot]);
      mesh?.geometry.computeBoundingBox();
      return { box: mesh?.geometry.boundingBox, at: propSpot(plan, spot) };
    };
    const laid = place(sword);
    const standing = place(mug);
    for (const { box, at } of [laid, standing]) {
      expect(((box?.min.x ?? 0) + (box?.max.x ?? 0)) / 2).toBeCloseTo(at.x, 5);
      expect(((box?.min.z ?? 0) + (box?.max.z ?? 0)) / 2).toBeCloseTo(at.z, 5);
    }
    // Laid flat: its 2-unit length lies along the table, its height is the blade's thickness.
    expect((laid.box?.max.y ?? 0) - (laid.box?.min.y ?? 0)).toBeCloseTo(0.2, 5);
    expect((standing.box?.max.y ?? 0) - (standing.box?.min.y ?? 0)).toBeCloseTo(1.2, 5);
  });
});
