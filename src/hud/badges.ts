import type { AchievementDef } from '../data/schemas/achievements.ts';
import type { Unlock } from '../engine/gameState.ts';

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
