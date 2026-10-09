import { useEffect, useMemo, useState } from 'react';
import { getViewer } from '../app/viewer.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { SyncNotice } from '../data/sync.ts';
import type { GameState } from '../engine/gameState.ts';
import { requestCamera } from '../scene/commands.ts';
import { SLIDE_MS, paceText, plural, ratingSlides, shortTime, type Slide } from './rating.ts';

/**
 * The HUD over the scene (GFX-5, D-23, D-38): the top bar, the team cards at the bottom and the
 * rotating rating. Plain DOM, updated with the data and the 15-second slides — never per frame.
 */
export function Hud(props: {
  game: GameState;
  config: SeasonConfig;
  checkedAt: string | null;
  notice: SyncNotice | null;
}) {
  const { game, config } = props;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-sm text-white">
      <TopBar {...props} />
      <div className="flex min-h-0 flex-1 justify-end py-3">
        <Rating game={game} config={config} />
      </div>
      <TeamCards game={game} config={config} />
    </div>
  );
}

function TopBar({
  game,
  config,
  checkedAt,
  notice,
}: {
  game: GameState;
  config: SeasonConfig;
  checkedAt: string | null;
  notice: SyncNotice | null;
}) {
  const viewer = getViewer();
  const button =
    'pointer-events-auto rounded-md bg-slate-700/90 px-3 py-1.5 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';
  return (
    <header className="flex flex-wrap items-center gap-2">
      <div className="rounded-md bg-slate-900/80 px-3 py-1.5">
        <span className="font-semibold">{config.title}</span>
        <span className="ml-2 text-slate-300">данные от {shortTime(game.dataAsOf)}</span>
        {checkedAt && (
          <span className="ml-2 text-slate-400">проверено {checkedAt.slice(11, 16)}</span>
        )}
      </div>
      {notice && (
        <div role="status" className="rounded-md bg-amber-600/90 px-3 py-1.5">
          {notice.kind === 'offline' ? 'нет связи — показываем последние данные' : notice.message}
        </div>
      )}
      <div className="ml-auto flex gap-2">
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

function TeamCards({ game, config }: { game: GameState; config: SeasonConfig }) {
  const teams = useMemo(() => new Map(config.teams.map((t) => [t.id, t])), [config.teams]);
  const locations = useMemo(
    () => new Map(config.locations.map((l) => [l.index, l.title])),
    [config.locations],
  );
  const { track } = game;
  return (
    <ul className="grid grid-cols-3 gap-2 lg:grid-cols-6" aria-label="Команды">
      {game.teams.map((t) => {
        const team = teams.get(t.teamId);
        const where =
          t.position > track.trackLength
            ? 'за финишем'
            : t.position === track.trackLength
              ? 'на финише'
              : (locations.get(t.locationIndex) ?? '');
        return (
          <li
            key={t.teamId}
            className="rounded-md border-l-4 bg-slate-900/80 px-3 py-2"
            style={{ borderLeftColor: team?.color }}
          >
            <div className="truncate font-semibold">{team?.leaderName}</div>
            <div className="text-slate-300">
              клетка {t.position} из {track.trackLength} · {Math.floor(t.progress * 100)}% плана
            </div>
            <div className={t.deltaVsPace >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
              {paceText(t.deltaVsPace)}
            </div>
            <div className="text-slate-400">
              {where} · {t.members} {plural(t.members, 'человек', 'человека', 'человек')}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Rating({ game, config }: { game: GameState; config: SeasonConfig }) {
  const slides = useMemo(() => ratingSlides(game, config), [game, config]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, []);
  const slide = slides[index % slides.length];
  if (!slide) return null;
  return (
    <section
      aria-label="Рейтинг операторов"
      className="w-72 self-start overflow-hidden rounded-md bg-slate-900/80 px-3 py-2"
    >
      <SlideView slide={slide} config={config} />
      <div className="mt-2 text-right text-xs text-slate-400">
        {(index % slides.length) + 1} / {slides.length}
      </div>
    </section>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

function SlideView({ slide, config }: { slide: Slide; config: SeasonConfig }) {
  if (slide.kind === 'top') {
    const color = new Map(config.teams.map((t) => [t.id, t.color]));
    return (
      <>
        <h2 className="mb-1 font-semibold">Топ-10 операторов</h2>
        <ol>
          {slide.rows.map((r) => (
            <li key={r.managerId} className="flex items-center gap-2 py-0.5">
              <span className="w-5 text-right text-slate-400">{r.rank}</span>
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color.get(r.teamId) }}
              />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="font-semibold">{fmt(r.points)}</span>
            </li>
          ))}
        </ol>
      </>
    );
  }
  return (
    <>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: slide.color }}
        />
        Команда: {slide.title}
      </h2>
      <div className="mb-1 text-xs text-slate-400">
        {fmt(slide.teamPoints)} баллов команды — вклад каждого в шаги фигурки
      </div>
      <ol>
        {slide.rows.map((r) => (
          <li key={r.managerId} className="flex items-center gap-2 py-0.5">
            <span className="flex-1 truncate">{r.name}</span>
            <span className="font-semibold">{fmt(r.points)}</span>
            <span className="w-10 text-right text-slate-300">{Math.round(r.share * 100)}%</span>
          </li>
        ))}
      </ol>
      {slide.others > 0 && (
        <div className="mt-1 text-xs text-slate-400">
          ещё {fmt(slide.others)} — выбывшие и перешедшие
        </div>
      )}
    </>
  );
}
