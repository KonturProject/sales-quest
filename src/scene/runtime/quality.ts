/**
 * Quality (PERF-QUALITY, PERF-8). Plan 3a has the Low tier only — no shadows, no antialias — and
 * lowers the pixel ratio in steps when the frame rate during moves stays below 80 % of the
 * ticker's target for two measuring windows in a row (5 s, PERF-8). The step is remembered in this
 * browser for a week, then measured again.
 */

export const DPR_STEPS = [1, 0.85, 0.75, 0.6] as const;
/** Below this share of the target frame rate a window counts as slow (30 FPS → 24). */
export const SLOW_SHARE = 0.8;
export const MEASURE_MS = 2500;
/** Slow windows in a row before a step down. */
export const SLOW_WINDOWS = 2;
export const REMEMBER_MS = 7 * 24 * 3600 * 1000;

const STORAGE_KEY = 'sq.quality';

/** The next lower pixel ratio, or the same at the bottom. */
export function lowerDpr(current: number): number {
  return DPR_STEPS.find((step) => step < current - 1e-6) ?? current;
}

/** The pixel ratio to start with: the remembered step, never above the screen's or 1 (Low). */
export function initialDpr(deviceDpr: number, stored: number | null): number {
  const ceiling = Math.min(deviceDpr || 1, 1);
  return Math.min(stored ?? ceiling, ceiling);
}

export function readStoredDpr(now = Date.now()): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as { dpr?: unknown; at?: unknown }) : null;
    if (!value || typeof value.dpr !== 'number' || value.dpr <= 0 || value.dpr > 1) return null;
    if (typeof value.at !== 'number' || now - value.at > REMEMBER_MS) return null;
    return value.dpr;
  } catch {
    return null;
  }
}

export function storeDpr(dpr: number, now = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ dpr, at: now }));
  } catch {
    // Without storage the step is found again next time.
  }
}

/**
 * Decides on the pixel ratio from the frames drawn while moves play at the full rate: `frame`
 * returns a lower ratio when two windows in a row were slow, else null. Frames drawn while not
 * measuring (a slower mode, a pause) only reset the count.
 */
export function createDprGovernor(windowMs = MEASURE_MS) {
  let frames = 0;
  let elapsed = 0;
  let slowWindows = 0;
  const reset = () => {
    frames = 0;
    elapsed = 0;
    slowWindows = 0;
  };
  return {
    frame(
      dtMs: number,
      opts: { measuring: boolean; targetFps: number; dpr: number },
    ): number | null {
      if (!opts.measuring) {
        reset();
        return null;
      }
      if (dtMs <= 0) return null;
      frames += 1;
      elapsed += dtMs;
      if (elapsed < windowMs) return null;
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      elapsed = 0;
      slowWindows = fps < opts.targetFps * SLOW_SHARE ? slowWindows + 1 : 0;
      if (slowWindows < SLOW_WINDOWS) return null;
      slowWindows = 0;
      const next = lowerDpr(opts.dpr);
      return next !== opts.dpr ? next : null;
    },
    reset,
  };
}
