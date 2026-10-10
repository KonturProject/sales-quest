import { memo, useEffect, useMemo, useState } from 'react';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { SHIELD } from '../hud/shield.ts';
import { BOARD_ART } from '../scene/assetUrls.ts';
import {
  EMPTY_PLAN,
  planMoves,
  popupsAt,
  type Plan,
  type TeamPosition,
} from '../scene/choreography.ts';
import { onCameraRequest } from '../scene/commands.ts';
import { PANEL_DEPTH, PANEL_WIDTH, cellStack, figureSpots, type Layout } from '../scene/layout.ts';
import { themeOf } from '../scene/themes.ts';
import { SCHEME_TIMING, schemeLayout, shortName, tokenCell, viewBox, zoomOn } from './geometry.ts';

/** How often the plan of moves is read while it plays; CSS transitions draw in between. */
const TICK_MS = 100;
/** «К лидеру» — how close. */
const ZOOM = 2.2;
const HAZE = '#2d4050';
const SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

/**
 * The 2D scheme (GFX-6): the board from above in SVG — the painted panels, the cells of the scene
 * in the same order, the teams as shields with the leaders' names, the pace flags. Moves play the
 * scene's plan cell by cell with CSS transitions, read ten times a second while they last: no frame
 * loop, nothing drawn at rest. A lazy chunk: only viewers of the scheme download it.
 */
