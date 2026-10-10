import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Material, Mesh, Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DECOR_FILE, PROPS_FILE } from './assetUrls.ts';
import { decorSpots } from './decor.ts';
import type { Layout } from './layout.ts';
import { buildProps } from './props.ts';
import { bakeScenery } from './scenery.ts';
import { PROPS, tablePlan } from './table.ts';

/** Each file once; a failed load is not kept, the next mount tries again. */
const files = new Map<string, Promise<GLTF>>();
function load(url: string): Promise<GLTF> {
  let file = files.get(url);
  if (!file) {
    file = new GLTFLoader().loadAsync(url);
    files.set(url, file);
    file.catch(() => files.delete(url));
  }
  return file;
}

/** Static meshes baked from a file; nothing while it loads or if it fails (the board works without). */
function useBaked(url: string, bake: (source: Object3D) => Mesh[], what: string): Mesh[] {
  const invalidate = useThree((s) => s.invalidate);
  const [meshes, setMeshes] = useState<Mesh[]>([]);
  useEffect(() => {
    let alive = true;
    load(url).then(
      (gltf) => {
        if (alive) {
          setMeshes(bake(gltf.scene));
          invalidate();
        }
      },
      (error: unknown) => console.warn(`Не удалось загрузить ${what}`, error),
    );
    return () => {
      alive = false;
      setMeshes([]);
    };
  }, [url, bake, what, invalidate]);
  // Freed once they have left the scene (the commit that replaced them), never while still drawn.
  useEffect(() => () => disposeMeshes(meshes), [meshes]);
  return meshes;
}

function disposeMeshes(meshes: Mesh[]) {
  for (const m of meshes) {
    m.geometry.dispose();
    (m.material as Material).dispose();
  }
}

function Baked({ meshes }: { meshes: Mesh[] }) {
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}

/** Mugs, books, coins, a candle, a shield, a sword around the board (D-43). */
export function Props({ layout }: { layout: Layout }) {
  const bake = useMemo(() => {
    const plan = tablePlan(layout.bounds);
    return (source: Object3D) => buildProps(source, plan, PROPS);
  }, [layout.bounds]);
  return <Baked meshes={useBaked(PROPS_FILE, bake, 'предметы на столе')} />;
}

/** The locations' volume on the painted panels (D-44): one draw call per texture for all of it. */
export function Decor({ layout }: { layout: Layout }) {
  const bake = useMemo(() => {
    const spots = decorSpots(layout);
    return (source: Object3D) =>
      bakeScenery(
        source,
        spots.map((s) => ({
          id: s.model,
          x: s.x,
          z: s.z,
          ground: 0,
          lift: s.lift,
          yaw: s.yaw,
          scale: s.scale,
          tint: s.tint,
        })),
      );
  }, [layout]);
  return <Baked meshes={useBaked(DECOR_FILE, bake, 'объёмные модели локаций')} />;
}
