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
  let last: number | null = null;

  const running = () => reasons.size > 0 && !paused;
  const loop = (now: number) => {
    handle = null;
    if (!running()) {
      last = null;
      return;
    }
    // 1 ms of slack: rAF timestamps jitter around the display's own interval.
    if (last === null || now - last >= interval - 1) {
      const dt = last === null ? 0 : Math.min(now - last, MAX_STEP_MS);
      last = now;
      deps.onFrame(dt);
    }
    if (running()) handle = deps.raf(loop);
    else last = null;
  };
  const update = () => {
    if (running() && handle === null) handle = deps.raf(loop);
    if (!running() && handle !== null) {
      deps.cancel(handle);
      handle = null;
      last = null;
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
