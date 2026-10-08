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
 * The whole track in view (FR-MOVE-3 «обзор»): the strip's width fits the screen at `fovDeg`
 * (vertical) and `aspect`, and the panels' depth fits its height.
 */
export function overviewPose(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  aspect: number,
  fovDeg: number,
  angles: CameraAngles,
): CameraPose {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const pitch = (angles.pitchDeg * Math.PI) / 180;
  const byWidth = width / 2 / (half * Math.max(aspect, 0.1));
  const byDepth = (depth * Math.sin(pitch)) / 2 / half;
  return {
    target: [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2],
    distance: Math.max(byWidth, byDepth) * 1.04,
    ...angles,
  };
}

/** Close to one figure for a move (D-23). */
export const TEAM_DISTANCE = 13;

export function teamPose(at: { x: number; z: number }, angles: CameraAngles): CameraPose {
  return { target: [at.x, 0, at.z], distance: TEAM_DISTANCE, ...angles };
}
