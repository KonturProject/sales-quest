import {
  AnimationClip,
  AnimationMixer,
  type AnimationAction,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HERO_FILES } from './assetUrls.ts';
import { CLIPS, HEROES, type HeroVariant } from './heroCatalog.ts';
import {
  HERO_HEIGHT,
  SOURCE_HEIGHT,
  heroMaterial,
  mergeHero,
  type ClipKey,
  type HeroAction,
} from './heroes.ts';

/**
 * Loading and rigging the heroes (D-41): each file once, each variant merged once (shared
 * geometry), a light clone per team with its own colour and mixer.
 */

type Template = { scene: Object3D; clips: AnimationClip[]; map: Texture | null };

const files = new Map<string, Promise<GLTF>>();
const templates = new Map<string, Promise<Template>>();

function loadFile(url: string): Promise<GLTF> {
  let file = files.get(url);
  if (!file) {
    file = new GLTFLoader().loadAsync(url);
    files.set(url, file);
    file.catch(() => files.delete(url));
  }
  return file;
}

export function heroTemplate(variant: HeroVariant): Promise<Template> {
  let template = templates.get(variant.id);
  if (!template) {
    const hero = HEROES[variant.hero];
    template = loadFile(HERO_FILES[variant.hero]).then((gltf) => {
      const scene = cloneSkinned(gltf.scene);
      const merged = mergeHero(scene, new Set([...hero.base, ...variant.pieces]), hero.cape);
      const map = (merged.material as MeshStandardMaterial).map ?? null;
      return { scene, clips: gltf.animations, map };
    });
    templates.set(variant.id, template);
    template.catch(() => templates.delete(variant.id));
  }
  return template;
}

export type HeroRig = {
  root: Object3D;
  mixer: AnimationMixer;
  actions: Record<ClipKey, AnimationAction>;
  material: Material;
  /** The pose last applied, to skip unchanged figures. */
  shown: string;
};

export function makeRig(template: Template, teamColor: string): HeroRig {
  const root = cloneSkinned(template.scene);
  const material = heroMaterial(template.map, teamColor);
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) (o as SkinnedMesh).material = material;
  });
  root.scale.setScalar(HERO_HEIGHT / SOURCE_HEIGHT);
  const mixer = new AnimationMixer(root);
  const actions = Object.fromEntries(
    (Object.keys(CLIPS) as ClipKey[]).map((key) => {
      const clip = AnimationClip.findByName(template.clips, CLIPS[key]);
      if (!clip) throw new Error(`hero file without the clip ${CLIPS[key]}`);
      return [key, mixer.clipAction(clip)];
    }),
  ) as Record<ClipKey, AnimationAction>;
  return { root, mixer, actions, material, shown: '' };
}

/** Puts the hero into the pose; false when it already stands so (nothing to update). */
export function poseRig(rig: HeroRig, action: HeroAction): boolean {
  const key = `${action.clip}:${action.phase.toFixed(4)}`;
  if (rig.shown === key) return false;
  const current = rig.actions[action.clip];
  for (const other of Object.values(rig.actions)) if (other !== current) other.stop();
  current.play();
  current.time = action.phase * current.getClip().duration;
  rig.mixer.update(0);
  rig.shown = key;
  return true;
}

export function disposeRig(rig: HeroRig): void {
  rig.mixer.stopAllAction();
  rig.mixer.uncacheRoot(rig.root);
  rig.material.dispose();
}
