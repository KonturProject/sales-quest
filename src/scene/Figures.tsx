import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { DoubleSide, type Group, type Sprite, type SpriteMaterial } from 'three';
import type { Team } from '../data/schemas/season.ts';
import type { TeamState } from '../engine/gameState.ts';
import { labelTexture } from './labels.ts';
import { figureSpots, type Layout } from './layout.ts';
import type { ScenePlayer } from './player.ts';

/**
 * The teams on the board: a placeholder figure per team (plan 3b brings the heroes) with a ring
 * in the team colour and a name plate (GFX-4), «+N» over a moving figure (FR-MOVE-1), and a flag on
 * each team's pace cell (FR-PACE-1). Poses come from the player every frame — no React renders.
 */

const BASE = 0.16; // on top of a cell
const HOP_HEIGHT = 0.9;
const PLATE_HEIGHT = 0.42;

function Figure({ team, scale }: { team: Team; scale: number }) {
  const plate = useMemo(
    () => labelTexture(team.leaderName, { color: '#ffffff', background: 'rgba(17,24,39,0.82)' }),
    [team.leaderName],
  );
  return (
    <group scale={scale}>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.36, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.3, 0.42, 24]} />
        <meshBasicMaterial color={team.color} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.2, 0.27, 0.62, 10]} />
        <meshLambertMaterial color={team.color} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.19, 12, 8]} />
        <meshLambertMaterial color="#f1d3b3" />
      </mesh>
      <sprite position={[0, 1.38, 0]} scale={[PLATE_HEIGHT * plate.aspect, PLATE_HEIGHT, 1]}>
        <spriteMaterial map={plate.texture} depthTest={false} transparent />
      </sprite>
    </group>
  );
}

function PaceFlag({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.1, 6]} />
        <meshLambertMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0.17, 0.95, 0]}>
        <planeGeometry args={[0.34, 0.22]} />
        <meshBasicMaterial color={color} side={DoubleSide} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

export function Figures(props: {
  layout: Layout;
  teams: Team[];
  states: TeamState[];
  player: ScenePlayer;
}) {
  const { layout, teams, states, player } = props;
  const figures = useRef(new Map<string, Group>());
  const popups = useRef(new Map<string, Sprite>());
  const shownText = useRef(new Map<string, string>());
  const scale = Math.min(Math.max(layout.cellSize / 1.8, 0.6), 1);

  const flags = useMemo(
    () =>
      figureSpots(
        layout,
        states.map((t) => ({ teamId: t.teamId, position: t.pacePosition })),
      ),
    [layout, states],
  );

  useFrame(() => {
    const poses = teams.map((t) => ({ teamId: t.id, pose: player.pose(t.id) }));
    const standing = poses
      .filter(({ pose }) => pose.f === 0 && pose.a === pose.b)
      .map(({ teamId, pose }) => ({ teamId, position: pose.a }));
    const spots = figureSpots(layout, standing);
    const last = layout.spots.length - 1;
    const spotAt = (p: number) => layout.spots[Math.min(Math.max(p, 0), last)] ?? layout.spots[0];

    for (const { teamId, pose } of poses) {
      const figure = figures.current.get(teamId);
      if (!figure) continue;
      const still = spots.get(teamId);
      if (still) {
        figure.position.set(still.x, BASE, still.z);
        continue;
      }
      const a = spotAt(pose.a);
      const b = spotAt(pose.b);
      if (!a || !b) continue;
      figure.position.set(
        a.x + (b.x - a.x) * pose.f,
        BASE + Math.sin(Math.PI * pose.f) * HOP_HEIGHT * scale,
        a.z + (b.z - a.z) * pose.f,
      );
    }

    const active = new Map(player.popups().map((p) => [p.teamId, p]));
    for (const [teamId, sprite] of popups.current) {
      const popup = active.get(teamId);
      const figure = figures.current.get(teamId);
      sprite.visible = popup !== undefined && figure !== undefined;
      if (!popup || !figure) continue;
      const material = sprite.material as SpriteMaterial;
      if (shownText.current.get(teamId) !== popup.text) {
        const label = labelTexture(popup.text, {
          color: popup.text.startsWith('+') ? '#14532d' : '#7f1d1d',
          background: 'rgba(255,255,255,0.92)',
          fontPx: 56,
          bold: true,
        });
        material.map = label.texture;
        material.needsUpdate = true;
        sprite.scale.set(0.6 * label.aspect * scale, 0.6 * scale, 1);
        shownText.current.set(teamId, popup.text);
      }
      material.opacity = popup.age > 0.8 ? (1 - popup.age) / 0.2 : 1;
      sprite.position.set(
        figure.position.x,
        figure.position.y + (1.9 + popup.age * 0.5) * scale,
        figure.position.z,
      );
    }
  });

  return (
    <group>
      {teams.map((team) => (
        <group
          key={team.id}
          ref={(g) => {
            if (g) figures.current.set(team.id, g);
            else figures.current.delete(team.id);
          }}
        >
          <Figure team={team} scale={scale} />
        </group>
      ))}
      {teams.map((team) => (
        <sprite
          key={`popup-${team.id}`}
          visible={false}
          ref={(s) => {
            if (s) popups.current.set(team.id, s);
            else popups.current.delete(team.id);
          }}
        >
          <spriteMaterial depthTest={false} transparent />
        </sprite>
      ))}
      {teams.map((team) => {
        const at = flags.get(team.id);
        return at ? (
          <group key={`pace-${team.id}`} position={[at.x, BASE, at.z]} scale={scale}>
            <PaceFlag color={team.color} />
          </group>
        ) : null;
      })}
    </group>
  );
}
