import { Canvas, useThree } from '@react-three/fiber';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { Ambient } from './Ambient.tsx';
import { Board } from './Board.tsx';
import { Decor, Gates, Props } from './Scenery.tsx';
import { clearLabels } from './labels.ts';
import { Table } from './Table.tsx';
import { CameraRig } from './CameraRig.tsx';
import { FOV, poseOf, teamPose, type CameraPose } from './cameraRig.ts';
import { onCameraRequest } from './commands.ts';
import { Figures } from './Figures.tsx';
import { buildLayout, type Layout } from './layout.ts';
import { ScenePlayer, figurePositions } from './player.ts';
import { cycleStep, groupBounds, positionsKey, restCycle, teamGroups } from './restView.ts';
import { RenderStats } from './runtime/RenderStats.tsx';
import { ViewWindow } from './ViewWindow.tsx';
import { paused, type RenderMode } from './runtime/policy.ts';
import {
  createQualityGovernor,
  lowerLevel,
  qualityAt,
  readStoredLevel,
  storeLevel,
  storeMeasure,
} from './runtime/quality.ts';
import { createTicker, type Ticker } from './runtime/ticker.ts';
import { useRenderMode } from './runtime/useRenderMode.ts';
import { themeOf } from './themes.ts';

const ROOM_DARK = '#0e0c0a';

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
export const GameScene = memo(function GameScene({
  game,
  config,
  tv = false,
  onLevel,
}: {
  game: GameState;
  config: SeasonConfig;
  /** A wall screen (PERF-5): no freeze out of focus, no idle slow-down, the teams in turn. */
  tv?: boolean;
  /** The level of the quality ladder, for the HUD's offer of the 2D scheme at its bottom (D-45). */
  onLevel?: (level: number) => void;
}) {
  // By value: every recompute makes a new `track` object, but the board only changes with the
  // track's shape (review 3a: rebuilding it re-uploaded the board and reset the camera).
  const { cellsPerLocation, trackLength, overflowCells } = game.track;
  const themeIds = game.track.locations.map((l) => l.themePackId).join('|');
  const layout = useMemo(
    () =>
      buildLayout(
        { cellsPerLocation, trackLength, overflowCells },
        themeIds.split('|').map(themeOf),
      ),
    [cellsPerLocation, trackLength, overflowCells, themeIds],
  );
  const mode = useRenderMode({ tv, blurFreezeMs: config.ui.blurFreezeSec * 1000 });
  // The quality ladder (D-45): the remembered level, else the top; the scene steps down itself.
  const [level, setLevel] = useState(() => readStoredLevel() ?? 0);
  const quality = qualityAt(level, window.devicePixelRatio);
  useEffect(() => onLevel?.(level), [level, onLevel]);
  // The texts drawn into textures go with the scene (PERF-12): a new season remounts it (MapPage).
  useEffect(() => () => clearLabels(), []);
  const player = useMemo(() => new ScenePlayer(), []);

  return (
    <Canvas
      frameloop="demand"
      dpr={quality.dpr}
      gl={{ antialias: false, preserveDrawingBuffer: false }}
      camera={{ fov: FOV, near: 0.5, far: 800, position: [0, 40, 40] }}
    >
      <RenderStats />
      <ViewWindow layout={layout} busy={() => player.animating()} />
      {/* The dark room beyond the table (D-43). */}
      <color attach="background" args={[ROOM_DARK]} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[25, 40, 30]} intensity={1.5} />
      <Table layout={layout} />
      {quality.scenery && <Props layout={layout} />}
      {quality.scenery && <Decor layout={layout} />}
      <Board layout={layout} sharp={quality.anisotropy} />
      <Gates layout={layout} />
      {quality.ambient && <Ambient layout={layout} />}
      <Play
        game={game}
        config={config}
        layout={layout}
        player={player}
        mode={mode}
        tv={tv}
        level={level}
        onLevel={setLevel}
      />
    </Canvas>
  );
});

/** Moves play at the full rate even in the idle mode: they are the event (PERF-7 slows ambient). */
const MOVES_FPS = 30;

