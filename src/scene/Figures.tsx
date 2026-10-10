import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DoubleSide, type Group, type Sprite, type SpriteMaterial } from 'three';
import type { Team } from '../data/schemas/season.ts';
import type { TeamState } from '../engine/gameState.ts';
import { disposeRig, heroTemplate, makeRig, poseRig, type HeroRig } from './heroAssets.ts';
import { variantFor } from './heroCatalog.ts';
import { heroAction, heroYaw, settleYaw } from './heroes.ts';
import { labelTexture } from './labels.ts';
import { cellStack, figureSpots, type Layout } from './layout.ts';
import type { ScenePlayer } from './player.ts';

/**
 * The teams on the board: a KayKit hero per team in the team colour (D-41; a placeholder figure
 * until the heroes have loaded) with a ring in the team colour and a name plate (GFX-4), «+N шагов»
 * over a moving figure (FR-MOVE-1), and a flag on each team's pace cell (FR-PACE-1). Positions and
 * poses come from the player every frame — no React renders.
 */

const BASE = 0.16; // on top of a cell
const HOP_HEIGHT = 0.9; // the placeholder's own arc
const HERO_HOP = 0.35; // a hero jumps in its clip; a small arc carries it to the next cell
const PLATE_HEIGHT = 0.42;
const PLATE_Y = { placeholder: 1.38, hero: 1.95 };
/** Figures sharing a cell stack their plates, so the names do not overlap (FR-MOVE-2). */
const PLATE_STEP = 0.5;
const POPUP_Y = { placeholder: 1.9, hero: 2.5 };

function Ground({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.36, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.3, 0.42, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </>
  );
}

/** Until the heroes load (or if they fail): a body and a head in the team colour. */
function Placeholder({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.2, 0.27, 0.62, 10]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.19, 12, 8]} />
        <meshLambertMaterial color="#f1d3b3" />
      </mesh>
    </>
  );
}

