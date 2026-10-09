import { describe, expect, it } from 'vitest';
import {
  cameraPosition,
  lerpPose,
  overviewPose,
  poseOf,
  teamPose,
} from '../../../src/scene/cameraRig.ts';
import { TIMING } from '../../../src/scene/choreography.ts';
import { FLIGHT_MS, ScenePlayer } from '../../../src/scene/player.ts';

const at = (entries: [string, number][]) =>
  entries.map(([teamId, position]) => ({ teamId, position }));

describe('ScenePlayer (FR-MOVE)', () => {
  it('places figures at once on the first load and on another track', () => {
    const player = new ScenePlayer();
    expect(player.load(at([['t1', 3]]), '20').duration).toBe(0);
    expect(player.pose('t1')).toEqual({ a: 3, b: 3, f: 0 });
    expect(player.load(at([['t1', 5]]), '30').duration).toBe(0);
    expect(player.animating()).toBe(false);
  });

  it('plays the moves from the previous positions on its own clock', () => {
    const player = new ScenePlayer();
    player.load(at([['t1', 3]]), '20');
    const plan = player.load(at([['t1', 4]]), '20');
    expect(plan.moves).toHaveLength(1);
    expect(player.pose('t1')).toEqual({ a: 3, b: 3, f: 0 });
    player.advance(TIMING.flyMs + TIMING.hopMs / 2);
    expect(player.pose('t1')).toEqual({ a: 3, b: 4, f: 0.5 });
    expect(player.shot()?.shot.target).toEqual({ kind: 'team', teamId: 't1' });
    expect(player.popups()[0]?.text).toBe('+1 шаг');
    // The plan's end: one more frame applies the last shot exactly, then the player rests.
    expect(player.advance(plan.duration)).toBe(true);
    expect(player.shot()).toEqual({ shot: plan.shots[plan.shots.length - 1], progress: 1 });
    expect(player.advance(0)).toBe(false);
    expect(player.pose('t1')).toEqual({ a: 4, b: 4, f: 0 });
  });

  it('keeps the plan under way when the same positions come again (review 3a)', () => {
    const player = new ScenePlayer();
    player.load(at([['t1', 3]]), '20');
    const plan = player.load(at([['t1', 6]]), '20');
    player.advance(1000);
    expect(player.load(at([['t1', 6]]), '20')).toBe(plan);
    expect(player.clock).toBe(1000);
  });

  it('hands the camera to the viewer and to the buttons', () => {
    const player = new ScenePlayer();
    player.load(at([['t1', 3]]), '20');
    player.load(at([['t1', 6]]), '20');
    player.release();
    expect(player.shot()).toBeNull();
    const a = teamPose({ x: 0, z: 0 }, { pitchDeg: 50, yawDeg: 0 });
    const b = teamPose({ x: 10, z: 0 }, { pitchDeg: 50, yawDeg: 0 });
    player.flyTo(a, b);
    player.advance(FLIGHT_MS / 2);
    expect(player.flightPose()?.target[0]).toBeCloseTo(5, 6);
    player.advance(FLIGHT_MS);
    expect(player.flightPose()?.target[0]).toBe(10); // the exact end, once
    expect(player.flightPose()).toBeNull();
    // The figures still finish their moves; then the player rests.
    expect(player.advance(player.plan.duration)).toBe(false);
  });
});

describe('camera poses (D-23)', () => {
  it('turn a pose into a position and back', () => {
    const pose = { target: [3, 0, -2] as const, distance: 20, pitchDeg: 50, yawDeg: 20 };
    const back = poseOf(cameraPosition(pose, pose.distance, pose.target), pose.target);
    expect(back.distance).toBeCloseTo(20, 6);
    expect(back.pitchDeg).toBeCloseTo(50, 6);
    expect(back.yawDeg).toBeCloseTo(20, 6);
  });

  it('fly smoothly and take the short way round', () => {
    const a = { target: [0, 0, 0] as const, distance: 10, pitchDeg: 40, yawDeg: 170 };
    const b = { target: [10, 0, 0] as const, distance: 20, pitchDeg: 60, yawDeg: -170 };
    expect(lerpPose(a, b, 0)).toEqual({ ...a, target: [0, 0, 0] });
    const mid = lerpPose(a, b, 0.5);
    expect([mid.target[0], mid.distance, mid.pitchDeg, mid.yawDeg]).toEqual([5, 15, 50, 180]);
    expect(lerpPose(a, b, 0.1).target[0]).toBeLessThan(1); // eased start
  });

  it('fit a diagonal view of the strip too (3b)', () => {
    const bounds = { minX: -2, maxX: 70, minZ: -6, maxZ: 6 };
    const straight = overviewPose(bounds, 16 / 9, 40, { pitchDeg: 50, yawDeg: 0 });
    const diagonal = overviewPose(bounds, 16 / 9, 40, { pitchDeg: 38, yawDeg: -30 });
    expect(diagonal.yawDeg).toBe(-30);
    // Seen at an angle the strip is shorter on screen: the camera comes closer.
    expect(diagonal.distance).toBeLessThan(straight.distance);
  });

  it('fit the whole strip in the overview', () => {
    const bounds = { minX: -2, maxX: 70, minZ: -6, maxZ: 6 };
    const wide = overviewPose(bounds, 16 / 9, 40, { pitchDeg: 50, yawDeg: 0 });
    const narrow = overviewPose(bounds, 4 / 3, 40, { pitchDeg: 50, yawDeg: 0 });
    expect(wide.target[0]).toBeCloseTo(34, 6);
    expect(Math.abs(wide.target[2])).toBeLessThan(1); // perspective: the near edge looks bigger
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    const visibleHalfWidth = Math.tan((40 * Math.PI) / 360) * (16 / 9) * wide.distance;
    expect(visibleHalfWidth).toBeGreaterThanOrEqual(36);
    // A quarter of the screen under the HUD: the strip fits the left three quarters.
    const inset = overviewPose(bounds, 16 / 9, 40, { pitchDeg: 50, yawDeg: 0 }, 0.25);
    expect(inset.target[0]).toBeCloseTo(-2 + 72 / 0.75 / 2, 1);
    expect(inset.distance / wide.distance).toBeCloseTo(1 / 0.75, 1); // perspective: about
  });
});
