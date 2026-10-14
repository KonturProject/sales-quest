import type { AchievementDef } from '../data/schemas/achievements.ts';
import type { ManagerState, Unlock } from '../engine/gameState.ts';
import { unlockKey } from '../moments/snapshot.ts';
import type { Moments } from '../moments/tracker.ts';
import { shortName } from '../text.ts';

/**
 * Achievements always on view (D-58): rarity gems by an operator's name in the rotating rating, a team's
 * achievements on its slide, the board «Доска почёта». Pure: what to draw, from the unlocks and the set.
 * Common achievements single nobody out — they keep their banner (ACH-5) and give no badge.
 */

export type BadgeRarity = 'rare' | 'epic' | 'legendary';
export type Badge = {
  /** The achievements behind the badge: one for an operator; a team's are folded by title. */
  ids: string[];
  title: string;
  rarity: BadgeRarity;
  /** Times taken: a repeatable one, or a team's achievements of the same title («×3»). */
  count: number;
};

/** Gems by a name; the rest — «+N». */
export const BADGES = 3;

export const RARITY_TEXT: Record<'common' | BadgeRarity, string> = {
  common: 'обычная',
  rare: 'редкая',
  epic: 'эпическая',
  legendary: 'легендарная',
};

const RANK: Record<BadgeRarity, number> = { legendary: 0, epic: 1, rare: 2 };

type Known = { id: string; title: string; rarity: BadgeRarity; order: number };

/** The achievements that single out: enabled, of the scope, not common — with their place in the set. */
function knownOf(defs: AchievementDef[], scope: AchievementDef['scope']): Map<string, Known> {
  const known = new Map<string, Known>();
  defs.forEach((def, order) => {
    const { rarity } = def;
    if (def.enabled && def.scope === scope && rarity !== 'common')
      known.set(def.id, { id: def.id, title: def.title, rarity, order });
  });
  return known;
}

const byRank = (a: Known, b: Known) => RANK[a.rarity] - RANK[b.rarity] || a.order - b.order;

/** Every operator's badges, legendary first, then by the set; one per achievement, `count` — times taken. */
export function managerBadges(unlocks: Unlock[], defs: AchievementDef[]): Map<string, Badge[]> {
  const known = knownOf(defs, 'manager');
  const taken = new Map<string, Map<string, number>>();
  for (const u of unlocks) {
    if (u.managerId === undefined || !known.has(u.achievementId)) continue;
    const mine = taken.get(u.managerId) ?? new Map<string, number>();
    mine.set(u.achievementId, (mine.get(u.achievementId) ?? 0) + 1);
    taken.set(u.managerId, mine);
  }
  const badges = new Map<string, Badge[]>();
  for (const [managerId, mine] of taken) {
    const list = [...mine.keys()].flatMap((id) => {
      const k = known.get(id);
      return k ? [k] : [];
    });
    badges.set(
      managerId,
      list.sort(byRank).map((k) => ({
        ids: [k.id],
        title: k.title,
        rarity: k.rarity,
        count: mine.get(k.id) ?? 0,
      })),
    );
  }
  return badges;
}

/** Every team's badges in the same order; achievements of the same title fold into one («×3»). */
export function teamBadges(unlocks: Unlock[], defs: AchievementDef[]): Map<string, Badge[]> {
  const known = knownOf(defs, 'team');
  const held = unlocks
    .flatMap((u) => {
      const k = known.get(u.achievementId);
      return k && u.teamId !== undefined ? [{ teamId: u.teamId, k }] : [];
    })
    .sort((a, b) => byRank(a.k, b.k));
  const badges = new Map<string, Badge[]>();
  for (const { teamId, k } of held) {
    const list = badges.get(teamId) ?? [];
    const same = list.find((b) => b.title === k.title);
    if (same) {
      same.count += 1;
      if (!same.ids.includes(k.id)) same.ids.push(k.id);
    } else list.push({ ids: [k.id], title: k.title, rarity: k.rarity, count: 1 });
    badges.set(teamId, list);
  }
  return badges;
}

/** What fits by a name: the first `max` gems and how many more («+N»). */
export function badgeLine(badges: Badge[], max = BADGES): { shown: Badge[]; more: number } {
  return { shown: badges.slice(0, max), more: Math.max(0, badges.length - max) };
}

/** A holder on the board: the short name and the times taken. */
export type Holder = { managerId: string; name: string; count: number };
export type HonorRow = {
  achievementId: string;
  title: string;
  rarity: BadgeRarity;
  /** The first holders, in the order they took it. */
  holders: Holder[];
  /** Holders beyond them: «и ещё N». */
  more: number;
};

