import { useMemo, useSyncExternalStore } from 'react';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import { requestCamera } from '../scene/commands.ts';
import { themeOf } from '../scene/themes.ts';
import { currentSpan, subscribeSpan } from '../scene/viewWindow.ts';
import { Crest } from './Crest.tsx';
import { minimapModel, spanFraction } from './minimap.ts';

const pct = (share: number) => `${(share * 100).toFixed(2)}%`;

/**
 * The mini-map (GFX-5): the whole track in a plate of the top bar — the locations in their colours,
 * the cells beyond the plan, the finish, the teams' shields and pace ticks, the camera's window in
 * a bronze frame. A shield flies the camera to its team, as «К лидеру» does (D-42: the rest view
 * waits after it).
 */
export function MiniMap({ game, config }: { game: GameState; config: SeasonConfig }) {
  const model = useMemo(
    () =>
      minimapModel({
        track: game.track,
        teams: config.teams,
        states: game.teams,
        colorOf: (id) => themeOf(id).color,
      }),
    [game.track, game.teams, config.teams],
  );
  const span = spanFraction(
    useSyncExternalStore(subscribeSpan, currentSpan),
    game.track.maxPosition,
  );
  return (
    <nav
      aria-label="Мини-карта трека"
      className="sq-plate mx-auto h-10 max-w-[520px] min-w-[240px] flex-1 px-3"
    >
      <div className="relative h-full">
        <div className="absolute inset-x-0 top-[55%] flex h-2 -translate-y-1/2 border border-(--sq-edge) shadow-[0_0_0_1px_var(--sq-bronze-dark)]">
          {model.bands.map((b) => (
            <div
              key={b.index}
              title={b.title}
              className="h-full border-r border-(--sq-edge) last:border-r-0"
              style={{
                width: pct(b.to - b.from),
                background:
                  b.color ?? 'repeating-linear-gradient(90deg, #d6bf8e 0 3px, #8a6a3a 3px 6px)',
              }}
            />
          ))}
        </div>
        <span
          className="sq-gem absolute top-[55%]"
          style={{ left: pct(model.finish), transform: 'translate(-50%, -50%) rotate(45deg)' }}
          title="Финиш"
          aria-hidden="true"
        />
        {span && (
          <div
            data-testid="minimap-window"
            className="absolute top-0.5 bottom-0.5 border border-(--sq-gold-hi) bg-[rgb(246_227_180/0.12)]"
            style={{ left: pct(span.from), width: pct(Math.max(span.to - span.from, 0.01)) }}
            aria-hidden="true"
          />
        )}
        {model.paces.map((p) => (
          <span
            key={p.teamId}
            className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2"
            style={{ left: pct(p.at), background: p.color }}
            aria-hidden="true"
          />
        ))}
        {model.markers.map((m) => (
          <button
            key={m.teamId}
            className="pointer-events-auto absolute top-0 -translate-x-1/2 cursor-pointer focus-visible:outline-2 focus-visible:outline-(--sq-gold-hi)"
            style={{ left: `calc(${pct(m.at)} + ${m.stack * 6}px)` }}
            title={`${m.name}: клетка ${m.position}`}
            aria-label={`К команде ${m.name}`}
            onClick={() => requestCamera({ team: m.teamId })}
          >
            <Crest color={m.color} size={13} />
          </button>
        ))}
      </div>
    </nav>
  );
}