function Plate({
  name,
  y,
  onSprite,
}: {
  name: string;
  y: number;
  onSprite: (s: Sprite | null) => void;
}) {
  const plate = useMemo(() => labelTexture(name, 'name'), [name]);
  return (
    <sprite
      ref={onSprite}
      position={[0, y, 0]}
      scale={[PLATE_HEIGHT * plate.aspect, PLATE_HEIGHT, 1]}
    >
      <spriteMaterial map={plate.texture} depthTest={false} transparent />
    </sprite>
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

/** The heroes of the teams, loaded once per set of teams; null while loading or if it failed. */
function useHeroRigs(teams: Team[]): Map<string, HeroRig> | null {
  const invalidate = useThree((s) => s.invalidate);
  const [rigs, setRigs] = useState<Map<string, HeroRig> | null>(null);
  const key = JSON.stringify(teams.map((t) => [t.id, t.characterId, t.color]));
  useEffect(() => {
    let alive = true;
    let made: HeroRig[] = [];
    const list = JSON.parse(key) as [string, string, string][];
    // Each team on its own: a hero that fails to load leaves only its team on the placeholder.
    void Promise.allSettled(
      list.map(([id, characterId, color], place) =>
        heroTemplate(variantFor(characterId, place)).then(
          (template) => [id, makeRig(template, color)] as const,
        ),
      ),
    ).then((results) => {
      const entries = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      for (const r of results)
        if (r.status === 'rejected') console.warn('Не удалось загрузить героя', r.reason);
      made = entries.map(([, rig]) => rig);
      if (!alive) return made.forEach(disposeRig);
      if (entries.length === 0) return;
      setRigs(new Map(entries));
      invalidate();
    });
    return () => {
      alive = false;
      made.forEach(disposeRig);
      setRigs(null);
    };
  }, [key, invalidate]);
  return rigs;
}

export function Figures(props: {
  layout: Layout;
  teams: Team[];
  states: TeamState[];
  player: ScenePlayer;
  /** The viewer's side (`ui.camera.yawDeg`): heroes at rest face it. */
  cameraYawDeg: number;
}) {
  const { layout, teams, states, player, cameraYawDeg } = props;
  const figures = useRef(new Map<string, Group>());
  const bodies = useRef(new Map<string, Group>());
  const popups = useRef(new Map<string, Sprite>());
  const plates = useRef(new Map<string, Sprite>());
  const shownText = useRef(new Map<string, string>());
  const scale = Math.min(Math.max(layout.cellSize / 1.4, 0.6), 1);
  const rigs = useHeroRigs(teams);
  const kindOf = (teamId: string) => (rigs?.has(teamId) ? 'hero' : 'placeholder');

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
    // The n-th figure on a shared cell lifts its plate by n steps.
    const stack = cellStack(layout, standing);
    const spotAt = (p: number) => layout.spots[Math.min(Math.max(p, 0), last)] ?? layout.spots[0];

    for (const { teamId, pose } of poses) {
      const figure = figures.current.get(teamId);
      const body = bodies.current.get(teamId);
      if (!figure || !body) continue;
      const rig = rigs?.get(teamId);
      const action = heroAction(player.plan, teamId, player.clock);
      const still = spots.get(teamId);
      let step: { dx: number; dz: number } | null = null;
      if (still) {
        figure.position.set(still.x, BASE, still.z);
        body.position.y = 0;
      } else {
        const a = spotAt(pose.a);
        const b = spotAt(pose.b);
        if (!a || !b) continue;
        step = { dx: b.x - a.x, dz: b.z - a.z };
        figure.position.set(a.x + step.dx * pose.f, BASE, a.z + step.dz * pose.f);
        // A hero jumps in its clip; without one (or without a hero) the figure hops by itself.
        const arc = rig?.actions.hop ? (action.clip === 'hop' ? HERO_HOP : 0) : HOP_HEIGHT;
        body.position.y = Math.sin(Math.PI * pose.f) * arc; // inside the figure's scale
      }
      const plate = plates.current.get(teamId);
      if (plate) plate.position.y = PLATE_Y[kindOf(teamId)] + (stack.get(teamId) ?? 0) * PLATE_STEP;
      if (rig) {
        let yaw = heroYaw(action.clip === 'cheer' ? null : step, cameraYawDeg);
        // Just after its walk the hero turns from the way ahead to the viewer, not at once.
        const move = step ? undefined : player.plan.moves.find((m) => m.teamId === teamId);
        if (move && player.clock >= move.end && move.to !== move.from) {
          const back = spotAt(move.to - Math.sign(move.to - move.from));
          const end = spotAt(move.to);
          if (back && end)
            yaw = settleYaw(
              heroYaw({ dx: end.x - back.x, dz: end.z - back.z }, cameraYawDeg),
              yaw,
              player.clock - move.end,
            );
        }
        rig.root.rotation.y = yaw;
        poseRig(rig, action);
      }
    }

    const active = new Map(player.popups().map((p) => [p.teamId, p]));
    for (const [teamId, sprite] of popups.current) {
      const popup = active.get(teamId);
      const figure = figures.current.get(teamId);
      sprite.visible = popup !== undefined && figure !== undefined;
      if (!popup || !figure) continue;
      const material = sprite.material as SpriteMaterial;
      if (shownText.current.get(teamId) !== popup.text) {
        const label = labelTexture(popup.text, popup.text.startsWith('+') ? 'gain' : 'loss');
        material.map = label.texture;
        material.needsUpdate = true;
        sprite.scale.set(0.6 * label.aspect * scale, 0.6 * scale, 1);
        shownText.current.set(teamId, popup.text);
      }
      material.opacity = popup.age > 0.8 ? (1 - popup.age) / 0.2 : 1;
      sprite.position.set(
        figure.position.x,
        figure.position.y +
          ((bodies.current.get(teamId)?.position.y ?? 0) +
            POPUP_Y[kindOf(teamId)] +
            popup.age * 0.5) *
            scale,
        figure.position.z,
      );
    }
  });

  return (
    <group>
      {teams.map((team) => {
        const rig = rigs?.get(team.id);
        return (
          <group
            key={team.id}
            ref={(g) => {
              if (g) figures.current.set(team.id, g);
              else figures.current.delete(team.id);
            }}
          >
            <group scale={scale}>
              <Ground color={team.color} />
              <group
                ref={(g) => {
                  if (g) bodies.current.set(team.id, g);
                  else bodies.current.delete(team.id);
                }}
              >
                {rig ? <primitive object={rig.root} /> : <Placeholder color={team.color} />}
                <Plate
                  name={team.leaderName}
                  y={PLATE_Y[kindOf(team.id)]}
                  onSprite={(s) => {
                    if (s) plates.current.set(team.id, s);
                    else plates.current.delete(team.id);
                  }}
                />
              </group>
            </group>
          </group>
        );
      })}
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
