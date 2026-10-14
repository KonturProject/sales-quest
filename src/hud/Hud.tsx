import { useEffect, useMemo, useState } from 'react';
import { getViewer } from '../app/viewer.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { View } from '../app/view.ts';
import type { SyncNotice } from '../data/sync.ts';
import type { GameState, TeamState } from '../engine/gameState.ts';
import type { Track } from '../engine/track.ts';
import type { Hero } from '../moments/heroes.ts';
import type { Moments } from '../moments/tracker.ts';
import { requestCamera } from '../scene/commands.ts';
import { BADGE_MS, cardPhase, cardPoints, nextStep, stepLeftText } from './cards.ts';
import { reducedMotion, useRunClock } from './clock.ts';
import { Crest } from './Crest.tsx';
import { MiniMap } from './MiniMap.tsx';
import { MomentsLayer } from './Moments.tsx';
import {
  SLIDE_MS,
  barShare,
  paceText,
  paceTone,
  plural,
  pointsText,
  ratingSlides,
  shortTime,
  type Slide,
} from './rating.ts';

/**
 * The HUD over the scene (GFX-5, D-23, D-38) in the style of a fantasy RPG (D-46): the top bar, the
 * team cards at the bottom and the rotating rating. Plain DOM, updated with the data and the
 * 15-second slides — never per frame.
 */
export function Hud(props: HudProps) {
  const { game, config } = props;
  return (
    <div className="sq-ui pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-sm">
      <TopBar {...props} />
      <div className="flex min-h-0 flex-1 justify-end py-2">
        <Rating
          game={game}
          config={config}
          heroes={props.heroes}
          jump={props.moments?.id ?? null}
        />
      </div>
      <TeamCards game={game} config={config} moments={props.moments} />
      <MomentsLayer moments={props.moments} game={game} config={config} />
    </div>
  );
}

type HudProps = {
  game: GameState;
  config: SeasonConfig;
  checkedAt: string | null;
  notice: SyncNotice | null;
  /** The scene or the 2D scheme under the HUD (GFX-6). */
  view: View;
  /** A wall screen (PERF-5): nothing to press, so no buttons. */
  tv: boolean;
  /** The scene stepped down to the bottom of the quality ladder: offer the scheme (D-45). */
  offerScheme: boolean;
  /** WebGL 2 works: the scheme may give way to the scene again. */
  canUse3d: boolean;
  onView: (view: View) => void;
  /** The latest batch of moments (D-56). */
  moments: Moments | null;
  /** «Герои дня» (D-56). */
  heroes: Hero[];
};

function TopBar({
  game,
  config,
  checkedAt,
  notice,
  view,
  tv,
  offerScheme,
  canUse3d,
  onView,
}: HudProps) {
  const viewer = getViewer();
  const button = 'sq-button pointer-events-auto';
  return (
    <header className="flex flex-wrap items-center gap-2">
      <div className="sq-plate flex items-center gap-2.5 px-3 py-1">
        <span className="sq-caps sq-bright">{config.title}</span>
        <span className="sq-gem" aria-hidden="true" />
        <span className="sq-muted">данные от {shortTime(game.dataAsOf)}</span>
        {checkedAt && <span className="sq-dim">проверено {checkedAt.slice(11, 16)}</span>}
      </div>
      {notice && (
        <div role="status" className="sq-plate sq-plate-alarm px-3 py-1">
          {notice.kind === 'offline' ? 'нет связи — показываем последние данные' : notice.message}
        </div>
      )}
      <MiniMap game={game} config={config} />
      {offerScheme && !tv && (
        <div
          role="status"
          className="sq-plate sq-plate-alarm flex items-center gap-3 py-1 pr-1 pl-3"
        >
          Карта идёт рывками на этом компьютере
          <button className={button} onClick={() => onView('2d')}>
            Включить простую схему
          </button>
        </div>
      )}
      <div className={tv ? 'hidden' : 'flex gap-2'}>
        {view === '2d' && canUse3d && (
          <button className={button} onClick={() => onView('3d')}>
            Объёмная карта
          </button>
        )}
        <button className={button} onClick={() => requestCamera('overview')}>
          Весь трек
        </button>
        <button className={button} onClick={() => requestCamera('leader')}>
          К лидеру
        </button>
        <button className={button} onClick={() => viewer.refresh()}>
          Обновить
        </button>
      </div>
    </header>
  );
}

