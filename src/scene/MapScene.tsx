import { Canvas, type RootState } from '@react-three/fiber';
import { useMemo } from 'react';
import { FrameCounter } from '../perf/FrameCounter.tsx';
import { cameraPosition, type CameraAngles } from './cameraRig.ts';
import { DEFAULT_CAMERA } from './defaults.ts';

// Stage-0 placeholder, replaced by the real track and theme packs in stage 3:
// four location tiles (village, city, castle, port) and six team markers at the start.
const LOCATION_COLORS = ['#7cb342', '#90a4ae', '#8d6e63', '#4fc3f7'];
const TEAM_COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e44ad'];
const TILE = { width: 10, depth: 6, gap: 0.5 };
const CAMERA_DISTANCE = 60;
// World units visible across the window at load. Stage 0 fits once; stage 3 brings the real camera.
const CAMERA_FIT_WIDTH = 48;

function Placeholder({ yawDeg }: { yawDeg: number }) {
  const count = LOCATION_COLORS.length;
  const stripLength = count * TILE.width + (count - 1) * TILE.gap;
  const firstX = -stripLength / 2 + TILE.width / 2;
  return (
    // Turning the group by the camera yaw lays the strip along the screen: left → right.
    <group rotation={[0, (yawDeg * Math.PI) / 180, 0]}>
      {LOCATION_COLORS.map((color, i) => (
        <mesh key={color} position={[firstX + i * (TILE.width + TILE.gap), -0.2, 0]}>
          <boxGeometry args={[TILE.width, 0.4, TILE.depth]} />
          <meshLambertMaterial color={color} />
        </mesh>
      ))}
      {TEAM_COLORS.map((color, i) => (
        <mesh key={color} position={[firstX - TILE.width / 2 + 1, 0.4, -2.5 + i]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshLambertMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function lookAtOrigin(state: RootState) {
  state.camera.lookAt(0, 0, 0);
  state.invalidate();
}

export function MapScene({ angles = DEFAULT_CAMERA }: { angles?: CameraAngles }) {
  const camera = useMemo(
    () => ({
      position: cameraPosition(angles, CAMERA_DISTANCE),
      zoom: window.innerWidth / CAMERA_FIT_WIDTH,
      near: 0.1,
      far: 500,
    }),
    [angles],
  );
  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={1}
      gl={{ antialias: false, preserveDrawingBuffer: false }}
      camera={camera}
      onCreated={lookAtOrigin}
    >
      <FrameCounter />
      <color attach="background" args={['#dfe9f3']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 20, 5]} intensity={1.8} />
      <Placeholder yawDeg={angles.yawDeg} />
    </Canvas>
  );
}
