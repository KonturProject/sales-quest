import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
} from 'three';
import { BOARD_ART } from './assetUrls.ts';
import { PANEL_DEPTH, PANEL_WIDTH, type Layout, type Panel, type Spot } from './layout.ts';

/**
 * The board (D-37, D-41, FR-TRACK): the author's painted panels side by side, cells as one
 * instanced mesh on the painted paths, gates at the checkpoints and the finish, the START pad,
 * the platform beyond the finish. A panel shows its plain colour until its art has loaded; a theme
 * without art keeps the colour and gets its path drawn as a line.
 */

const CELL_COLORS: Record<Spot['kind'], string> = {
  start: '#f4f1e8',
  cell: '#d9d4c7',
  checkpoint: '#e8c45a',
  finish: '#f2b632',
  overflow: '#cfe3f0',
};
const CELL_HEIGHT = 0.16;
/** Anisotropic filtering keeps the tilted board sharp; 4 is cheap even on Intel HD. */
const ANISOTROPY = 4;

function Cells({ layout }: { layout: Layout }) {
  const mesh = useMemo(() => {
    const radius = layout.cellSize / 2;
    const geometry = new CylinderGeometry(radius, radius * 1.06, CELL_HEIGHT, 6);
    const material = new MeshLambertMaterial();
    const cells = new InstancedMesh(geometry, material, layout.spots.length);
    const dummy = new Object3D();
    const color = new Color();
    layout.spots.forEach((spot, i) => {
      const scale = spot.kind === 'start' ? 1.5 : spot.kind === 'finish' ? 1.25 : 1;
      dummy.position.set(spot.x, CELL_HEIGHT / 2, spot.z);
      dummy.rotation.set(0, spot.heading + Math.PI / 6, 0);
      dummy.scale.set(scale, 1, scale);
      dummy.updateMatrix();
      cells.setMatrixAt(i, dummy.matrix);
      cells.setColorAt(i, color.set(CELL_COLORS[spot.kind]));
    });
    return cells;
  }, [layout]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

/** Two posts and a lintel across the path at every checkpoint and at the finish (FR-TRACK-1). */
function Gates({ layout }: { layout: Layout }) {
  const mesh = useMemo(() => {
    const gates = layout.spots.filter((s) => s.kind === 'checkpoint' || s.kind === 'finish');
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshLambertMaterial();
    const parts = new InstancedMesh(geometry, material, gates.length * 3);
    const dummy = new Object3D();
    const color = new Color();
    const half = layout.cellSize * 0.75;
    const post = Math.max(layout.cellSize * 0.12, 0.12);
    const height = Math.max(layout.cellSize * 1.1, 1.2);
    gates.forEach((spot, g) => {
      // Across the path: perpendicular to the heading.
      const side = new Vector3(Math.sin(spot.heading), 0, Math.cos(spot.heading));
      const place = (
        i: number,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
      ) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, spot.heading, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        parts.setMatrixAt(g * 3 + i, dummy.matrix);
        parts.setColorAt(g * 3 + i, color.set(spot.kind === 'finish' ? '#f2b632' : '#d8c7a6'));
      };
      for (const [i, s] of [
        [0, 1],
        [1, -1],
      ] as const)
        place(
          i,
          spot.x + side.x * half * s,
          height / 2,
          spot.z + side.z * half * s,
          post,
          height,
          post,
        );
      place(2, spot.x, height, spot.z, post * 1.4, post * 1.4, half * 2 + post * 2);
    });
    return parts;
  }, [layout]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

function PathLine({ points }: { points: { x: number; z: number }[] }) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry().setFromPoints(
      points.map((p) => new Vector3(p.x, 0.02, p.z)),
    );
    const material = new LineBasicMaterial({ color: '#2d2a26', transparent: true, opacity: 0.45 });
    return new Line(geometry, material);
  }, [points]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
    },
    [line],
  );
  return <primitive object={line} />;
}

/** The painted panel, unlit and not tone-mapped: the art keeps the light it was painted with. */
function PanelArt({ panel }: { panel: Panel }) {
  const url = BOARD_ART[panel.themePackId];
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let loaded: Texture | null = null;
    new TextureLoader().load(url, (t) => {
      if (!alive) return t.dispose();
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = ANISOTROPY;
      loaded = t;
      setTexture(t);
      invalidate();
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [url, invalidate]);
  return (
    <>
      <mesh position={[panel.x0 + PANEL_WIDTH / 2, 0, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[PANEL_WIDTH, PANEL_DEPTH]} />
        {/* Keys: a new material compiles with the map; reusing the plain one would leave it black. */}
        {texture ? (
          <meshBasicMaterial key="art" map={texture} toneMapped={false} />
        ) : (
          <meshBasicMaterial key="plain" color={panel.color} toneMapped={false} />
        )}
      </mesh>
      {url ? null : <PathLine points={panel.path} />}
    </>
  );
}

export function Board({ layout }: { layout: Layout }) {
  const { overflow } = layout;
  return (
    <group>
      {layout.panels.map((panel) => (
        // By theme too: another location's art must not linger on the panel (review 3b).
        <PanelArt key={`${panel.locationIndex}:${panel.themePackId}`} panel={panel} />
      ))}
      <mesh position={[(overflow.x0 + overflow.x1) / 2, -0.02, overflow.z]}>
        <boxGeometry args={[overflow.x1 - overflow.x0, 0.06, layout.cellSize * 3]} />
        <meshLambertMaterial color="#e9f2f8" />
      </mesh>
      <Cells layout={layout} />
      <Gates layout={layout} />
    </group>
  );
}
