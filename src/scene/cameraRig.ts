export type CameraAngles = { pitchDeg: number; yawDeg: number };

/** Vertical field of view of the perspective camera (D-23). */
export const FOV = 40;

/** Where the camera looks from: a target on the ground, a distance and two angles. */
export type CameraPose = CameraAngles & {
  target: readonly [number, number, number];
  distance: number;
};

/**
 * Where to put a camera that looks at `target` from `distance` away, `pitchDeg` above the
 * ground plane and turned `yawDeg` around the vertical axis (yaw 0 = camera on +Z, the strip
 * running left to right on screen).
 */
export function cameraPosition(
  angles: CameraAngles,
  distance: number,
  target: readonly [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const pitch = (angles.pitchDeg * Math.PI) / 180;
  const yaw = (angles.yawDeg * Math.PI) / 180;
  const horizontal = distance * Math.cos(pitch);
  return [
    target[0] + horizontal * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + horizontal * Math.cos(yaw),
  ];
}

/** The pose of a camera at `position` looking at `target` — the inverse of `cameraPosition`. */
export function poseOf(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): CameraPose {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  return {
    target,
    distance,
    pitchDeg: (Math.asin(distance > 0 ? dy / distance : 1) * 180) / Math.PI,
    yawDeg: (Math.atan2(dx, dz) * 180) / Math.PI,
  };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A smooth flight from `a` to `b`, `t` 0…1 (ease in and out). */
export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const k = ease(Math.min(Math.max(t, 0), 1));
  const mix = (x: number, y: number) => x + (y - x) * k;
  let dyaw = b.yawDeg - a.yawDeg;
  if (dyaw > 180) dyaw -= 360;
  if (dyaw < -180) dyaw += 360;
  return {
    target: [
      mix(a.target[0], b.target[0]),
      mix(a.target[1], b.target[1]),
      mix(a.target[2], b.target[2]),
    ],
    distance: mix(a.distance, b.distance),
    pitchDeg: mix(a.pitchDeg, b.pitchDeg),
    yawDeg: a.yawDeg + dyaw * k,
  };
}

/**
 * The whole track in view (FR-MOVE-3 «обзор»): the bounds' box (ground to `height`) seen at
 * `angles` through a perspective camera of `fovDeg` (vertical) and `aspect` — the camera as close
 * as the box allows, the box centred. `insetRight` — the share of the screen's width on the right
 * covered by the HUD (the rating panel): the box fits the rest. Any yaw: a diagonal view of the
 * strip as well (3b).
 */
export function overviewPose(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  aspect: number,
  fovDeg: number,
  angles: CameraAngles,
  insetRight = 0,
  height = 1.5,
): CameraPose {
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  const tanX = tanY * Math.max(aspect, 0.1);
  const pitch = (angles.pitchDeg * Math.PI) / 180;
  const yaw = (angles.yawDeg * Math.PI) / 180;
  // Camera axes: `back` from the target to the camera, `right`, `up` on the screen.
  const back = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    back[1]! * right[2]! - back[2]! * right[1]!,
    back[2]! * right[0]! - back[0]! * right[2]!,
    back[0]! * right[1]! - back[1]! * right[0]!,
  ];
  const corners: number[][] = [];
  for (const x of [bounds.minX, bounds.maxX])
    for (const z of [bounds.minZ, bounds.maxZ])
      for (const y of [0, height]) corners.push([x, y, z]);
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const inset = Math.min(Math.max(insetRight, 0), 0.6);
  const fit = 0.96;
  const [left, rightEdge] = [-fit, fit - 2 * inset * fit];

  /** The box on the screen (NDC) from a camera `d` away from `t`. */
  const screen = (t: number[], d: number) => {
    const eye = [t[0]! + back[0]! * d, t[1]! + back[1]! * d, t[2]! + back[2]! * d];
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const c of corners) {
      const v = [c[0]! - eye[0]!, c[1]! - eye[1]!, c[2]! - eye[2]!];
      const depth = -dot(v, back);
      if (depth <= 0.01) return null;
      const sx = dot(v, right) / depth / tanX;
      const sy = dot(v, up) / depth / tanY;
      [x0, x1, y0, y1] = [Math.min(x0, sx), Math.max(x1, sx), Math.min(y0, sy), Math.max(y1, sy)];
    }
    return { x0, x1, y0, y1 };
  };
  const fits = (t: number[], d: number) => {
    const s = screen(t, d);
    return s !== null && s.x0 >= left && s.x1 <= rightEdge && s.y0 >= -fit && s.y1 <= fit;
  };

  const target = [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2];
  let distance = 1;
  for (let round = 0; round < 6; round++) {
    let [lo, hi] = [0.5, 1];
    while (!fits(target, hi) && hi < 1e5) hi *= 2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(target, mid)) hi = mid;
      else lo = mid;
    }
    distance = hi;
    // Centre the box in the free part of the screen: move the target along the ground.
    const s = screen(target, distance);
    if (!s) break;
    const dx = ((s.x0 + s.x1) / 2 - (left + rightEdge) / 2) * tanX * distance;
    const dy = ((s.y0 + s.y1) / 2) * tanY * distance;
    const ahead = [-Math.sin(yaw), 0, -Math.cos(yaw)]; // up the screen, along the ground
    const k = dy / Math.max(Math.sin(pitch), 0.2);
    target[0] = target[0]! + right[0]! * dx + ahead[0]! * k;
    target[2] = target[2]! + right[2]! * dx + ahead[2]! * k;
  }
  return { target: [target[0]!, 0, target[2]!], distance, ...angles };
}

/** Close to one figure for a move (D-23). */
export const TEAM_DISTANCE = 13;

export function teamPose(at: { x: number; z: number }, angles: CameraAngles): CameraPose {
  return { target: [at.x, 0, at.z], distance: TEAM_DISTANCE, ...angles };
}
