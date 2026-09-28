export type CameraAngles = { pitchDeg: number; yawDeg: number };

/**
 * Where to put a camera that looks at `target` from `distance` away, `pitchDeg` above the
 * ground plane and turned `yawDeg` around the vertical axis (yaw 0 = camera on +Z).
 * For an orthographic camera the distance only has to keep the scene between the near
 * and far planes; the on-screen size comes from `zoom`.
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
