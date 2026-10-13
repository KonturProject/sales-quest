import { useMemo, useState } from 'react';
import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import type { Moments } from '../moments/tracker.ts';
import { countAt } from './cards.ts';
import { reducedMotion, useVisibleClock } from './clock.ts';
import {
  TOAST_COUNT_MS,
  at,
  showOf,
  timeline,
  type BannerItem,
  type Rarity,
  type Show,
  type ToastItem,
} from './moments.ts';
import { plural } from './rating.ts';

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'обычная',
  rare: 'редкая',
  epic: 'эпическая',
  legendary: 'легендарная',
};

/**
 * The moments of a portion of data (D-56): the plate «Новые данные от …» / «Что нового с …», «кто принёс
 * баллы», then the achievement banners (ACH-5: one at a time, 4 s) — one batch after another, played only
 * while the tab is visible. Plain DOM; CSS animations once (PERF-1).
 */
export function MomentsLayer({
  moments,
  game,
  config,
}: {
  moments: Moments | null;
  game: GameState;
  config: SeasonConfig;
}) {
  const [queue, setQueue] = useState<Show[]>([]);
  const [taken, setTaken] = useState<number | null>(null);
  // A new batch joins the queue once (set while rendering, as `MapPage` adopts `?view=`).
  if (moments !== null && moments.id !== taken) {
    setTaken(moments.id);
    const show = showOf(moments, game, config);
    if (show.toasts.length + show.banners.length > 0) setQueue((q) => [...q, show]);
  }
  const head = queue[0] ?? null;
  const line = useMemo(() => (head ? timeline(head) : null), [head]);
  const ms = useVisibleClock(head?.id ?? null, line?.end ?? 0);
  if (head !== null && line !== null && ms !== null && ms >= line.end)
    setQueue((q) => (q[0] === head ? q.slice(1) : q));
  if (head === null || line === null || ms === null || ms >= line.end) return null;
  const now = at(line, ms);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-2">
        <div role="status" className="sq-plate sq-moment-in sq-bright px-4 py-1">
          {head.plate}
        </div>
        {now.banners.map(({ item }) => (
          <Banner key={item.key} item={item} />
        ))}
      </div>
      <ol
        aria-label="Кто принёс баллы"
        className="pointer-events-none absolute top-16 left-3 flex w-72 flex-col gap-1.5"
      >
        {now.toasts.map(({ item, start }) => (
          <li key={item.key} className="sq-plate sq-moment-in px-3 py-1.5">
            <Toast item={item} ms={ms - start} />
          </li>
        ))}
      </ol>
    </>
  );
}

function Toast({ item, ms }: { item: ToastItem; ms: number }) {
  if (item.kind === 'more') return <div className="sq-muted text-sm">{item.text}</div>;
  const n = Math.round(reducedMotion() ? item.points : countAt(0, item.points, ms, TOAST_COUNT_MS));
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="sq-gem sq-gem-small"
          style={{ background: item.color }}
          aria-hidden="true"
        />
        <span className="sq-name min-w-0 flex-1 truncate">{item.name}</span>
        <span className="sq-gain text-base">
          +{n} {plural(n, 'балл', 'балла', 'баллов')}
        </span>
      </div>
      {item.details && <div className="sq-muted text-xs">{item.details}</div>}
    </>
  );
}

function Banner({ item }: { item: BannerItem }) {
  if (item.kind === 'more')
    return <div className="sq-plate sq-moment-in px-4 py-1 text-sm">{item.text}</div>;
  return (
    <section
      aria-label="Ачивка"
      className={`sq-plate sq-banner sq-rarity-${item.rarity} sq-moment-in flex items-center gap-3 px-4 py-2`}
    >
      <span className="sq-emblem" aria-hidden="true" />
      <div className="min-w-0">
        <div className="sq-caps sq-muted">Ачивка · {RARITY_TEXT[item.rarity]}</div>
        <div className="sq-name sq-bright text-[17px]">{item.title}</div>
        <div className="flex items-center gap-1.5 text-sm">
          <span
            className="sq-gem sq-gem-small"
            style={{ background: item.color }}
            aria-hidden="true"
          />
          {item.who}
        </div>
        {item.description && <div className="sq-muted text-xs">{item.description}</div>}
      </div>
    </section>
  );
}