function Play(props: {
  game: GameState;
  config: SeasonConfig;
  layout: Layout;
  player: ScenePlayer;
  mode: RenderMode;
  tv: boolean;
  level: number;
  onLevel: (level: number) => void;
}) {
  const { game, config, layout, player, mode, tv, level, onLevel } = props;
  const get = useThree((s) => s.get);
  const teams = useMemo(() => [...config.teams].sort((a, b) => a.order - b.order), [config.teams]);
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const levelNow = useRef(level);
  const ticker = useRef<Ticker | null>(null);
  const overview = useRef<CameraPose | null>(null);
  const onOverview = useCallback((pose: CameraPose) => {
    overview.current = pose;
  }, []);

  useEffect(() => {
    levelNow.current = level;
  }, [level]);

  const modeNow = useRef(mode);
  useEffect(() => {
    modeNow.current = mode;
  }, [mode]);

  // The frame clock: advances the moves, asks for a frame, and judges the frame rate of moves
  // played at the full rate in the active mode only (PERF-8, review 3a): two slow windows in a
  // row — one level down the quality ladder (D-45). Each window is kept for `#/debug` (OQ-24).
  useEffect(() => {
    const governor = createQualityGovernor();
    const t = createTicker(
      {
        raf: (cb) => window.requestAnimationFrame(cb),
        cancel: (id) => window.cancelAnimationFrame(id),
        onFrame: (dt) => {
          const measuring = modeNow.current === 'active' && player.moving();
          const still = player.advance(dt);
          get().invalidate();
          const measured = governor.frame(dt, { measuring, targetFps: MOVES_FPS });
          if (measured) {
            const now = levelNow.current;
            storeMeasure({ fps: Math.round(measured.fps * 10) / 10, level: now, at: Date.now() });
            const next = measured.stepDown ? lowerLevel(now, window.devicePixelRatio) : now;
            if (next !== now) {
              storeLevel(next);
              levelNow.current = next;
              onLevel(next);
            }
          }
          if (!still) t.release('play');
        },
      },
      MOVES_FPS,
    );
    ticker.current = t;
    if (player.animating()) t.want('play');
    return () => {
      t.dispose();
      ticker.current = null;
    };
  }, [player, get, onLevel]);

  // The viewer's own camera moves are drawn by the ticker as well (≤ 30 FPS, PERF-1); the scene
  // leaves the camera alone for a while after the last touch (D-42).
  const lastViewer = useRef(0);
  const onUser = useCallback((active: boolean) => {
    lastViewer.current = Date.now();
    if (active) ticker.current?.want('user');
    else ticker.current?.release('user');
  }, []);
  const onFlight = useCallback(() => ticker.current?.want('play'), []);

  // The rest view (D-42): the window of a group of teams; with several groups, the next one every
  // minute — not while moves play, the tab is hidden or frozen, or the viewer has just been at the
  // camera. New positions start again from the leaders.
  const positions = useMemo(
    () => game.teams.map((t) => ({ teamId: t.teamId, position: t.position })),
    [game.teams],
  );
  const { everyMs, gap } = restCycle(tv);
  const groups = useMemo(() => teamGroups(positions, gap), [positions, gap]);
  const key = positionsKey(positions);
  const [cycle, setCycle] = useState({ key: '', index: 0, nonce: 0 });
  const index = cycle.key === key ? cycle.index : 0;
  const group = groups.length > 0 ? groups[index % groups.length] : undefined;
  const rest = useMemo(() => (group ? groupBounds(layout, group) : layout.bounds), [layout, group]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const step = cycleStep({
        paused: paused(modeNow.current),
        animating: player.animating(),
        sinceViewerMs: Date.now() - lastViewer.current,
        groups: groups.length,
        userCamera: player.userCamera,
      });
      if (step === 'skip') return;
      player.resume();
      setCycle((c) => ({
        key,
        index: (c.key === key ? c.index : 0) + (step === 'advance' ? 1 : 0),
        nonce: c.nonce + 1,
      }));
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [key, groups.length, player, everyMs]);
  const ticking = useCallback(() => ticker.current?.running() ?? false, []);

  // New positions: plan the moves from the previous ones (none on the first load, FR-MOVE-4);
  // a hero cheers after passing a gate.
  const gates = useMemo(
    () =>
      layout.spots
        .filter((s) => s.kind === 'checkpoint' || s.kind === 'finish')
        .map((s) => s.position),
    [layout],
  );
  useEffect(() => {
    const plan = player.load(
      game.teams.map((t) => ({ teamId: t.teamId, position: t.position })),
      `${game.track.trackLength}|${game.track.maxPosition}`,
      gates,
    );
    get().invalidate();
    if (plan.duration > 0) ticker.current?.want('play');
  }, [game, player, get, gates]);

  useEffect(() => {
    ticker.current?.setPaused(paused(mode));
    if (!paused(mode)) get().invalidate();
  }, [mode, get]);

  // «Весь трек» / «К лидеру» (GFX-3), a team's marker on the mini-map (GFX-5).
  useEffect(
    () =>
      onCameraRequest((command) => {
        const camera = get().camera;
        const from = poseOf(
          [camera.position.x, camera.position.y, camera.position.z],
          lookTarget(camera),
        );
        let to = overview.current;
        if (command !== 'overview') {
          const teamId =
            command === 'leader'
              ? [...game.teams].sort((a, b) => b.position - a.position)[0]?.teamId
              : command.team;
          const at = teamId && figurePositions(layout, player, teamIds)(teamId);
          if (at) to = teamPose(at, config.ui.camera);
        }
        if (!to) return;
        lastViewer.current = Date.now();
        player.flyTo(from, to);
        ticker.current?.want('play');
      }),
    [get, game.teams, layout, player, teamIds, config.ui.camera],
  );

  return (
    <>
      <Figures
        layout={layout}
        teams={teams}
        states={game.teams}
        player={player}
        cameraYawDeg={config.ui.camera.yawDeg}
      />
      <CameraRig
        layout={layout}
        angles={config.ui.camera}
        player={player}
        teamIds={teamIds}
        rest={rest}
        restNonce={cycle.nonce}
        onOverview={onOverview}
        onFlight={onFlight}
        onUser={onUser}
        ticking={ticking}
      />
    </>
  );
}
