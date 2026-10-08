import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

declare global {
  interface Window {
    /** WebGL renders since page load; e2e tests check it stays flat while nothing changes. */
    __sqFrames?: number;
    /** The last rendered frame: draw calls and triangles (PERF-BUDGET, QA-4). */
    __sqStats?: { calls: number; triangles: number };
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
    const previous = scene.onAfterRender;
    scene.onAfterRender = () => {
      const { frame, calls, triangles } = gl.info.render;
      window.__sqFrames = frame;
      window.__sqStats = { calls, triangles };
    };
    return () => {
      scene.onAfterRender = previous;
    };
  }, [get]);
  return null;
}
