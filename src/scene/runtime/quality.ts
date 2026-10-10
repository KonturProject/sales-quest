/**
 * Quality (PERF-QUALITY, PERF-8, D-45). The Low tier only — no shadows, no antialias — and a ladder
 * the scene walks down while moves play slowly: when the frame rate during moves stays below 80 %
 * of the ticker's target for two measuring windows in a row (5 s), one level down. The level is
 * remembered in this browser for a week, then measured again.
 */

/** What a level of the ladder keeps. */
export type Quality = {
  /** The pixel ratio; a screen never gets more than its own. */
  dpr: number;
  /** Anisotropic filtering of the painted panels. */
  anisotropy: boolean;
  /** The «life» of the locations (D-41). */
  ambient: boolean;
  /** The things on the table and the models on the panels (D-43, D-44). */
  scenery: boolean;
  /** The bottom of the ladder: the HUD offers the 2D scheme (GFX-6). */
  offerScheme: boolean;
};

const FULL: Quality = {
  dpr: 1,
  anisotropy: true,
  ambient: true,
  scenery: true,
  offerScheme: false,
};
const BARE: Quality = {
  dpr: 0.6,
  anisotropy: false,
  ambient: false,
  scenery: false,
  offerScheme: false,
};

/**
 * The ladder (D-45): DPR 1 → 0.85 → 0.75 → 0.6 (D-40) → no anisotropy → no ambient → no things on
 * the table and no models on the panels → the offer of the 2D scheme.
 */
export const LEVELS: readonly Quality[] = [
  FULL,
  { ...FULL, dpr: 0.85 },
  { ...FULL, dpr: 0.75 },
  { ...FULL, dpr: 0.6 },
  { ...FULL, dpr: 0.6, anisotropy: false },
  { ...BARE, scenery: true },
  BARE,
  { ...BARE, offerScheme: true },
];
export const LAST_LEVEL = LEVELS.length - 1;

/** Below this share of the target frame rate a window counts as slow (30 FPS → 24). */
export const SLOW_SHARE = 0.8;
export const MEASURE_MS = 2500;
/** Slow windows in a row before a step down. */
export const SLOW_WINDOWS = 2;
export const REMEMBER_MS = 7 * 24 * 3600 * 1000;
/** Windows of moves kept for `#/debug` (OQ-24: figures from a real laptop). */
export const LOG_SIZE = 12;

const STORAGE_KEY = 'sq.quality';
const LOG_KEY = 'sq.quality.log';

/** The level as this screen draws it: the pixel ratio never above the screen's own or 1 (Low). */
export function qualityAt(level: number, deviceDpr: number): Quality {
  const q = LEVELS[Math.min(Math.max(Math.round(level), 0), LAST_LEVEL)] ?? FULL;
  return { ...q, dpr: Math.min(q.dpr, deviceDpr || 1, 1) };
}

const same = (a: Quality, b: Quality) =>
  a.dpr === b.dpr &&
  a.anisotropy === b.anisotropy &&
  a.ambient === b.ambient &&
  a.scenery === b.scenery &&
  a.offerScheme === b.offerScheme;

/** The next level that changes something on this screen, or the same at the bottom. */
export function lowerLevel(level: number, deviceDpr: number): number {
  const now = qualityAt(level, deviceDpr);
  for (let next = level + 1; next <= LAST_LEVEL; next++)
    if (!same(qualityAt(next, deviceDpr), now)) return next;
  return level;
}

const DPR_LEVELS = [1, 0.85, 0.75, 0.6];

/** A pixel ratio stored by plan 3a onto its level: the first step at or below it. */
export function levelOfDpr(dpr: number): number | null {
  if (!(dpr > 0 && dpr <= 1)) return null;
  const i = DPR_LEVELS.findIndex((d) => d <= dpr + 1e-6);
  return i >= 0 ? i : DPR_LEVELS.length - 1;
}

/** The remembered level and when it was set, or null: none, unreadable or older than a week. */
export function readStoredQuality(now = Date.now()): { level: number; at: number } | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const value = raw
      ? (JSON.parse(raw) as { level?: unknown; dpr?: unknown; at?: unknown })
      : null;
    if (!value || typeof value.at !== 'number' || now - value.at > REMEMBER_MS) return null;
    const level =
      typeof value.level === 'number'
        ? Number.isInteger(value.level) && value.level >= 0 && value.level <= LAST_LEVEL
          ? value.level
          : null
        : typeof value.dpr === 'number'
          ? levelOfDpr(value.dpr)
          : null;
    return level === null ? null : { level, at: value.at };
  } catch {
    return null;
  }
}

export function readStoredLevel(now = Date.now()): number | null {
  return readStoredQuality(now)?.level ?? null;
}

export function storeLevel(level: number, now = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ level, at: now }));
  } catch {
    // Without storage the level is found again next time.
  }
}

/** One measured window of moves. */
export type Measure = { fps: number; level: number; at: number };

/** The last windows of moves, oldest first; empty without storage. */
export function readMeasures(): Measure[] {
  try {
    const raw = globalThis.localStorage?.getItem(LOG_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter(
          (m): m is Measure =>
            typeof m === 'object' &&
            m !== null &&
            typeof (m as Measure).fps === 'number' &&
            typeof (m as Measure).level === 'number' &&
            typeof (m as Measure).at === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

export function storeMeasure(measure: Measure): void {
  try {
    const kept = [...readMeasures(), measure].slice(-LOG_SIZE);
    globalThis.localStorage?.setItem(LOG_KEY, JSON.stringify(kept));
  } catch {
    // Only `#/debug` reads it.
  }
}

/** «Сбросить качество» on `#/debug`: the next moves measure from the top again. */
export function resetQuality(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    globalThis.localStorage?.removeItem(LOG_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
}

/**
 * Judges the frames drawn while moves play at the full rate: each finished window returns its
 * frame rate and whether it was the second slow one in a row (time to step down). Frames drawn
 * while not measuring (a slower mode, a pause) only reset the count.
 */
export function createQualityGovernor(windowMs = MEASURE_MS) {
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
      opts: { measuring: boolean; targetFps: number },
    ): { fps: number; stepDown: boolean } | null {
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
      const stepDown = slowWindows >= SLOW_WINDOWS;
      if (stepDown) slowWindows = 0;
      return { fps, stepDown };
    },
    reset,
  };
}
