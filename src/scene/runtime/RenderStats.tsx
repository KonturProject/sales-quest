import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';

declare global {
  interface Window {
    /** WebGL renders since page load; e2e tests check it stays flat while nothing changes. */
    __sqFrames?: number;
    /**
     * Frames asked for and not drawn yet (R3F's demand counter): a starved runner can hold one back
     * for seconds — a quiet counter with a frame pending is not rest (CI, 10.10.2026).
     */
    __sqPending?: () => number;
    /** The last rendered frame: draw calls and triangles (PERF-BUDGET, QA-4). */
    __sqStats?: {
      calls: number;
      triangles: number;
      camera: [number, number, number];
      /** The point of the ground at the centre of the view. */
      look: [number, number];
    };
  }
}

/**
 * Counts real WebGL renders (`renderer.info`, BACKLOG) after each one: the scene's
 * `onAfterRender` runs once per `renderer.render`, so ticks without a render are not counted.
 */
export function RenderStats() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { scene, gl } = get();
    window.__sqPending = () => get().internal.frames;
    const previous = scene.onAfterRender;
    const dir = new Vector3();
    scene.onAfterRender = (_renderer, _scene, camera) => {
      const { frame, calls, triangles } = gl.info.render;
      const p = camera.position;
      camera.getWorldDirection(dir);
      const t = dir.y < 0 ? -p.y / dir.y : 0;
      window.__sqFrames = frame;
      window.__sqStats = {
        calls,
        triangles,
        camera: [p.x, p.y, p.z],
        look: [p.x + dir.x * t, p.z + dir.z * t],
      };
    };
    return () => {
      scene.onAfterRender = previous;
      window.__sqPending = undefined;
    };
  }, [get]);
  return null;
}
