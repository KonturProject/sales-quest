import heaven from '../assets/board/heaven.webp?url';
import ice from '../assets/board/ice.webp?url';
import ruins from '../assets/board/ruins.webp?url';
import volcano from '../assets/board/volcano.webp?url';
import barbarian from '../assets/heroes/barbarian.glb?url';
import knight from '../assets/heroes/knight.glb?url';
import mage from '../assets/heroes/mage.glb?url';
import rogueHooded from '../assets/heroes/rogue-hooded.glb?url';
import rogue from '../assets/heroes/rogue.glb?url';
import decor from '../assets/decor/decor.glb?url';
import props from '../assets/props/props.glb?url';
import type { HeroId } from './heroCatalog.ts';

// The optimized assets of `npm run assets` (D-41): imported as URLs, they get hashed names and
// are fetched only when the scene asks for them (DEP-4, §12.1 «локации грузятся лениво»).

/** The painted panel of a theme; a theme without art gets a plain panel. */
export const BOARD_ART: Record<string, string> = { ruins, ice, volcano, heaven };

/** The things on the table (D-43). */
export const PROPS_FILE: string = props;
/** The locations' 3D models (D-44). */
export const DECOR_FILE: string = decor;

export const HERO_FILES: Record<HeroId, string> = {
  knight,
  barbarian,
  mage,
  rogue,
  'rogue-hooded': rogueHooded,
};
