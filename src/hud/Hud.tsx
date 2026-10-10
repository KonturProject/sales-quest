import { useEffect, useMemo, useState } from 'react';
import { getViewer } from '../app/viewer.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { SyncNotice } from '../data/sync.ts';
import type { GameState } from '../engine/gameState.ts';
import { requestCamera } from '../scene/commands.ts';
import { Crest } from './Crest.tsx';
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
export function Hud(props: {
  game: GameState;
  config: SeasonConfig;
  checkedAt: string | null;
  notice: SyncNotice | null;
}) {
  const { game, config } = props;
  return (
    <div className="sq-ui pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-sm">
      <TopBar {...props} />
      <div className="flex min-h-0 flex-1 justify-end py-2">
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
    <ul className="grid grid-cols-3 gap-1.5 lg:grid-cols-6" aria-label="Команды">
      {game.teams.map((t) => {
        const team = teams.get(t.teamId);
        const color = team?.color ?? '#888888';
        const where =
          t.position > track.trackLength
            ? 'за финишем'
            : t.position === track.trackLength
              ? 'на финише'
              : (locations.get(t.locationIndex) ?? '');
        const percent = Math.floor(t.progress * 100);
        return (
          <li
            key={t.teamId}
            className="sq-panel sq-panel-tight grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-2 px-2 pt-1 pb-1.5"
          >
            <Crest color={color} className="row-span-2" />
            <div className="sq-name truncate text-[15px]">{team?.leaderName}</div>
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
            <div className={`col-span-2 mt-1 text-[12.5px] sq-pace-${paceTone(t.deltaVsPace)}`}>
              {paceText(t.deltaVsPace)}
            </div>
            <div className="sq-dim col-span-2 text-xs">
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
            key={s.kind === 'team' ? s.teamId : 'top'}
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
