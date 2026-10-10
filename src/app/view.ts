/**
 * The 3D scene or the 2D scheme (GFX-6, D-45): without WebGL 2 the scheme at once; `?view=2d` or
 * `?view=3d` forces one; otherwise the viewer's last choice (the offer at the bottom of the quality
 * ladder, the button back), remembered in this browser; by default 3D.
 */

export type View = '3d' | '2d';

const STORAGE_KEY = 'sq.view';

export function parseView(value: string | undefined): View | null {
  return value === '2d' || value === '3d' ? value : null;
}

export function chooseView(o: { forced: View | null; chosen: View | null; webgl: boolean }): View {
  if (!o.webgl) return '2d';
  return o.forced ?? o.chosen ?? '3d';
}

export function readView(): View | null {
  try {
    return parseView(globalThis.localStorage?.getItem(STORAGE_KEY) ?? undefined);
  } catch {
    return null;
  }
}

export function storeView(view: View): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, view);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
}

/** The TV mode of an office wall screen (PERF-5): `?mode=tv` in the link. */
export function isTv(query: Record<string, string>): boolean {
  return query.mode?.toLowerCase() === 'tv';
}

/** The scene needs WebGL 2 (three.js); a throwaway context tells, then is let go. */
export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
