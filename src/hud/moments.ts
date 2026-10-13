import type { SeasonConfig } from '../data/schemas/season.ts';
import type { GameState } from '../engine/gameState.ts';
import type { Gain } from '../moments/events.ts';
import type { Moments } from '../moments/tracker.ts';
import { plural, shortTime } from './rating.ts';

export type Rarity = SeasonConfig['achievements'][number]['rarity'];
export type ToastItem =
  | { kind: 'gain'; key: string; name: string; color: string; points: number; details: string }
  | { kind: 'more'; key: 'more'; text: string };
export type BannerItem =
  | {
      kind: 'achievement';
      key: string;
      title: string;
      description: string;
      rarity: Rarity;
      who: string;
      color: string;
    }
  | { kind: 'more'; key: 'more'; text: string };
/** What a batch shows (D-56): the plate, «кто принёс баллы», then the banners of achievements. */
export type Show = { id: number; plate: string; toasts: ToastItem[]; banners: BannerItem[] };

export const TOASTS = 5;
export const BANNERS = 6;
export const TOAST_EVERY_MS = 2500;
export const TOAST_MS = 7500;
export const BANNER_MS = 4000;
/** The points of a toast run up this long. */
export const TOAST_COUNT_MS = 1200;

const GREY = '#888888';
const num = (n: number) => Math.round(n).toLocaleString('ru-RU');

export function showOf(m: Moments, game: GameState, config: SeasonConfig): Show {
  const names = new Map(config.managers.map((x) => [x.id, x.fullName]));
  const teams = new Map(config.teams.map((t) => [t.id, t]));
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const gains = m.events.flatMap((e) =>
    e.kind === 'gain' && Math.round(e.points) >= 1 ? [e] : [],
  );
  const details = (g: Gain) =>
    [
      ...metrics.flatMap((x) => {
        const d = g.metrics[x.id];
        return d !== undefined && Math.round(d) >= 1 ? [`${x.title} +${num(d)}`] : [];
      }),
      ...(Math.round(g.bonus) >= 1 ? [`ачивки +${num(g.bonus)}`] : []),
    ].join(' · ');
  const toasts: ToastItem[] = gains.slice(0, TOASTS).map((g) => ({
    kind: 'gain',
    key: `gain-${g.managerId}`,
    name: names.get(g.managerId) ?? g.managerId,
    color: teams.get(g.teamId)?.color ?? GREY,
    points: Math.round(g.points),
    details: details(g),
  }));
  const rest = gains.slice(TOASTS);
  if (rest.length > 0) {
    const sum = Math.round(rest.reduce((s, g) => s + g.points, 0));
    toasts.push({
      kind: 'more',
      key: 'more',
      text: `и ещё ${rest.length} ${plural(rest.length, 'оператор', 'оператора', 'операторов')} — +${num(sum)} ${plural(sum, 'балл', 'балла', 'баллов')}`,
    });
  }

  const defs = new Map(config.achievements.map((a) => [a.id, a]));
  const teamOf = new Map(game.managers.map((x) => [x.managerId, x.teamId]));
  const unlocks = m.events.flatMap((e) => {
    const def = e.kind === 'achievement' ? defs.get(e.unlock.achievementId) : undefined;
    return e.kind === 'achievement' && def ? [{ u: e.unlock, def }] : [];
  });
  const banners: BannerItem[] = unlocks.slice(0, BANNERS).map(({ u, def }, i) => {
    const teamId = u.managerId !== undefined ? teamOf.get(u.managerId) : u.teamId;
    return {
      kind: 'achievement',
      key: `ach-${i}-${def.id}`,
      title: def.title,
      description: def.description,
      rarity: def.rarity,
      who:
        u.managerId !== undefined
          ? (names.get(u.managerId) ?? u.managerId)
          : `команда ${teams.get(u.teamId ?? '')?.leaderName ?? u.teamId ?? ''}`,
      color: teams.get(teamId ?? '')?.color ?? GREY,
    };
  });
  if (unlocks.length > BANNERS) {
    const n = unlocks.length - BANNERS;
    banners.push({
      kind: 'more',
      key: 'more',
      text: `и ещё ${n} ${plural(n, 'ачивка', 'ачивки', 'ачивок')}`,
    });
  }

  const plate =
    m.kind === 'since'
      ? m.since
        ? `Что нового с ${shortTime(m.since)}`
        : 'Что нового с прошлого визита'
      : `Новые данные от ${shortTime(game.dataAsOf)}`;
  return { id: m.id, plate, toasts, banners };
}

export type Timed<T> = { item: T; start: number; end: number };
export type Timeline = { toasts: Timed<ToastItem>[]; banners: Timed<BannerItem>[]; end: number };

/** When each toast and banner shows: a toast every 2.5 s for 7.5 s, then the banners one by one. */
export function timeline(show: Show): Timeline {
  const toasts = show.toasts.map((item, i) => ({
    item,
    start: i * TOAST_EVERY_MS,
    end: i * TOAST_EVERY_MS + TOAST_MS,
  }));
  const after = show.toasts.length * TOAST_EVERY_MS;
  const banners = show.banners.map((item, j) => ({
    item,
    start: after + j * BANNER_MS,
    end: after + (j + 1) * BANNER_MS,
  }));
  const end = Math.max(0, ...toasts.map((t) => t.end), ...banners.map((b) => b.end));
  return { toasts, banners, end };
}

/** What is on screen `ms` into a show. */
export function at(line: Timeline, ms: number) {
  return {
    toasts: line.toasts.filter((t) => ms >= t.start && ms < t.end),
    banners: line.banners.filter((b) => ms >= b.start && ms < b.end),
  };
}
