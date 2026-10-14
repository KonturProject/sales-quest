import { useEffect, useState } from 'react';
import {
  Glints,
  RARITY_TEXT,
  badgeKey,
  badgeLine,
  holdersText,
  isFresh,
  type Badge,
  type Fresh,
  type HonorRow,
} from './badges.ts';

/**
 * Achievements always on view (D-58): the gems by a name, the team's line, the board «Доска почёта».
 * Plain DOM; a fresh gem glints once (CSS) the first time it is on view after its banner.
 */

const glints = new Glints();

function Gem({ badge, subject, fresh }: { badge: Badge; subject: string; fresh: Fresh }) {
  const id = badgeKey(subject, badge.ids[0] ?? '');
  const key = `${fresh.batch ?? ''}:${id}`;
  const [glint] = useState(() => isFresh(badge, subject, fresh.glint) && !glints.has(key));
  useEffect(() => {
    if (glint) glints.mark(key);
  }, [glint, key]);
  return (
    <span
      className={`sq-badge sq-rarity-${badge.rarity}${glint ? ' sq-badge-new' : ''}`}
      data-badge={id}
      aria-hidden="true"
    />
  );
}

/** Up to three gems after a name, then «+N»; a screen reader hears the titles. */
export function Gems({
  badges,
  subject,
  fresh,
}: {
  badges: Badge[];
  subject: string;
  fresh: Fresh;
}) {
  if (badges.length === 0) return null;
  const { shown, more } = badgeLine(badges);
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {shown.map((b) => (
        <Gem key={b.ids[0]} badge={b} subject={subject} fresh={fresh} />
      ))}
      {more > 0 && <span className="text-xs text-(--sq-ink-soft)">+{more}</span>}
      <span className="sr-only">ачивки: {badges.map((b) => b.title).join(', ')}</span>
    </span>
  );
}

/** The team's achievements under its slide's heading: «Первопроходец ×3». */
export function TeamLine({
  badges,
  subject,
  fresh,
}: {
  badges: Badge[];
  subject: string;
  fresh: Fresh;
}) {
  if (badges.length === 0) return null;
  return (
    <ul
      aria-label="Командные ачивки"
      className="sq-bright mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs"
    >
      {badges.map((b) => (
        <li key={b.ids[0]} className="flex items-center gap-1">
          <Gem badge={b} subject={subject} fresh={fresh} />
          {b.count > 1 ? `${b.title} ×${b.count}` : b.title}
        </li>
      ))}
    </ul>
  );
}

const LEGEND = ['legendary', 'epic', 'rare'] as const;

/** «Доска почёта»: an achievement, who took it; the legend of the gems' colours at the bottom. */
export function HonorView({
  rows,
  page,
  pages,
}: {
  rows: HonorRow[];
  page: number;
  pages: number;
}) {
  return (
    <>
      <h2 className="sq-name mt-2 text-base">Доска почёта{pages > 1 ? ` ${page}/${pages}` : ''}</h2>
      <div className="sq-note">редкие ачивки игры и кто их взял</div>
      <ol className="sq-parchment mt-2">
        {rows.map((r) => (
          <li key={r.achievementId} className="py-px">
            <div className="flex items-center gap-1.5">
              <span className={`sq-badge sq-rarity-${r.rarity}`} aria-hidden="true" />
              <span className="font-bold">{r.title}</span>
              <span className="sr-only">, {RARITY_TEXT[r.rarity]}</span>
            </div>
            <div className="truncate pl-4 text-xs text-(--sq-ink-soft)">{holdersText(r)}</div>
          </li>
        ))}
      </ol>
      <div className="sq-note mt-1 flex flex-wrap gap-x-2.5" aria-hidden="true">
        {LEGEND.map((r) => (
          <span key={r} className="flex items-center gap-1">
            <span className={`sq-badge sq-rarity-${r}`} />
            {RARITY_TEXT[r]}
          </span>
        ))}
      </div>
    </>
  );
}
