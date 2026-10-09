import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { AMBIENT_HEIGHT, AMBIENT_LOOK, ambientCloud } from './ambient.ts';
import { FOV } from './cameraRig.ts';
import { PANEL_DEPTH, PANEL_WIDTH, type Layout, type Panel } from './layout.ts';

/**
 * The locations' life (3b, D-41): motes over the ruins, snow over the ice, embers over the
 * volcano, sparkles in the heavens. One draw call per location; the time moves only on frames
 * that are drawn anyway (moves, flights, the viewer's drags) — at rest it costs nothing (PERF-1),
 * and a location off screen is culled (PERF-2).
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  attribute vec3 seed;
  varying float vAlpha;
  const float TAU = 6.2831853;
  void main() {
    vec3 p = position;
    float low = ${AMBIENT_HEIGHT[0].toFixed(2)};
    float span = ${(AMBIENT_HEIGHT[1] - AMBIENT_HEIGHT[0]).toFixed(2)};
    #if KIND == 0
      p.y += sin(uTime * 0.8 + seed.x * TAU) * 0.25;
      p.x += sin(uTime * 0.3 + seed.y * TAU) * 0.3;
      vAlpha = 0.45 + 0.55 * sin(uTime * 2.0 + seed.z * TAU);
    #elif KIND == 1
      p.y = low + mod(p.y - low - uTime * (0.35 + 0.3 * seed.x), span);
      p.x += sin(uTime * 0.7 + seed.y * TAU) * 0.3;
      vAlpha = 0.85;
    #elif KIND == 2
      float rise = mod(p.y - low + uTime * (0.45 + 0.5 * seed.x), span);
      p.y = low + rise;
      p.x += sin(uTime * 1.3 + seed.z * TAU) * 0.15;
      vAlpha = 1.0 - rise / span;
    #else
      vAlpha = pow(0.5 + 0.5 * sin(uTime * 3.0 + seed.x * TAU), 3.0);
    #endif
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + 0.8 * seed.z) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * clamp(vAlpha, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

function makeCloud(panel: Panel): Points {
  const look = AMBIENT_LOOK[panel.ambient];
  const { positions, seeds } = ambientCloud(
    { x0: panel.x0, width: PANEL_WIDTH, depth: PANEL_DEPTH },
    panel.locationIndex * 7919,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 3));
  // The cloud moves within its panel's volume: cull by that, not by the base positions.
  geometry.boundingSphere = new Sphere(
    new Vector3(panel.x0 + PANEL_WIDTH / 2, AMBIENT_HEIGHT[1] / 2, 0),
    Math.hypot(PANEL_WIDTH / 2 + 0.5, AMBIENT_HEIGHT[1], PANEL_DEPTH / 2),
  );
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: { KIND: look.kind },
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: look.size },
      uScale: { value: 400 },
      uColor: { value: new Color(look.color) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new Points(geometry, material);
}

/** Moves the clouds' time on and keeps their point sizes in step with the canvas. */
function tick(clouds: Points[], step: number, scale: number) {
  for (const c of clouds) {
    const { uTime, uScale } = (c.material as ShaderMaterial).uniforms;
    if (uTime) uTime.value = (uTime.value as number) + step;
    if (uScale) uScale.value = scale;
  }
}

export function Ambient({ layout }: { layout: Layout }) {
  const clouds = useMemo(() => layout.panels.map(makeCloud), [layout]);
  useEffect(
    () => () => {
      for (const c of clouds) {
        c.geometry.dispose();
        (c.material as ShaderMaterial).dispose();
      }
    },
    [clouds],
  );
  // One clock for all clouds; a long pause (an idle board) does not make them jump.
  useFrame((state, delta) => {
    const step = Math.min(delta, 0.1);
    // Point sizes in world units: pixels per unit at distance 1.
    const scale = state.gl.domElement.height / 2 / Math.tan((FOV * Math.PI) / 360);
    tick(clouds, step, scale);
  });
  return (
    <group>
      {clouds.map((c, i) => (
        <primitive key={i} object={c} />
      ))}
    </group>
  );
}
