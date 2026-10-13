import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  PointsMaterial,
  type Points,
} from 'three';
import { reducedMotion } from '../hud/clock.ts';
import { POOL, writeSparks } from './fireworks.ts';
import { figureScale, type Layout } from './layout.ts';
import { figurePositions, type ScenePlayer } from './player.ts';

/**
 * At the hero's head, in world units at figure scale 1: the sparks fly out around the figure, not from
 * behind its plates (the popup and the name sit above the head).
 */
const BURST_Y = 1.3;

/**
 * A round spark with a dark rim, drawn once: multiplied by the spark's colour it reads on the dark
 * volcano and on the white clouds alike.
 */
function sparkTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.85, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(canvas);
}

/**
 * The fireworks of the tour (D-57, PERF-9): one pool of points, one draw call, drawn only while a burst
 * lives; half the sparks on the lower steps of the quality ladder; none with reduced motion. Normal
 * blending with the sparks' own alpha — additive sparks were lost on the light locations.
 */
export function Fireworks({
  layout,
  player,
  teamIds,
  colors,
  full,
}: {
  layout: Layout;
  player: ScenePlayer;
  teamIds: string[];
  /** Team id → its colour. */
  colors: Map<string, string>;
  full: boolean;
}) {
  const points = useRef<Points>(null);
  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(POOL * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(POOL * 4), 4)); // RGBA
    g.setDrawRange(0, 0);
    const m = new PointsMaterial({
      size: 0.6,
      map: sparkTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const rgb = useMemo(
    () =>
      new Map(
        [...colors].map(([id, hex]) => {
          const c = new Color(hex);
          return [id, [c.r, c.g, c.b] as [number, number, number]];
        }),
      ),
    [colors],
  );
  const scale = figureScale(layout);

  useFrame(() => {
    const p = points.current;
    if (!p) return;
    const bursts = reducedMotion() ? [] : player.bursts();
    if (bursts.length === 0) {
      p.visible = false;
      return;
    }
    const at = figurePositions(layout, player, teamIds);
    const position = geometry.getAttribute('position') as BufferAttribute;
    const color = geometry.getAttribute('color') as BufferAttribute;
    let n = 0;
    for (const b of bursts) {
      const xz = at(b.teamId);
      if (!xz) continue;
      n += writeSparks(
        b.kind,
        b.age,
        [xz.x, BURST_Y * scale, xz.z],
        rgb.get(b.teamId) ?? [1, 1, 1],
        position.array as Float32Array,
        color.array as Float32Array,
        n,
        POOL - n,
        full ? 1 : 0.5,
      );
    }
    geometry.setDrawRange(0, n);
    position.needsUpdate = true;
    color.needsUpdate = true;
    p.visible = n > 0;
  });

  return (
    <points
      ref={points}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
    />
  );
}
