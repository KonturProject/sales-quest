/**
 * How much the scene may draw (PERF-3…7): nothing in a hidden tab; a still frame when the window
 * has been out of focus for `blurFreezeMs` (not on a TV screen, which is never in focus); fewer
 * frames after two minutes without input (not on a TV either); otherwise up to 30 FPS.
 */
export type RenderMode = 'stopped' | 'frozen' | 'slow' | 'active';

export const IDLE_SLOW_MS = 120_000;

export type RenderSignals = {
  hidden: boolean;
  /** How long the window has been out of focus; null when it is in focus. */
  blurredMs: number | null;
  blurFreezeMs: number;
  idleMs: number;
  tv: boolean;
};

export function renderMode(s: RenderSignals): RenderMode {
  if (s.hidden) return 'stopped';
  if (!s.tv && s.blurredMs !== null && s.blurredMs >= s.blurFreezeMs) return 'frozen';
  if (!s.tv && s.idleMs >= IDLE_SLOW_MS) return 'slow';
  return 'active';
}

/** Frames a second the ticker may ask for in a mode (PERF-1, PERF-7). */
export function fpsFor(mode: RenderMode): number {
  return mode === 'slow' ? 15 : 30;
}

/** The ticker stops in these modes: animations wait until the scene may draw again. */
export function paused(mode: RenderMode): boolean {
  return mode === 'stopped' || mode === 'frozen';
}
