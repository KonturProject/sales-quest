import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Material, Mesh } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PROPS_FILE } from './assetUrls.ts';
import type { Layout } from './layout.ts';
import { buildProps } from './props.ts';
import { PROPS, tablePlan } from './table.ts';

/** The props file, loaded once; a failed load is not kept, the next mount tries again. */
let file: Promise<GLTF> | null = null;
function loadProps(): Promise<GLTF> {
  if (!file) {
    file = new GLTFLoader().loadAsync(PROPS_FILE);
    file.catch(() => {
      file = null;
    });
  }
  return file;
}

/** Mugs, books, a shield, a sword around the board (D-43): static, a draw call per texture. */
export function Props({ layout }: { layout: Layout }) {
  const plan = useMemo(() => tablePlan(layout.bounds), [layout.bounds]);
  const invalidate = useThree((s) => s.invalidate);
  const [meshes, setMeshes] = useState<Mesh[]>([]);
  useEffect(() => {
    let alive = true;
    let made: Mesh[] = [];
    loadProps().then(
      (gltf) => {
        if (!alive) return;
        made = buildProps(gltf.scene, plan, PROPS);
        setMeshes(made);
        invalidate();
      },
      // The table stays bare: nothing of the game depends on its props.
      (error: unknown) => console.warn('Не удалось загрузить предметы на столе', error),
    );
    return () => {
      alive = false;
      for (const m of made) {
        m.geometry.dispose();
        (m.material as Material).dispose();
      }
      setMeshes([]);
    };
  }, [plan, invalidate]);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}
