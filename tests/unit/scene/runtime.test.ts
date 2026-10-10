import { describe, expect, it } from 'vitest';
import { renderMode, fpsFor, paused, IDLE_SLOW_MS } from '../../../src/scene/runtime/policy.ts';
import {
  LAST_LEVEL,
  LEVELS,
  LOG_SIZE,
  REMEMBER_MS,
  createQualityGovernor,
  levelOfDpr,
  lowerLevel,
  qualityAt,
  readMeasures,
  readStoredLevel,
  readStoredQuality,
  resetQuality,
  storeLevel,
  storeMeasure,
} from '../../../src/scene/runtime/quality.ts';
import { createTicker, MAX_STEP_MS } from '../../../src/scene/runtime/ticker.ts';

/** A fake requestAnimationFrame: `step(ms)` advances the clock and fires the pending callback. */
function fakeFrames() {
  let now = 0;
  let pending: ((now: number) => void) | null = null;
  let scheduled = 0;
  return {
    raf: (cb: (now: number) => void) => {
      pending = cb;
      scheduled += 1;
      return scheduled;
    },
    cancel: () => {
      pending = null;
    },
    step(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.(now);
    },
    pending: () => pending !== null,
  };
}

describe('ticker (PERF-1)', () => {
  it('asks for nothing without a reason, and for ≤ 30 frames a second with one', () => {
    const frames = fakeFrames();
    const drawn: number[] = [];
    const ticker = createTicker({ ...frames, onFrame: (dt) => drawn.push(dt) });
    expect(frames.pending()).toBe(false);
    ticker.want('move');
    for (let i = 0; i < 60; i++) frames.step(1000 / 60); // a 60 Hz display, one second
    expect(drawn.length).toBeGreaterThanOrEqual(29);
    expect(drawn.length).toBeLessThanOrEqual(31);
    expect(drawn[0]).toBe(0);
    ticker.release('move');
    frames.step(16);
    expect(frames.pending()).toBe(false);
  });

  it('keeps to 30 frames a second on 75 and 144 Hz displays and after a missed vsync', () => {
    for (const hz of [60, 75, 144]) {
      const frames = fakeFrames();
      let count = 0;
      const ticker = createTicker({ ...frames, onFrame: () => (count += 1) });
      ticker.want('move');
      let elapsed = 0;
      for (let i = 0; i < hz * 2; i++) {
        const ms = i % 15 === 7 ? 2000 / hz : 1000 / hz;
        elapsed += ms;
        frames.step(ms);
      }
      const fps = count / (elapsed / 1000);
      expect(fps).toBeGreaterThanOrEqual(29);
      expect(fps).toBeLessThanOrEqual(31);
      ticker.dispose();
    }
  });

  it('keeps running while any reason holds and stops when paused', () => {
    const frames = fakeFrames();
    let count = 0;
    const ticker = createTicker({ ...frames, onFrame: () => (count += 1) });
    ticker.want('move');
    ticker.want('camera');
    ticker.release('move');
    expect(ticker.running()).toBe(true);
    ticker.setPaused(true);
    expect([ticker.running(), frames.pending()]).toEqual([false, false]);
    ticker.setPaused(false);
    frames.step(40);
    expect(count).toBe(1);
    ticker.dispose();
    expect(frames.pending()).toBe(false);
  });

  it('limits the step after a long gap and follows a lower frame rate', () => {
    const frames = fakeFrames();
    const drawn: number[] = [];
    const ticker = createTicker({ ...frames, onFrame: (dt) => drawn.push(dt) });
    ticker.want('move');
    frames.step(10);
    frames.step(5000);
    expect(drawn).toEqual([0, MAX_STEP_MS]);
    ticker.setFps(15);
    drawn.length = 0;
    for (let i = 0; i < 60; i++) frames.step(1000 / 60);
    expect(drawn.length).toBeLessThanOrEqual(16);
  });
});

