import { describe, expect, it } from 'vitest';
import { renderMode, fpsFor, paused, IDLE_SLOW_MS } from '../../../src/scene/runtime/policy.ts';
import {
  REMEMBER_MS,
  createDprGovernor,
  initialDpr,
  lowerDpr,
  readStoredDpr,
  storeDpr,
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

describe('quality (PERF-8)', () => {
  /** Feeds `seconds` of frames at `fps`; returns the pixel ratios the governor asked for. */
  const run = (
    governor: ReturnType<typeof createDprGovernor>,
    fps: number,
    seconds: number,
    opts: { measuring: boolean; targetFps: number; dpr: number },
  ) => {
    const asked: number[] = [];
    let dpr = opts.dpr;
    for (let i = 0; i < fps * seconds; i++) {
      const next = governor.frame(1000 / fps, { ...opts, dpr });
      if (next !== null) {
        asked.push(next);
        dpr = next;
      }
    }
    return asked;
  };

  it('steps down after two slow windows in a row, to 0.6 at most', () => {
    expect([lowerDpr(1), lowerDpr(0.85), lowerDpr(0.6)]).toEqual([0.85, 0.75, 0.6]);
    const governor = createDprGovernor();
    expect(run(governor, 20, 4, { measuring: true, targetFps: 30, dpr: 1 })).toEqual([]);
    expect(run(governor, 20, 30, { measuring: true, targetFps: 30, dpr: 1 })).toEqual([
      0.85, 0.75, 0.6,
    ]);
  });

  it('leaves a healthy rate alone, and never judges a slower mode or a pause (review 3a)', () => {
    const governor = createDprGovernor();
    expect(run(governor, 29, 30, { measuring: true, targetFps: 30, dpr: 1 })).toEqual([]);
    expect(run(governor, 15, 30, { measuring: false, targetFps: 30, dpr: 1 })).toEqual([]);
    // One slow window, a pause, one slow window — not two in a row.
    run(governor, 20, 2.6, { measuring: true, targetFps: 30, dpr: 1 });
    governor.frame(10, { measuring: false, targetFps: 30, dpr: 1 });
    expect(run(governor, 20, 2.6, { measuring: true, targetFps: 30, dpr: 1 })).toEqual([]);
  });

  it('starts at the remembered step, never above the screen or 1', () => {
    expect(initialDpr(2, null)).toBe(1);
    expect(initialDpr(0.8, null)).toBe(0.8);
    expect(initialDpr(2, 0.75)).toBe(0.75);
  });

  it('remembers the step for a week when storage works', () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    try {
      expect(readStoredDpr(0)).toBeNull();
      storeDpr(0.75, 1000);
      expect(readStoredDpr(1000 + REMEMBER_MS)).toBe(0.75);
      expect(readStoredDpr(1001 + REMEMBER_MS)).toBeNull();
      store.set('sq.quality', '{"dpr": 7, "at": 1000}');
      expect(readStoredDpr(1000)).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