/** Achievements on one slide of the board (about the height of the top 10). */
export const HONOR_PER_SLIDE = 6;
/** Names in a row of the board. */
export const HONOR_NAMES = 3;

/**
 * «Доска почёта»: the operators' achievements (rare and up) that somebody still in the game holds — legendary
 * first, then by the set; the holders by the day they took it, then by the full name. Fired operators (R-5)
 * are left out; vacationers stay.
 */
export function honorBoard(
  unlocks: Unlock[],
  defs: AchievementDef[],
  managers: Pick<ManagerState, 'managerId' | 'fullName' | 'fired'>[],
): HonorRow[] {
  const known = knownOf(defs, 'manager');
  const people = new Map(managers.filter((x) => !x.fired).map((x) => [x.managerId, x.fullName]));
  const rows = new Map<string, Map<string, { first: string; count: number }>>();
  for (const u of unlocks) {
    if (u.managerId === undefined || !known.has(u.achievementId) || !people.has(u.managerId))
      continue;
    const holders =
      rows.get(u.achievementId) ?? new Map<string, { first: string; count: number }>();
    const was = holders.get(u.managerId);
    holders.set(
      u.managerId,
      was
        ? { first: was.first < u.unlockedAt ? was.first : u.unlockedAt, count: was.count + 1 }
        : { first: u.unlockedAt, count: 1 },
    );
    rows.set(u.achievementId, holders);
  }
  const taken = [...rows.keys()].flatMap((id) => {
    const k = known.get(id);
    return k ? [k] : [];
  });
  return taken.sort(byRank).map((k) => {
    const all = [...(rows.get(k.id) ?? [])]
      .map(([managerId, h]) => ({ managerId, full: people.get(managerId) ?? managerId, ...h }))
      .sort((a, b) => a.first.localeCompare(b.first) || a.full.localeCompare(b.full, 'ru'));
    return {
      achievementId: k.id,
      title: k.title,
      rarity: k.rarity,
      holders: all
        .slice(0, HONOR_NAMES)
        .map((h) => ({ managerId: h.managerId, name: shortName(h.full), count: h.count })),
      more: Math.max(0, all.length - HONOR_NAMES),
    };
  });
}

/** The board's slides: `per` achievements each; none without rows. */
export function honorPages(rows: HonorRow[], per = HONOR_PER_SLIDE): HonorRow[][] {
  const pages: HonorRow[][] = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return pages;
}

/** «Абрамов И., Борисова А. ×2 и ещё 3». */
export function holdersText(row: Pick<HonorRow, 'holders' | 'more'>): string {
  const names = row.holders.map((h) => (h.count > 1 ? `${h.name} ×${h.count}` : h.name)).join(', ');
  return row.more > 0 ? `${names} и ещё ${row.more}` : names;
}

/** One unlock exactly: `unlockKey` and the day — a repeatable one taken again is another unlock. */
export const unlockId = (u: Unlock): string => `${unlockKey(u)}|${u.unlockedAt}`;

/** An operator's or a team's badge of an achievement. */
export const badgeKey = (subject: string, achievementId: string): string =>
  `${subject}|${achievementId}`;

/**
 * The new achievements of the latest batch of moments (D-56): until its show is over they are held back
 * (`held` — `unlockId`s: no gem spoils the banner), then their badges glint (`glint` — `badgeKey`s).
 */
export type Fresh = { held: Set<string>; glint: Set<string>; batch: number | null };

export function freshOf(m: Moments | null, over: boolean): Fresh {
  const unlocks = (m?.events ?? []).flatMap((e) => (e.kind === 'achievement' ? [e.unlock] : []));
  const batch = m?.id ?? null;
  return over
    ? {
        held: new Set(),
        glint: new Set(
          unlocks.map((u) => badgeKey(u.managerId ?? u.teamId ?? '', u.achievementId)),
        ),
        batch,
      }
    : { held: new Set(unlocks.map(unlockId)), glint: new Set(), batch };
}

/** A badge glints when any achievement behind it is fresh for this operator or team. */
export function isFresh(badge: Badge, subject: string, glint: Set<string>): boolean {
  return badge.ids.some((id) => glint.has(badgeKey(subject, id)));
}

/**
 * The gems that have glinted (D-58), kept outside the components as the run clocks are: a remounted HUD
 * does not glint them again. A key names the batch too — a badge taken again later glints again.
 */
export class Glints {
  private done = new Set<string>();
  has(key: string): boolean {
    return this.done.has(key);
  }
  mark(key: string): void {
    this.done.add(key);
  }
}