export default function Scheme({ game, config }: { game: GameState; config: SeasonConfig }) {
  const { cellsPerLocation, trackLength, overflowCells } = game.track;
  const themeIds = game.track.locations.map((l) => l.themePackId).join('|');
  const layout = useMemo(
    () =>
      schemeLayout(
        { cellsPerLocation, trackLength, overflowCells },
        themeIds.split('|').map(themeOf),
      ),
    [cellsPerLocation, trackLength, overflowCells, themeIds],
  );
  const teams = useMemo(() => [...config.teams].sort((a, b) => a.order - b.order), [config.teams]);
  const positions = useMemo(
    () => game.teams.map((t) => ({ teamId: t.teamId, position: t.position })),
    [game.teams],
  );
  const gates = useMemo(
    () =>
      layout.spots
        .filter((s) => s.kind === 'checkpoint' || s.kind === 'finish')
        .map((s) => s.position),
    [layout],
  );
  const { plan, t } = useMoves(positions, gates);

  // «Весь трек» / «К лидеру» (GFX-3): the whole board, or closer around the leader.
  const [zoom, setZoom] = useState({ tx: 0, ty: 0, scale: 1 });
  useEffect(
    () =>
      onCameraRequest((command) => {
        if (command === 'overview') return setZoom({ tx: 0, ty: 0, scale: 1 });
        const team =
          command === 'leader'
            ? [...positions].sort((a, b) => b.position - a.position)[0]
            : positions.find((p) => p.teamId === command.team);
        const spot =
          team && layout.spots[Math.min(Math.max(team.position, 0), layout.spots.length - 1)];
        if (spot) setZoom(zoomOn(layout.bounds, spot, ZOOM));
      }),
    [positions, layout],
  );

  const titles = useMemo(
    () => new Map(config.locations.map((l) => [l.index, l.title])),
    [config.locations],
  );
  const paces = useMemo(
    () =>
      figureSpots(
        layout,
        game.teams.map((s) => ({ teamId: s.teamId, position: s.pacePosition })),
      ),
    [layout, game.teams],
  );
  const b = layout.bounds;
  return (
    <div className="sq-screen absolute inset-0 px-4 pt-16 pb-60 lg:pr-[336px] lg:pb-36">
      <svg
        role="img"
        aria-label="Схема трека"
        viewBox={viewBox(b)}
        className="h-full w-full"
        fontFamily={SERIF}
      >
        <clipPath id="sq-scheme-board">
          <rect x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} />
        </clipPath>
        <g clipPath="url(#sq-scheme-board)">
          <g
            style={{
              transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`,
              transition: 'transform 700ms ease-in-out',
            }}
          >
            <Board layout={layout} titles={titles} />
            {teams.map((team) => {
              const at = paces.get(team.id);
              return at ? (
                <PaceFlag key={team.id} at={at} color={team.color} size={layout.cellSize} />
              ) : null;
            })}
            <Tokens layout={layout} teams={teams} positions={positions} plan={plan} t={t} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * The plan of moves from the previous positions to these (FR-MOVE-1…4): none on the first render
 * (FR-MOVE-4), else played on a timer until its end.
 */
function useMoves(positions: TeamPosition[], gates: number[]): { plan: Plan; t: number } {
  const [previous, setPrevious] = useState(positions);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [t, setT] = useState(0);
  if (positions !== previous) {
    setPrevious(positions);
    setPlan(planMoves(previous, positions, SCHEME_TIMING, gates));
    setT(0);
  }
  useEffect(() => {
    if (plan.duration === 0) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now() - start;
      setT(Math.min(now, plan.duration));
      if (now >= plan.duration) window.clearInterval(timer);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [plan]);
  return { plan, t };
}

/** The board: drawn once per layout, never with the moves. */
const Board = memo(function Board({
  layout,
  titles,
}: {
  layout: Layout;
  titles: Map<number, string>;
}) {
  const b = layout.bounds;
  const c = layout.cellSize;
  const line = layout.spots.map((s) => `${s.x},${s.z}`).join(' ');
  return (
    <g>
      <rect x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} fill={HAZE} />
      {layout.panels.map((p) => {
        const art = BOARD_ART[p.themePackId];
        const y = p.z0 - PANEL_DEPTH / 2;
        return art ? (
          <image
            key={p.locationIndex}
            href={art}
            x={p.x0}
            y={y}
            width={PANEL_WIDTH}
            height={PANEL_DEPTH}
            preserveAspectRatio="none"
            // The snake's second row travels right to left: its art is mirrored, as in the scene.
            transform={
              p.mirrored ? `translate(${2 * p.x0 + PANEL_WIDTH} 0) scale(-1 1)` : undefined
            }
          />
        ) : (
          <rect
            key={p.locationIndex}
            x={p.x0}
            y={y}
            width={PANEL_WIDTH}
            height={PANEL_DEPTH}
            fill={p.color}
          />
        );
      })}
      {layout.panels.map((p) => (
        <Plaque
          key={p.locationIndex}
          x={p.x0 + 0.6}
          y={p.z0 - PANEL_DEPTH / 2 + 0.6}
          text={titles.get(p.locationIndex) ?? ''}
          size={c * 0.55}
        />
      ))}
      <polyline
        points={line}
        fill="none"
        stroke="#f1e5c4"
        strokeOpacity={0.7}
        strokeWidth={c * 0.09}
        strokeDasharray={`${c * 0.25} ${c * 0.18}`}
      />
      {layout.spots.map((s) =>
        s.kind === 'checkpoint' || s.kind === 'finish' ? (
          <g key={s.position}>
            <rect
              x={s.x - c * 0.36}
              y={s.z - c * 0.36}
              width={c * 0.72}
              height={c * 0.72}
              transform={`rotate(45 ${s.x} ${s.z})`}
              fill={s.kind === 'finish' ? '#f6e3b4' : '#c9a462'}
              stroke="#0b0704"
              strokeWidth={c * 0.07}
            />
            {s.kind === 'finish' && (
              <text
                x={s.x}
                y={s.z + c * 1.05}
                textAnchor="middle"
                fontSize={c * 0.5}
                fontWeight={700}
                fill="#f6e3b4"
                stroke="#0b0704"
                strokeWidth={c * 0.08}
                paintOrder="stroke"
              >
                ФИНИШ
              </text>
            )}
          </g>
        ) : (
          <circle
            key={s.position}
            cx={s.x}
            cy={s.z}
            r={s.kind === 'start' ? c * 0.38 : c * 0.26}
            fill={s.kind === 'overflow' ? '#d6bf8e' : '#f1e5c4'}
            fillOpacity={0.92}
            stroke="#0b0704"
            strokeWidth={c * 0.06}
          />
        ),
      )}
      {layout.spots[0] && (
        <text
          x={layout.spots[0].x}
          y={layout.spots[0].z + c * 0.95}
          textAnchor="middle"
          fontSize={c * 0.45}
          fontWeight={700}
          fill="#f6e3b4"
          stroke="#0b0704"
          strokeWidth={c * 0.08}
          paintOrder="stroke"
        >
          СТАРТ
        </text>
      )}
    </g>
  );
});

/** A dark plate with golden text: a location's name, a leader's name. */
function Plaque({
  x,
  y,
  text,
  size,
  anchor = 'start',
}: {
  x: number;
  y: number;
  text: string;
  size: number;
  anchor?: 'start' | 'middle';
}) {
  // SVG cannot size a box to its text without measuring; Palatino's Cyrillic is about 0.58 em wide.
  const w = text.length * size * 0.58 + size * 0.9;
  const h = size * 1.45;
  const left = anchor === 'middle' ? x - w / 2 : x;
  return (
    <g>
      <rect
        x={left}
        y={y}
        width={w}
        height={h}
        rx={size * 0.15}
        fill="#1a120c"
        fillOpacity={0.9}
        stroke="#a9874f"
        strokeWidth={size * 0.08}
      />
      <text
        x={left + w / 2}
        y={y + h * 0.7}
        textAnchor="middle"
        fontSize={size}
        fontWeight={600}
        fill="#f6e3b4"
      >
        {text}
      </text>
    </g>
  );
}

function PaceFlag({
  at,
  color,
  size,
}: {
  at: { x: number; z: number };
  color: string;
  size: number;
}) {
  // The pole stands at the pace cell's slot; the flag waves up and to the right of it.
  const h = size * 0.95;
  return (
    <g aria-hidden="true">
      <line
        x1={at.x}
        y1={at.z}
        x2={at.x}
        y2={at.z - h}
        stroke="#e5e7eb"
        strokeWidth={size * 0.05}
      />
      <path
        d={`M${at.x} ${at.z - h}L${at.x + size * 0.42} ${at.z - h + size * 0.14}L${at.x} ${at.z - h + size * 0.28}Z`}
        fill={color}
        stroke="#0b0704"
        strokeWidth={size * 0.03}
      />
    </g>
  );
}

function Tokens({
  layout,
  teams,
  positions,
  plan,
  t,
}: {
  layout: Layout;
  teams: Team[];
  positions: TeamPosition[];
  plan: Plan;
  t: number;
}) {
  const c = layout.cellSize;
  const last = layout.spots.length - 1;
  const rest = new Map(positions.map((p) => [p.teamId, p.position]));
  const poses = teams.map((team) => {
    const at = rest.get(team.id) ?? 0;
    const move = plan.moves.find((m) => m.teamId === team.id);
    const moving = !!move && t > move.start && t < move.end;
    return { team, moving, ...tokenCell(plan, team.id, t, at) };
  });
  // Standing teams share a cell in slots, as in the scene (FR-MOVE-2); a walking one keeps the middle.
  const standing = poses
    .filter((p) => !p.moving)
    .map((p) => ({ teamId: p.team.id, position: p.cell }));
  const slots = figureSpots(layout, standing);
  const stack = cellStack(layout, standing);
  const popups = new Map(popupsAt(plan, t).map((p) => [p.teamId, p]));
  const shield = c * 0.8; // the shield's height
  return (
    <g>
      {poses.map(({ team, cell, hopMs, moving }) => {
        const spot = layout.spots[Math.min(Math.max(cell, 0), last)] ?? layout.spots[0];
        const at = (!moving && slots.get(team.id)) || spot || { x: 0, z: 0 };
        const lift = (stack.get(team.id) ?? 0) * c * 0.72;
        const popup = popups.get(team.id);
        return (
          <g
            key={team.id}
            data-team={team.id}
            data-cell={cell}
            style={{
              transform: `translate(${at.x}px, ${at.z}px)`,
              transition: `transform ${hopMs}ms linear`,
            }}
          >
            <path
              d={SHIELD}
              transform={`translate(${-shield * 0.43} ${-shield * 0.6}) scale(${shield / 35})`}
              fill={team.color}
              stroke="#0b0704"
              strokeWidth={3}
            />
            <path
              d={SHIELD}
              transform={`translate(${-shield * 0.43} ${-shield * 0.6}) scale(${shield / 35})`}
              fill="none"
              stroke="#c9a462"
              strokeWidth={1.4}
            />
            <Plaque
              x={0}
              y={-shield * 0.75 - c * 0.62 - lift}
              text={shortName(team.leaderName)}
              size={c * 0.46}
              anchor="middle"
            />
            {popup && (
              <g opacity={popupOpacity(popup.start, popup.end, t)}>
                <rect
                  x={-c * 1.1}
                  y={-shield * 0.75 - c * 1.45 - lift}
                  width={c * 2.2}
                  height={c * 0.7}
                  rx={c * 0.1}
                  fill="#efe2bf"
                  stroke="#6d5230"
                  strokeWidth={c * 0.05}
                />
                <text
                  x={0}
                  y={-shield * 0.75 - c * 0.96 - lift}
                  textAnchor="middle"
                  fontSize={c * 0.45}
                  fontWeight={700}
                  fill={popup.text.startsWith('+') ? '#2d5a17' : '#8a2414'}
                >
                  {popup.text}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** «+N шагов» fades out over the last fifth of its time, as in the scene. */
function popupOpacity(start: number, end: number, t: number): number {
  const age = (t - start) / (end - start);
  return age > 0.8 ? Math.max(0, (1 - age) / 0.2) : 1;
}
