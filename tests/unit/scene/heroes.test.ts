import { readFileSync } from 'node:fs';
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderLib,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../../scripts/lib/assets.ts';
import { TIMING, planMoves } from '../../../src/scene/choreography.ts';
import { makeRig, poseRig } from '../../../src/scene/heroAssets.ts';
import { VARIANTS, variantFor } from '../../../src/scene/heroCatalog.ts';
import {
  CHEER_MS,
  REST_TURN,
  SOURCE_HEIGHT,
  TURN_MS,
  heroAction,
  heroMaterial,
  heroYaw,
  mergeHero,
  settleYaw,
} from '../../../src/scene/heroes.ts';

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

  it('maps the joints of a part whose skeleton lists the bones in another order', () => {
    const { root, hip, hand } = rig();
    const geometry = new BoxGeometry(0.3, 0.3, 0.3);
    const n = geometry.getAttribute('position').count;
    const index = new Uint16Array(n * 4); // joint 0 of this skeleton — the hand
    const weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinIndex', new BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
    const glove = new SkinnedMesh(geometry);
    glove.name = 'Glove';
    root.add(glove);
    root.updateMatrixWorld(true);
    glove.bind(new Skeleton([hand, hip]));
    const rest = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), 0);
    const handRest = hand.matrixWorld.clone();
    const merged = mergeHero(root, new Set(['Body', 'Glove']), 'Cape');
    const joints = merged.geometry.getAttribute('skinIndex');
    // The body (hip, joint 0) comes first; the glove follows on the body's joint of the hand (1).
    const first = joints.count - n;
    expect(joints.getX(first)).toBe(1);
    // …and moves with the hand, not with the hip.
    hand.rotation.set(0, 0, 0.9);
    hip.rotation.set(0.3, 0, 0);
    root.updateMatrixWorld(true);
    const expected = rest
      .clone()
      .applyMatrix4(handRest.clone().invert())
      .applyMatrix4(hand.matrixWorld);
    const got = new Vector3().fromBufferAttribute(merged.geometry.getAttribute('position'), first);
    merged.applyBoneTransform(first, got);
    expect(got.applyMatrix4(merged.matrixWorld).distanceTo(expected)).toBeLessThan(1e-5);
  });

  it('turns the triangles of a mirrored piece back outwards', () => {
    const { root, sword } = rig();
    sword.scale.set(-1, 1, 1);
    root.updateMatrixWorld(true);
    const merged = mergeHero(root, new Set(['Body', 'Sword']), 'Cape');
    const pos = merged.geometry.getAttribute('position');
    const nor = merged.geometry.getAttribute('normal');
    const tri = merged.geometry.index!;
    const joints = merged.geometry.getAttribute('skinIndex');
    // The sword's triangles are the ones on the hand's joint (1).
    let first = 0;
    while (joints.getX(tri.getX(first)) !== 1) first += 3;
    const [a, b, c] = [tri.getX(first), tri.getX(first + 1), tri.getX(first + 2)];
    const va = new Vector3().fromBufferAttribute(pos, a);
    const face = new Vector3()
      .fromBufferAttribute(pos, b)
      .sub(va)
      .cross(new Vector3().fromBufferAttribute(pos, c).sub(va));
    expect(face.dot(new Vector3().fromBufferAttribute(nor, a))).toBeGreaterThan(0);
  });

  it('refuses a missing part and a part with a texture of its own', () => {
    expect(() => mergeHero(rig().root, new Set(['Body', 'Helmet']), 'Cape')).toThrow(
      /no mesh named Helmet/,
    );
    const { root, sword } = rig();
    sword.material = new MeshBasicMaterial({ map: new Texture() });
    expect(() => mergeHero(root, new Set(['Body', 'Sword']), 'Cape')).toThrow(/texture/);
  });

  it('refuses a part bound to a bone the body lacks', () => {
    const { root } = rig();
    const stray = new Bone();
    root.add(stray);
    const geometry = new BoxGeometry(0.3, 0.3, 0.3);
    const n = geometry.getAttribute('position').count;
    const weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(n * 4), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
    const part = new SkinnedMesh(geometry);
    part.name = 'Stray';
    root.add(part);
    root.updateMatrixWorld(true);
    part.bind(new Skeleton([stray]));
    expect(() => mergeHero(root, new Set(['Body', 'Stray']), 'Cape')).toThrow(/does not have/);
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

  it('turns from the way ahead to the viewer over ~0.3 s, the short way round (3b BACKLOG)', () => {
    expect(TURN_MS).toBe(300);
    expect(settleYaw(1, 2, 0)).toBeCloseTo(1);
    expect(settleYaw(1, 2, TURN_MS / 2)).toBeCloseTo(1.5);
    expect(settleYaw(1, 2, TURN_MS)).toBeCloseTo(2);
    expect(settleYaw(1, 2, 10_000)).toBeCloseTo(2);
    expect(settleYaw(1, 2, -50)).toBeCloseTo(1);
    // From just below +π to just above −π: through π, not back across 0.
    const mid = settleYaw(3, -3, TURN_MS / 2);
    expect(Math.abs(Math.sin(mid) - Math.sin(Math.PI))).toBeLessThan(0.01);
    expect(Math.cos(mid)).toBeLessThan(-0.99);
  });
});

