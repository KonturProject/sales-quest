import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { TIMING, planMoves } from '../../../src/scene/choreography.ts';
import { VARIANTS, variantFor } from '../../../src/scene/heroCatalog.ts';
import { CHEER_MS, REST_TURN, heroAction, heroYaw, mergeHero } from '../../../src/scene/heroes.ts';

/** A tiny rig: hip → hand; a skinned body on the hip, a sword and an axe in the hand, a cape. */
function rig() {
  const root = new Object3D();
  const hip = new Bone();
  hip.name = 'hip';
  hip.position.set(0, 1, 0);
  const hand = new Bone();
  hand.name = 'hand';
  hand.position.set(1, 0, 0);
  hip.add(hand);
  root.add(hip);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton([hip, hand]);

  const geometry = new BoxGeometry(1, 1, 1);
  const n = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(n * 4), 4));
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  const body = new SkinnedMesh(geometry);
  body.name = 'Body';
  root.add(body);
  body.bind(skeleton);

  const piece = (name: string, parent: Object3D, x: number) => {
    const m = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
    m.name = name;
    m.position.set(x, 0, 0);
    m.rotation.set(0, 0.3, 0);
    parent.add(m);
    return m;
  };
  const sword = piece('Sword', hand, 0.5);
  piece('Axe', hand, -0.5);
  piece('Cape', hip, 0);
  root.updateMatrixWorld(true);
  return { root, hip, hand, sword };
}

describe('mergeHero (D-41: one draw call per hero)', () => {
  it('keeps the chosen parts in one skinned mesh, with the cape marked for the team colour', () => {
    const { root } = rig();
    const merged = mergeHero(root, new Set(['Body', 'Sword', 'Cape']), 'Cape');
    let meshes = 0;
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(1);
    expect((merged.geometry.index?.count ?? 0) / 3).toBe(36); // three boxes of 12 triangles
    const mask = merged.geometry.getAttribute('teamMask');
    let cape = 0;
    for (let i = 0; i < mask.count; i++) cape += mask.getX(i);
    expect(cape).toBe(24); // the cape's vertices
  });

  it('makes a rigid piece follow its bone exactly as when it hung on it', () => {
    const { root, hand, sword } = rig();
    const p = new Vector3().fromBufferAttribute(sword.geometry.getAttribute('position'), 0);
    const local = sword.matrix.clone();
    const merged = mergeHero(root, new Set(['Body', 'Sword']), 'Cape');

    hand.rotation.set(0.4, 0.2, 1.1);
    root.position.set(3, 0, -2);
    root.updateMatrixWorld(true);
    const expected = p.clone().applyMatrix4(local).applyMatrix4(hand.matrixWorld);

    const index = merged.geometry.getAttribute('skinIndex');
    let first = -1;
    for (let i = 0; i < index.count && first < 0; i++) if (index.getX(i) === 1) first = i;
    const got = new Vector3().fromBufferAttribute(merged.geometry.getAttribute('position'), first);
    merged.applyBoneTransform(first, got);
    got.applyMatrix4(merged.matrixWorld);
    expect(got.distanceTo(expected)).toBeLessThan(1e-5);
  });

  it('refuses a hero without a skinned body', () => {
    const { root } = rig();
    expect(() => mergeHero(root, new Set(['Sword']), 'Cape')).toThrow(/skinned body/);
  });
});

describe('heroAction (poses from the plan, PERF-1)', () => {
  const plan = planMoves(
    [
      { teamId: 't1', position: 6 },
      { teamId: 't2', position: 0 },
    ],
    [
      { teamId: 't1', position: 8 },
      { teamId: 't2', position: 20 },
    ],
    TIMING,
    [8, 16],
  );
  const [m1, m2] = plan.moves;

  it('stands before its move, hops cell by cell, cheers after a gate, then stands', () => {
    expect(heroAction(plan, 't1', 0)).toEqual({ clip: 'idle', phase: 0 });
    expect(heroAction(plan, 't1', (m1?.start ?? 0) + 150)).toEqual({ clip: 'hop', phase: 0.5 });
    expect(heroAction(plan, 't1', (m1?.end ?? 0) + CHEER_MS / 2)).toEqual({
      clip: 'cheer',
      phase: 0.5,
    });
    expect(heroAction(plan, 't1', (m1?.end ?? 0) + CHEER_MS)).toEqual({ clip: 'idle', phase: 0 });
    expect(heroAction(plan, 'tX', 500)).toEqual({ clip: 'idle', phase: 0 });
  });

  it('runs a walk too long for hops, and the cheer ends within the plan', () => {
    expect(m2?.hopMs).toBeLessThan(250);
    expect(heroAction(plan, 't2', (m2?.start ?? 0) + 10).clip).toBe('run');
    expect((m2?.end ?? 0) + CHEER_MS).toBeLessThanOrEqual(plan.duration);
  });

  it('faces along the hop, else the viewer', () => {
    expect(heroYaw({ dx: 1, dz: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(heroYaw(null, 0)).toBeCloseTo(REST_TURN);
    expect(heroYaw({ dx: 0, dz: 0 }, 90)).toBeCloseTo(Math.PI / 2 + REST_TURN);
  });
});

describe('hero catalog (GFX-CHAR-1)', () => {
  it('has ten variants; a known id picks its own, an unknown one goes by the team place', () => {
    expect(VARIANTS).toHaveLength(10);
    expect(new Set(VARIANTS.map((v) => v.id)).size).toBe(10);
    expect(variantFor('mage-book', 0).id).toBe('mage-book');
    expect(variantFor('leader-3', 2)).toBe(VARIANTS[2]);
    expect(variantFor('?', 12)).toBe(VARIANTS[2]);
  });
});
