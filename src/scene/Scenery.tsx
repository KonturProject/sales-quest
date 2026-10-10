import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Material, Mesh, Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DECOR_FILE, PROPS_FILE } from './assetUrls.ts';
import { BoxGates } from './Board.tsx';
import { decorSpots } from './decor.ts';
import type { Layout } from './layout.ts';
import { buildProps } from './props.ts';
import { GATE_LINTEL, GATE_PILLAR, gatePlacements } from './gates.ts';
import { beginLoad } from './runtime/loading.ts';
import { bakeScenery, sizeOf } from './scenery.ts';
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
    const done = beginLoad();
    load(url)
      .then((gltf) => {
        if (alive) {
          setMeshes(bake(gltf.scene));
          invalidate();
        }
      })
      // A failed load or bake: the board works without (and the gates fall back to plain ones).
      .catch((error: unknown) => console.warn(`Не удалось загрузить ${what}`, error))
      .finally(done);
    return () => {
      alive = false;
      done();
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

/**
 * The gates of the checkpoints and the finish in the board's style (FR-TRACK-1): pillars and a
 * lintel of the Dungeon pack. They mark the track, so they stay on every level of the quality
 * ladder; the plain gates stand in while the file loads or if it cannot.
 */
export function Gates({ layout }: { layout: Layout }) {
  const bake = useMemo(
    () => (source: Object3D) => {
      const pillar = sizeOf(source, GATE_PILLAR);
      const lintel = sizeOf(source, GATE_LINTEL);
      return pillar && lintel ? bakeScenery(source, gatePlacements(layout, pillar, lintel)) : [];
    },
    [layout],
  );
  const meshes = useBaked(DECOR_FILE, bake, 'ворота');
  return meshes.length > 0 ? <Baked meshes={meshes} /> : <BoxGates layout={layout} />;
}
