/**
 * The scene's own frame clock (PERF-1): with `frameloop="demand"` nothing is drawn unless asked.
 * The ticker asks for frames — at most `fps` a second — only while some reason to animate holds
 * (a move under way, a camera flight, ambient life); with no reason it schedules nothing at all.
 */

export type TickerDeps = {
  raf: (callback: (now: number) => void) => number;
  cancel: (id: number) => void;
  /** A frame is due: advance the animations by `dtMs` and draw. */
  onFrame: (dtMs: number) => void;
};

export type Ticker = {
  want(reason: string): void;
  release(reason: string): void;
  /** No frames at all while paused (hidden tab, frozen window), whatever the reasons. */
  setPaused(paused: boolean): void;
  setFps(fps: number): void;
  running(): boolean;
  dispose(): void;
};

/** A late frame advances the animations by this much at most: a slow PC sees slower moves, not jumps. */
export const MAX_STEP_MS = 250;

export function createTicker(deps: TickerDeps, fps = 30): Ticker {
  const reasons = new Set<string>();
  let paused = false;
  let interval = 1000 / fps;
  let handle: number | null = null;
  /** When the previous frame was drawn, and when the next one is due (null — not running). */
  let lastFrame: number | null = null;
  let due = 0;

  const running = () => reasons.size > 0 && !paused;
  const stop = () => {
    lastFrame = null;
  };
  const loop = (now: number) => {
    handle = null;
    if (!running()) return stop();
    if (lastFrame === null) {
      lastFrame = now;
      due = now + interval;
      deps.onFrame(0);
    } else if (now >= due - 1) {
      // 1 ms of slack: rAF timestamps jitter around the display's own interval.
      const dt = Math.min(now - lastFrame, MAX_STEP_MS);
      lastFrame = now;
      // Keep to the schedule (30 a second on 60, 75 or 144 Hz alike), resyncing after a stall.
      due += interval;
      if (now - due > interval) due = now + interval;
      deps.onFrame(dt);
    }
    if (running()) handle = deps.raf(loop);
    else stop();
  };
  const update = () => {
    if (running() && handle === null) handle = deps.raf(loop);
    if (!running() && handle !== null) {
      deps.cancel(handle);
      handle = null;
      stop();
    }
  };

  return {
    want(reason) {
      reasons.add(reason);
      update();
    },
    release(reason) {
      reasons.delete(reason);
      update();
    },
    setPaused(next) {
      paused = next;
      update();
    },
    setFps(next) {
      interval = 1000 / next;
    },
    running,
    dispose() {
      reasons.clear();
      update();
    },
  };
}