describe('hero rigs (D-41)', () => {
  /** A merged hero: one bone that the clips move along x. */
  function template(clips: string[]) {
    const scene = new Object3D();
    const hand = new Bone();
    hand.name = 'hand';
    scene.add(hand);
    scene.updateMatrixWorld(true);
    const geometry = new BoxGeometry(0.2, 0.2, 0.2);
    const n = geometry.getAttribute('position').count;
    const weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(n * 4), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
    const hero = new SkinnedMesh(geometry);
    scene.add(hero);
    hero.bind(new Skeleton([hand]));
    const track = new VectorKeyframeTrack('hand.position', [0, 1], [0, 0, 0, 1, 0, 0]);
    return { scene, clips: clips.map((name) => new AnimationClip(name, 1, [track])), map: null };
  }
  const handOf = (root: Object3D) => root.getObjectByName('hand') as Bone;

  it('poses a hero at a phase of a clip, and skips a pose it already has', () => {
    const rig = makeRig(template(['Idle', 'Jump_Full_Short']), '#ff0000');
    expect(poseRig(rig, { clip: 'hop', phase: 0.5 })).toBe(true);
    expect(handOf(rig.root).position.x).toBeCloseTo(0.5);
    expect(poseRig(rig, { clip: 'hop', phase: 0.5 })).toBe(false);
    expect(poseRig(rig, { clip: 'idle', phase: 0 })).toBe(true);
    expect(handOf(rig.root).position.x).toBeCloseTo(0);
  });

  it('stands a hero whose file lacks the clip (GFX-CHAR-2: the figure hops by itself)', () => {
    const rig = makeRig(template(['Idle']), '#ff0000');
    expect(rig.actions.hop).toBeUndefined();
    poseRig(rig, { clip: 'hop', phase: 0.7 });
    expect(handOf(rig.root).position.x).toBeCloseTo(0);
  });

  it('paints the cape in the team colour: the shader hooks still exist in three', () => {
    const material = heroMaterial(null, '#ff0000');
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain('vTeamMask = teamMask;');
    expect(shader.fragmentShader).toContain('mix(diffuseColor.rgb, teamColor');
    expect((shader.uniforms.teamColor?.value as Color).getHexString()).toBe('ff0000');
  });

  it('scales every hero by the knight of the manifest', () => {
    const manifest = JSON.parse(readFileSync('src/assets/manifest.json', 'utf8')) as Manifest;
    const knight = manifest.heroes.find((h) => h.hero === 'knight');
    expect(knight?.height).toBeCloseTo(SOURCE_HEIGHT, 1);
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
