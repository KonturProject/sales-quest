import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FOV,
  cameraPosition,
  lerpPose,
  overviewPose,
  poseOf,
  teamPose,
  type CameraAngles,
  type CameraPose,
} from './cameraRig.ts';
import type { Shot } from './choreography.ts';
import { PANEL_SIZE, type Layout } from './layout.ts';
import { figurePositions, type ScenePlayer } from './player.ts';

const PITCH_LIMITS = [30, 70] as const;
const YAW_SWING = 35;
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The perspective camera (D-23): the overview of the whole strip, flights to the moving team and
 * back (FR-MOVE-3), and the viewer's own orbit / zoom / pan within limits (GFX-3). Plays the
 * player's shots and button flights; any touch of the viewer hands the camera over. The viewer's
 * own moves are drawn by the ticker too (≤ 30 FPS, PERF-1): `onUser` asks for its frames.
 */
export function CameraRig(props: {
  layout: Layout;
  angles: CameraAngles;
  player: ScenePlayer;
  teamIds: string[];
  /** The overview pose, shared with the «Весь трек» button. */
  onOverview: (pose: CameraPose) => void;
  /** The viewer starts / stops moving the camera. */
  onUser: (active: boolean) => void;
  /** Whether the ticker draws frames now (else a camera change is drawn at once). */
  ticking: () => boolean;
}) {
  const { layout, angles, player, teamIds, onOverview, onUser, ticking } = props;
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControls | null>(null);
  const bounds = useRef(layout.bounds);

  // On a wide screen the rating panel (≈ 300 px, D-38) covers the right edge: leave room for it.
  const inset = size.width >= 900 ? 320 / size.width : 0;
  const overview = useMemo(
    () => overviewPose(layout.bounds, size.width / Math.max(size.height, 1), FOV, angles, inset),
    [layout.bounds, size.width, size.height, angles, inset],
  );
  useEffect(() => onOverview(overview), [overview, onOverview]);

  /** Puts the camera at a pose and keeps the controls' target in step. */
  const apply = useMemo(
    () => (pose: CameraPose) => {
      const camera = get().camera;
      camera.position.set(...cameraPosition(pose, pose.distance, pose.target));
      controls.current?.target.set(...pose.target);
      camera.lookAt(...pose.target);
    },
    [get],
  );

  // The controls, once per camera (review 3a: re-created controls looked at the world origin).
  useEffect(() => {
    const { camera, gl } = get();
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = false; // damping needs a frame on every tick (PERF-1)
    c.screenSpacePanning = false;
    const onChange = () => {
      // Pan along the strip only: move the target and the camera together, so a pan past the
      // end stops instead of turning into a swing and a zoom (review 3a).
      const b = bounds.current;
      const x = Math.min(Math.max(c.target.x, b.minX), b.maxX);
      const z = Math.min(Math.max(c.target.z, -PANEL_SIZE / 2), PANEL_SIZE / 2);
      const dx = x - c.target.x;
      const dz = z - c.target.z;
      const dy = -c.target.y;
      if (dx !== 0 || dz !== 0 || dy !== 0) {
        c.target.set(x, 0, z);
        camera.position.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
      }
      if (!ticking()) get().invalidate();
    };
    const onStart = () => {
      player.release();
      onUser(true);
    };
    const onEnd = () => onUser(false);
    c.addEventListener('change', onChange);
    c.addEventListener('start', onStart);
    c.addEventListener('end', onEnd);
    controls.current = c;
    return () => {
      c.removeEventListener('change', onChange);
      c.removeEventListener('start', onStart);
      c.removeEventListener('end', onEnd);
      c.dispose();
      controls.current = null;
      onUser(false);
    };
  }, [get, player, onUser, ticking]);

  // Limits around `ui.camera`, the overview at the start and after a resize — unless the viewer
  // holds the camera or a plan plays (the next shot takes care of it).
  useEffect(() => {
    bounds.current = layout.bounds;
    const c = controls.current;
    const camera = get().camera as PerspectiveCamera;
    camera.fov = FOV;
    camera.near = 0.5;
    camera.far = 800;
    camera.updateProjectionMatrix();
    if (c) {
      c.minPolarAngle = rad(90 - PITCH_LIMITS[1]);
      c.maxPolarAngle = rad(90 - PITCH_LIMITS[0]);
      c.minAzimuthAngle = rad(angles.yawDeg - YAW_SWING);
      c.maxAzimuthAngle = rad(angles.yawDeg + YAW_SWING);
      c.minDistance = 5;
      c.maxDistance = overview.distance * 1.25;
    }
    if (!player.userCamera && !player.animating()) apply(overview);
    get().invalidate();
  }, [get, angles, overview, layout.bounds, player, apply]);

  // Where a shot flies from: the camera as it was when the shot began.
  const shotFrom = useRef<{ shot: Shot; pose: CameraPose } | null>(null);
  useFrame(({ camera }) => {
    const flight = player.flightPose();
    if (flight) {
      apply(flight);
      return;
    }
    const current = player.shot();
    if (!current) {
      shotFrom.current = null;
      return;
    }
    const target = controls.current?.target;
    if (shotFrom.current?.shot !== current.shot)
      shotFrom.current = {
        shot: current.shot,
        pose: poseOf(
          [camera.position.x, camera.position.y, camera.position.z],
          [target?.x ?? 0, 0, target?.z ?? 0],
        ),
      };
    const goalTarget = current.shot.target;
    const at =
      goalTarget.kind === 'team'
        ? figurePositions(layout, player, teamIds)(goalTarget.teamId)
        : null;
    const goal = at ? teamPose(at, angles) : overview;
    // After the flight the camera keeps following the moving figure: the goal itself.
    apply(current.progress >= 1 ? goal : lerpPose(shotFrom.current.pose, goal, current.progress));
  });

  return null;
}
