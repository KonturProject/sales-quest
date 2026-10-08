/**
 * Quality (PERF-QUALITY, PERF-8). Plan 3a has the Low tier only — no shadows, no antialias — and
 * lowers the pixel ratio in steps when the frame rate during moves falls below 24. The step
 * reached is remembered in this browser.
 */

export const DPR_STEPS = [1, 0.85, 0.75, 0.6] as const;
export const MIN_FPS = 24;
/** Frames are counted over this much animation before a verdict. */
export const MEASURE_MS = 2000;

const STORAGE_KEY = 'sq.quality';

/** The next pixel ratio after a measured frame rate: one step down when too slow. */
export function nextDpr(current: number, fps: number): number {
  if (fps >= MIN_FPS) return current;
  return DPR_STEPS.find((step) => step < current - 1e-6) ?? current;
}

/** The pixel ratio to start with: the remembered step, never above the screen's or 1 (Low). */
export function initialDpr(deviceDpr: number, stored: number | null): number {
  const ceiling = Math.min(deviceDpr || 1, 1);
  return Math.min(stored ?? ceiling, ceiling);
}

export function readStoredDpr(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as { dpr?: unknown }).dpr : null;
    return typeof value === 'number' && value > 0 && value <= 1 ? value : null;
  } catch {
    return null;
  }
}

export function storeDpr(dpr: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ dpr }));
  } catch {
    // Without storage the step is found again next time.
  }
}

/** Counts frames over animation time and gives a frame rate once enough time has passed. */
export function createFpsMeter(windowMs = MEASURE_MS) {
  let frames = 0;
  let elapsed = 0;
  return {
    /** One drawn frame `dtMs` after the previous one; returns the frame rate when a window is full. */
    frame(dtMs: number): number | null {
      if (dtMs <= 0) return null;
      frames += 1;
      elapsed += dtMs;
      if (elapsed < windowMs) return null;
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      elapsed = 0;
      return fps;
    },
    reset() {
      frames = 0;
      elapsed = 0;
    },
  };
}