function TeamCards({
  game,
  config,
  moments,
}: {
  game: GameState;
  config: SeasonConfig;
  moments: Moments | null;
}) {
  const teams = useMemo(() => new Map(config.teams.map((t) => [t.id, t])), [config.teams]);
  const locations = useMemo(
    () => new Map(config.locations.map((l) => [l.index, l.title])),
    [config.locations],
  );
  // A team's points «было → стало» of the latest batch: its card counts them up (D-56).
  const gains = useMemo(
    () =>
      new Map(
        (moments?.events ?? []).flatMap((e) =>
          e.kind === 'team_points' ? [[e.teamId, { from: e.from, to: e.to }] as const] : [],
        ),
      ),
    [moments],
  );
  const { track } = game;
  return (
    <ul className="grid grid-cols-3 gap-1.5 lg:grid-cols-6" aria-label="Команды">
      {game.teams.map((t) => {
        const team = teams.get(t.teamId);
        const where =
          t.position > track.trackLength
            ? 'за финишем'
            : t.position === track.trackLength
              ? 'на финише'
              : (locations.get(t.locationIndex) ?? '');
        return (
          <TeamCard
            key={t.teamId}
            team={t}
            name={team?.leaderName ?? ''}
            color={team?.color ?? '#888888'}
            where={where}
            track={track}
            config={config}
            gain={gains.get(t.teamId) ?? null}
            run={moments?.id ?? null}
          />
        );
      })}
    </ul>
  );
}

function TeamCard({
  team: t,
  name,
  color,
  where,
  track,
  config,
  gain,
  run,
}: {
  team: TeamState;
  name: string;
  color: string;
  where: string;
  track: Track;
  config: SeasonConfig;
  gain: { from: number; to: number } | null;
  run: number | null;
}) {
  // A gain of another state (another season, weights, a look at another day) is not this card's.
  const own = gain !== null && Math.abs(gain.to - t.points) <= 1e-6 ? gain : null;
  // The points of a portion run from «было» to «стало» on the batch's one clock for all cards; a hidden
  // tab waits (PERF-3); a remounted card does not count again (review D-56).
  const ms = useRunClock(own && run !== null ? `cards:${run}` : null, BADGE_MS, cardPhase);
  const still = reducedMotion();
  const points = cardPoints(own, t.points, ms, still);
  const up = own ? Math.round(own.to - own.from) : 0;
  const fresh = up > 0 && ms !== null && ms < BADGE_MS;
  // «До шага» moves with the count: «было» until the portion's story begins after the walk (D-48).
  const step = nextStep(
    { ...t, points: own && ms === null && !still ? own.from : t.points },
    config,
    track,
  );
  const percent = Math.floor(t.progress * 100);
  return (
    <li className="sq-panel sq-panel-tight relative grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-2 px-2 pt-1 pb-1.5">
      {fresh && !still && (
        <span key={run} className="sq-flash" style={{ color }} aria-hidden="true" />
      )}
      <Crest color={color} className="row-span-2" />
      {/* The «+N» of a portion beside the name: the line of points stays whole on a narrow card. */}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="sq-name min-w-0 flex-1 truncate text-[15px]">{name}</span>
        {fresh && <span className="sq-gain text-[13px]">+{up}</span>}
      </div>
      <div className="sq-bar mt-1 mb-0.5">
        <div
          className="sq-bar-fill"
          style={{ width: `${barShare(t.progress) * 100}%`, backgroundColor: color }}
        />
        <span className="sq-bar-text">
          клетка {t.position} из {track.trackLength} · {percent}%
          <span className="sr-only"> плана</span>
        </span>
      </div>
      <div className="col-span-2 mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[12.5px]">
        <span className="sq-bright whitespace-nowrap">{pointsText(points)}</span>
        {step && (
          <span className="sq-muted whitespace-nowrap">
            · до шага ещё {stepLeftText(step.left)}
          </span>
        )}
      </div>
      {step && (
        <div className="sq-bar-step col-span-2" aria-hidden="true">
          <div style={{ transform: `scaleX(${step.share})`, backgroundColor: color }} />
        </div>
      )}
      <div className={`col-span-2 mt-0.5 text-[12.5px] sq-pace-${paceTone(t.deltaVsPace)}`}>
        {paceText(t.deltaVsPace)}
      </div>
      <div className="sq-dim col-span-2 text-xs">
        {where} · {t.members} {plural(t.members, 'человек', 'человека', 'человек')}
      </div>
    </li>
  );
}

