import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { Layout } from './layout.ts';
import { positionSpan, publishSpan, type Span } from './viewWindow.ts';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
/** The mini-map is told at most this often while frames are drawn, and once after the last. */
const EVERY_MS = 250;

/** Where the left and right edges of the view, at its middle, meet the ground. */
function groundEdges(camera: Camera, ray: Raycaster, hit: Vector3): [number, number] | null {
  const xs: number[] = [];
  for (const x of [-1, 1]) {
    ray.setFromCamera(new Vector2(x, 0), camera);
    if (ray.ray.intersectPlane(GROUND, hit)) xs.push(hit.x);
  }
  return xs.length === 2 ? [Math.min(...xs), Math.max(...xs)] : null;
}

/**
 * Tells the mini-map which positions the camera shows (GFX-5): read on drawn frames only, so a
 * scene at rest does nothing (PERF-1); no more than four times a second, and once after the last
 * frame so the frame settles where the camera stopped. While moves play (`busy`) only that last
 * time: the camera follows a hero then, and repainting the HUD costs frames of the moves (QA-4).
 */
export function ViewWindow({ layout, busy }: { layout: Layout; busy: () => boolean }) {
  const last = useRef(0);
  const trailing = useRef<number | null>(null);
  const tools = useRef({ ray: new Raycaster(), hit: new Vector3() });

  useFrame(({ camera }) => {
    const read = (): Span | null => {
      const edges = groundEdges(camera, tools.current.ray, tools.current.hit);
      return edges ? positionSpan(layout, edges[0], edges[1]) : null;
    };
    const now = performance.now();
    if (trailing.current !== null) window.clearTimeout(trailing.current);
    if (!busy() && now - last.current >= EVERY_MS) {
      last.current = now;
      publishSpan(read());
    }
    trailing.current = window.setTimeout(() => {
      trailing.current = null;
      publishSpan(read());
    }, EVERY_MS);
  });

  useEffect(() => {
    const pending = trailing;
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
      publishSpan(null);
    };
  }, []);
  return null;
}