describe('render policy (PERF-3…7)', () => {
  const base = { hidden: false, blurredMs: null, blurFreezeMs: 30_000, idleMs: 0, tv: false };

  it('stops in a hidden tab, freezes out of focus, slows down when idle', () => {
    expect(renderMode({ ...base, hidden: true })).toBe('stopped');
    expect(renderMode({ ...base, blurredMs: 29_000 })).toBe('active');
    expect(renderMode({ ...base, blurredMs: 30_000 })).toBe('frozen');
    expect(renderMode({ ...base, idleMs: IDLE_SLOW_MS })).toBe('slow');
    expect(renderMode(base)).toBe('active');
  });

  it('keeps a TV screen going out of focus and without input (PERF-5)', () => {
    expect(renderMode({ ...base, tv: true, blurredMs: 600_000, idleMs: 600_000 })).toBe('active');
    expect(renderMode({ ...base, tv: true, hidden: true })).toBe('stopped');
  });

  it('maps modes to frame rates and pauses', () => {
    expect([fpsFor('active'), fpsFor('slow')]).toEqual([30, 15]);
    expect(['stopped', 'frozen', 'slow', 'active'].map((m) => paused(m as never))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('quality ladder (PERF-8, D-45)', () => {
  /** Feeds `seconds` of frames at `fps`; returns the levels the scene walked down to. */
  const run = (
    governor: ReturnType<typeof createQualityGovernor>,
    fps: number,
    seconds: number,
    opts: { measuring: boolean; level: number; deviceDpr?: number },
  ) => {
    const walked: number[] = [];
    let level = opts.level;
    for (let i = 0; i < fps * seconds; i++) {
      const window = governor.frame(1000 / fps, { measuring: opts.measuring, targetFps: 30 });
      if (window?.stepDown) {
        const next = lowerLevel(level, opts.deviceDpr ?? 1);
        if (next !== level) walked.push((level = next));
      }
    }
    return walked;
  };

  it('goes DPR 1 → 0.85 → 0.75 → 0.6 → no anisotropy → no ambient → no scenery → offer 2D', () => {
    expect(
      LEVELS.map((q) =>
        [
          q.dpr,
          q.anisotropy && 'aniso',
          q.ambient && 'life',
          q.scenery && 'things',
          q.offerScheme && '2d',
        ]
          .filter(Boolean)
          .join(' '),
      ),
    ).toEqual([
      '1 aniso life things',
      '0.85 aniso life things',
      '0.75 aniso life things',
      '0.6 aniso life things',
      '0.6 life things',
      '0.6 things',
      '0.6',
      '0.6 2d',
    ]);
    expect(LAST_LEVEL).toBe(7);
  });

  it('steps one level after two slow windows in a row, down to the last', () => {
    const governor = createQualityGovernor();
    expect(run(governor, 20, 4, { measuring: true, level: 0 })).toEqual([]);
    expect(run(governor, 20, 60, { measuring: true, level: 0 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('leaves a healthy rate alone, and never judges a slower mode or a pause (review 3a)', () => {
    const governor = createQualityGovernor();
    expect(run(governor, 29, 30, { measuring: true, level: 0 })).toEqual([]);
    expect(run(governor, 15, 30, { measuring: false, level: 0 })).toEqual([]);
    // One slow window, a pause, one slow window — not two in a row.
    run(governor, 20, 2.6, { measuring: true, level: 0 });
    governor.frame(10, { measuring: false, targetFps: 30 });
    expect(run(governor, 20, 2.6, { measuring: true, level: 0 })).toEqual([]);
  });

  it('reports each measured window for #/debug', () => {
    const governor = createQualityGovernor(1000);
    const windows = [];
    for (let i = 0; i < 50; i++) {
      const w = governor.frame(40, { measuring: true, targetFps: 30 });
      if (w) windows.push(w);
    }
    expect(windows.map((w) => [w.fps, w.stepDown])).toEqual([
      [25, false],
      [25, false],
    ]);
  });

  it('skips a step that changes nothing on this screen, never above its pixel ratio or 1', () => {
    expect(qualityAt(0, 2).dpr).toBe(1);
    expect(qualityAt(2, 2).dpr).toBe(0.75);
    expect(qualityAt(0, 0.8).dpr).toBe(0.8);
    expect(lowerLevel(0, 0.8)).toBe(2); // 0.85 would still draw at 0.8
    expect(lowerLevel(0, 0.5)).toBe(4); // every DPR step draws at 0.5
    expect(lowerLevel(LAST_LEVEL, 1)).toBe(LAST_LEVEL);
    expect(qualityAt(99, 1)).toEqual(LEVELS[LAST_LEVEL]);
    expect(qualityAt(-1, 1)).toEqual(LEVELS[0]);
  });

  it('maps a pixel ratio stored by plan 3a onto its level', () => {
    expect([1, 0.85, 0.75, 0.6, 0.9, 0.5].map(levelOfDpr)).toEqual([0, 1, 2, 3, 1, 3]);
    expect([0, -1, 7, Number.NaN].map(levelOfDpr)).toEqual([null, null, null, null]);
  });

  it('remembers the level for a week, keeps the last windows of moves, and forgets on reset', () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    try {
      expect(readStoredLevel(0)).toBeNull();
      storeLevel(5, 1000);
      expect(readStoredLevel(1000 + REMEMBER_MS)).toBe(5);
      expect(readStoredQuality(1000)).toEqual({ level: 5, at: 1000 });
      expect(readStoredLevel(1001 + REMEMBER_MS)).toBeNull();
      store.set('sq.quality', '{"dpr": 0.75, "at": 1000}'); // plan 3a
      expect(readStoredLevel(1000)).toBe(2);
      store.set('sq.quality', '{"level": 9, "at": 1000}');
      expect(readStoredLevel(1000)).toBeNull();
      store.set('sq.quality', 'not json');
      expect(readStoredLevel(1000)).toBeNull();

      for (let i = 0; i < LOG_SIZE + 3; i++) storeMeasure({ fps: i, level: 0, at: i });
      const kept = readMeasures();
      expect(kept).toHaveLength(LOG_SIZE);
      expect(kept[0]?.fps).toBe(3);
      expect(kept.at(-1)?.fps).toBe(LOG_SIZE + 2);

      resetQuality();
      expect(readStoredLevel(1000)).toBeNull();
      expect(readMeasures()).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });

  it('works without storage at all', () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(readStoredLevel()).toBeNull();
      expect(readMeasures()).toEqual([]);
      expect(() => {
        storeLevel(3);
        storeMeasure({ fps: 20, level: 3, at: 0 });
        resetQuality();
      }).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