function Rating({
  game,
  config,
  heroes,
  jump,
}: {
  game: GameState;
  config: SeasonConfig;
  heroes: Hero[];
  /** A new batch of moments: show «Герои дня» at once, for a whole slide (D-56). */
  jump: number | null;
}) {
  const slides = useMemo(() => ratingSlides(game, config, heroes), [game, config, heroes]);
  const [index, setIndex] = useState(0);
  const [jumped, setJumped] = useState<number | null>(null);
  if (jump !== null && jump !== jumped) {
    setJumped(jump);
    const heroesAt = slides.findIndex((s) => s.kind === 'heroes');
    if (heroesAt >= 0) setIndex(heroesAt);
  }
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [jumped]);
  const at = index % slides.length;
  const slide = slides[at];
  if (!slide) return null;
  return (
    <section
      aria-label="Рейтинг операторов"
      className="sq-panel w-75 self-start overflow-hidden px-3 py-2"
    >
      <div className="sq-title sq-caps">
        <span className="sq-gem" aria-hidden="true" />
        Рейтинг
        <span className="sq-gem" aria-hidden="true" />
      </div>
      <SlideView slide={slide} config={config} />
      <div className="mt-2 flex justify-center gap-1.5">
        {slides.map((s, i) => (
          <span
            key={s.kind === 'team' ? s.teamId : s.kind === 'honor' ? `honor-${s.page}` : s.kind}
            className={`sq-gem sq-gem-small ${i === at ? '' : 'opacity-35'}`}
            aria-hidden="true"
          />
        ))}
        <span className="sr-only">
          {at + 1} из {slides.length}
        </span>
      </div>
    </section>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

function SlideView({ slide, config }: { slide: Slide; config: SeasonConfig }) {
  if (slide.kind === 'honor') return null; // the board's view: Task 5
  if (slide.kind === 'heroes') {
    const color = new Map(config.teams.map((t) => [t.id, t.color]));
    return (
      <>
        <h2 className="sq-name mt-2 text-base">Герои дня</h2>
        <div className="sq-note">кто принёс больше всех баллов сегодня</div>
        <ol className="sq-parchment mt-2">
          {slide.rows.map((r) => (
            <li key={r.managerId} className="flex items-center gap-2 py-px">
              <span
                className="sq-gem sq-gem-small"
                style={{ background: color.get(r.teamId) }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="font-bold">+{fmt(r.points)}</span>
            </li>
          ))}
        </ol>
      </>
    );
  }
  if (slide.kind === 'top') {
    const color = new Map(config.teams.map((t) => [t.id, t.color]));
    return (
      <>
        <h2 className="sq-name mt-2 text-base">Топ-10 операторов</h2>
        <ol className="sq-parchment mt-2">
          {slide.rows.map((r) => (
            <li key={r.managerId} className="flex items-center gap-2 py-px">
              <span className="w-5 text-right text-(--sq-ink-soft)">{r.rank}</span>
              <span
                className="sq-gem sq-gem-small"
                style={{ background: color.get(r.teamId) }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{r.name}</span>
              {r.away && <span className="text-xs italic text-(--sq-ink-soft)">в отпуске</span>}
              <span className="font-bold">{fmt(r.points)}</span>
            </li>
          ))}
        </ol>
      </>
    );
  }
  return (
    <>
      <div className="mt-2 flex items-center gap-2.5">
        <Crest color={slide.color} size={28} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="sq-name truncate text-[17px]">
            <span className="sr-only">Команда: </span>
            {slide.title}
          </h2>
          <div className="sq-note">
            {pointsText(slide.teamPoints)} команды — вклад каждого в шаги фигурки
          </div>
        </div>
      </div>
      <ol className="sq-parchment mt-2">
        {slide.rows.map((r) => (
          <li key={r.managerId} className="flex items-center gap-2 py-px">
            <span className="flex-1 truncate">{r.name}</span>
            {r.away && <span className="text-xs italic text-(--sq-ink-soft)">в отпуске</span>}
            <span className="font-bold">{fmt(r.points)}</span>
            <span className="w-9 text-right text-(--sq-ink-soft)">
              {Math.round(r.share * 100)}%
            </span>
          </li>
        ))}
      </ol>
      {slide.others > 0 && (
        <div className="sq-note mt-1">ещё {fmt(slide.others)} — выбывшие и перешедшие</div>
      )}
    </>
  );
}
