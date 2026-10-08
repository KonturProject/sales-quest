import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { Board } from './Board.tsx';
import { CameraRig } from './CameraRig.tsx';
import { FOV, poseOf, teamPose, type CameraPose } from './cameraRig.ts';
import { onCameraRequest } from './commands.ts';
import { Figures } from './Figures.tsx';
import { buildLayout, type Layout } from './layout.ts';
import { ScenePlayer, figurePositions } from './player.ts';
import { RenderStats } from './runtime/RenderStats.tsx';
import { fpsFor, paused, type RenderMode } from './runtime/policy.ts';
import { createFpsMeter, initialDpr, nextDpr, readStoredDpr, storeDpr } from './runtime/quality.ts';
import { createTicker, type Ticker } from './runtime/ticker.ts';
import { useRenderMode } from './runtime/useRenderMode.ts';
import { themeOf } from './themes.ts';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/** The point of the ground at the centre of the view — where the camera looks now. */
function lookTarget(camera: Camera): [number, number, number] {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(0, 0), camera);
  const hit = ray.ray.intersectPlane(GROUND, new Vector3());
  return hit ? [hit.x, 0, hit.z] : [0, 0, 0];
}

/**
 * The game on the board (stage 3, D-23, D-37): rendered on demand only (PERF-1) — frames come
 * from the ticker while moves or flights play, and from the camera controls while the viewer
 * moves the view; at rest the scene draws nothing.
 */
export function GameScene({ game, config }: { game: GameState; config: SeasonConfig }) {
  const layout = useMemo(
    () =>
      buildLayout(
        game.track,
        game.track.locations.map((l) => themeOf(l.themePackId)),
      ),
    [game.track],
  );
  const mode = useRenderMode({ tv: false, blurFreezeMs: config.ui.blurFreezeSec * 1000 });
  const [dpr, setDpr] = useState(() => initialDpr(window.devicePixelRatio, readStoredDpr()));
  const player = useMemo(() => new ScenePlayer(), []);

  return (
    <Canvas
      frameloop="demand"
      dpr={dpr}
      gl={{ antialias: false, preserveDrawingBuffer: false }}
      camera={{ fov: FOV, near: 0.5, far: 800, position: [0, 40, 40] }}
    >
      <RenderStats />
      <color attach="background" args={['#111827']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[25, 40, 30]} intensity={1.5} />
      <Board layout={layout} />
      <Play
        game={game}
        config={config}
        layout={layout}
        player={player}
        mode={mode}
        dpr={dpr}
        onDpr={setDpr}
      />
    </Canvas>
  );
}

function Play(props: {
  game: GameState;
  config: SeasonConfig;
  layout: Layout;
  player: ScenePlayer;
  mode: RenderMode;
  dpr: number;
  onDpr: (dpr: number) => void;
}) {
  const { game, config, layout, player, mode, dpr, onDpr } = props;
  const get = useThree((s) => s.get);
  const teams = useMemo(() => [...config.teams].sort((a, b) => a.order - b.order), [config.teams]);
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const dprNow = useRef(dpr);
  const ticker = useRef<Ticker | null>(null);
  const overview = useRef<CameraPose | null>(null);
  const onOverview = useCallback((pose: CameraPose) => {
    overview.current = pose;
  }, []);

  useEffect(() => {
    dprNow.current = dpr;
  }, [dpr]);

  // The frame clock: advances the moves, asks for a frame, measures the frame rate (PERF-8).
  useEffect(() => {
    const meter = createFpsMeter();
    const t = createTicker({
      raf: (cb) => window.requestAnimationFrame(cb),
      cancel: (id) => window.cancelAnimationFrame(id),
      onFrame: (dt) => {
        const still = player.advance(dt);
        get().invalidate();
        const fps = meter.frame(dt);
        if (fps !== null) {
          const next = nextDpr(dprNow.current, fps);
          if (next !== dprNow.current) {
            storeDpr(next);
            onDpr(next);
          }
        }
        if (!still) t.release('play');
      },
    });
    ticker.current = t;
    if (player.animating()) t.want('play');
    return () => {
      t.dispose();
      ticker.current = null;
    };
  }, [player, get, onDpr]);

  // New positions: plan the moves from the previous ones (none on the first load, FR-MOVE-4).
  useEffect(() => {
    const plan = player.load(
      game.teams.map((t) => ({ teamId: t.teamId, position: t.position })),
      `${game.track.trackLength}|${game.track.maxPosition}`,
    );
    get().invalidate();
    if (plan.duration > 0) ticker.current?.want('play');
  }, [game, player, get]);

  useEffect(() => {
    ticker.current?.setFps(fpsFor(mode));
    ticker.current?.setPaused(paused(mode));
    if (!paused(mode)) get().invalidate();
  }, [mode, get]);

  // «Весь трек» / «К лидеру» (GFX-3).
  useEffect(
    () =>
      onCameraRequest((command) => {
        const camera = get().camera;
        const from = poseOf(
          [camera.position.x, camera.position.y, camera.position.z],
          lookTarget(camera),
        );
        let to = overview.current;
        if (command === 'leader') {
          const leader = [...game.teams].sort((a, b) => b.position - a.position)[0];
          const at = leader && figurePositions(layout, player, teamIds)(leader.teamId);
          if (at) to = teamPose(at, config.ui.camera);
        }
        if (!to) return;
        player.flyTo(from, to);
        ticker.current?.want('play');
      }),
    [get, game.teams, layout, player, teamIds, config.ui.camera],
  );

  return (
    <>
      <Figures layout={layout} teams={teams} states={game.teams} player={player} />
      <CameraRig
        layout={layout}
        angles={config.ui.camera}
        player={player}
        teamIds={teamIds}
        onOverview={onOverview}
      />
    </>
  );
}
