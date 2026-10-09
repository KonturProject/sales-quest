/**
 * The heroes of the board (D-41, GFX-CHAR-1): KayKit Character Pack: Adventurers 1.0 (Kay Lousberg,
 * CC0). One file per hero, ten variants by the weapons in hand. Shared by the asset pipeline
 * (`scripts/assets.ts` keeps exactly these pieces and clips) and the scene. Pure data.
 */

export type HeroId = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'rogue-hooded';

export type Hero = {
  id: HeroId;
  /** The pack's file name without `.glb`. */
  source: string;
  /** Always shown: the skinned body parts, the hat or helmet, the cape. */
  base: string[];
  /** Takes the team colour (GFX-CHAR-3). */
  cape: string;
};

export type HeroVariant = {
  /** The season config's `team.characterId`. */
  id: string;
  hero: HeroId;
  /** Weapons and shields in hand, by node name in the pack. */
  pieces: string[];
};

const body = (prefix: string, head = `${prefix}_Head`) => [
  `${prefix}_ArmLeft`,
  `${prefix}_ArmRight`,
  `${prefix}_Body`,
  head,
  `${prefix}_LegLeft`,
  `${prefix}_LegRight`,
];

export const HEROES: Record<HeroId, Hero> = {
  knight: {
    id: 'knight',
    source: 'Knight',
    base: [...body('Knight'), 'Knight_Helmet', 'Knight_Cape'],
    cape: 'Knight_Cape',
  },
  barbarian: {
    id: 'barbarian',
    source: 'Barbarian',
    base: [...body('Barbarian'), 'Barbarian_Hat', 'Barbarian_Cape'],
    cape: 'Barbarian_Cape',
  },
  mage: {
    id: 'mage',
    source: 'Mage',
    base: [...body('Mage'), 'Mage_Hat', 'Mage_Cape'],
    cape: 'Mage_Cape',
  },
  rogue: {
    id: 'rogue',
    source: 'Rogue',
    base: [...body('Rogue'), 'Rogue_Cape'],
    cape: 'Rogue_Cape',
  },
  'rogue-hooded': {
    id: 'rogue-hooded',
    source: 'Rogue_Hooded',
    base: [...body('Rogue', 'Rogue_Head_Hooded'), 'Rogue_Cape'],
    cape: 'Rogue_Cape',
  },
};

/** In catalog order: a team without a known `characterId` takes the variant of its place. */
export const VARIANTS: HeroVariant[] = [
  { id: 'knight', hero: 'knight', pieces: ['1H_Sword', 'Round_Shield'] },
  { id: 'mage', hero: 'mage', pieces: ['2H_Staff'] },
  { id: 'barbarian', hero: 'barbarian', pieces: ['2H_Axe'] },
  { id: 'rogue', hero: 'rogue', pieces: ['2H_Crossbow'] },
  { id: 'rogue-hooded', hero: 'rogue-hooded', pieces: ['Knife', 'Knife_Offhand'] },
  { id: 'knight-2h', hero: 'knight', pieces: ['2H_Sword'] },
  { id: 'mage-book', hero: 'mage', pieces: ['1H_Wand', 'Spellbook'] },
  { id: 'barbarian-shield', hero: 'barbarian', pieces: ['1H_Axe', 'Barbarian_Round_Shield'] },
  { id: 'rogue-knives', hero: 'rogue', pieces: ['Knife', 'Knife_Offhand'] },
  { id: 'rogue-hooded-crossbow', hero: 'rogue-hooded', pieces: ['1H_Crossbow'] },
];

/** Clips kept in the files: standing, a long run, a hop, a cheer (GFX-CHAR-2). */
export const CLIPS = {
  idle: 'Idle',
  run: 'Running_A',
  hop: 'Jump_Full_Short',
  cheer: 'Cheer',
} as const;

/** The variant for a team: by its `characterId`, else by its place (0, 1, …) among the teams. */
export function variantFor(characterId: string, place: number): HeroVariant {
  const known = VARIANTS.find((v) => v.id === characterId);
  if (known) return known;
  const i = ((Math.round(place) % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  return VARIANTS[i] as HeroVariant;
}
