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
 * player's shots and button flights; any touch of the viewer hands the camera over.
 */
export function CameraRig(props: {
  layout: Layout;
  angles: CameraAngles;
  player: ScenePlayer;
  teamIds: string[];
  /** The overview pose, shared with the «Весь трек» button. */
  onOverview: (pose: CameraPose) => void;
}) {
  const { layout, angles, player, teamIds, onOverview } = props;
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControls | null>(null);

  const overview = useMemo(
    () => overviewPose(layout.bounds, size.width / Math.max(size.height, 1), FOV, angles),
    [layout.bounds, size.width, size.height, angles],
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

  useEffect(() => {
    const { camera, gl, invalidate } = get();
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = false; // damping needs a frame on every tick (PERF-1)
    c.screenSpacePanning = false;
    c.minPolarAngle = rad(90 - PITCH_LIMITS[1]);
    c.maxPolarAngle = rad(90 - PITCH_LIMITS[0]);
    c.minAzimuthAngle = rad(angles.yawDeg - YAW_SWING);
    c.maxAzimuthAngle = rad(angles.yawDeg + YAW_SWING);
    c.minDistance = 5;
    c.maxDistance = overview.distance * 1.25;
    const onChange = () => {
      // Pan along the strip only, never off the board.
      c.target.set(
        Math.min(Math.max(c.target.x, layout.bounds.minX), layout.bounds.maxX),
        0,
        Math.min(Math.max(c.target.z, -PANEL_SIZE / 2), PANEL_SIZE / 2),
      );
      invalidate();
    };
    const onStart = () => player.release();
    c.addEventListener('change', onChange);
    c.addEventListener('start', onStart);
    controls.current = c;

    const perspective = camera as PerspectiveCamera;
    perspective.fov = FOV;
    perspective.near = 0.5;
    perspective.far = 800;
    perspective.updateProjectionMatrix();
    // The overview at the start and after a resize, unless the viewer holds the camera.
    if (!player.userCamera && !player.animating()) apply(overview);
    else
      c.target.set(
        ...poseOf(
          [camera.position.x, camera.position.y, camera.position.z],
          [c.target.x, 0, c.target.z],
        ).target,
      );
    invalidate();
    return () => {
      c.removeEventListener('change', onChange);
      c.removeEventListener('start', onStart);
      c.dispose();
      controls.current = null;
    };
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
