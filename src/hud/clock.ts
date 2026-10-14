import { useCallback, useSyncExternalStore } from 'react';
import { isMoving } from '../scene/moving.ts';

/**
 * How often the running clocks tick: the DOM changes at most this often — ten a second is smooth for a
 * running number and cheap beside the scene's frames (review D-56, D-48).
 */
const TICK_MS = 100;

/**
 * The clocks of moments (D-56), one per run (`cards:7`, `show:7`): milliseconds since the run began,
 * counted only while the tab is visible and the map's figures stand still (a walk first, then its story:
 * repainting the HUD during moves costs their frames — QA-4, D-48). Kept outside the components (review
 * D-56): a remounted HUD or map continues a run where it was — a finished one is not played again.
 */
export class RunClocks {
  /** `ms` −1: started, not yet seen on a visible tab. */
  private runs = new Map<string, { ms: number; until: number }>();

  start(key: string, until: number): void {
    const run = this.runs.get(key);
    if (!run) this.runs.set(key, { ms: -1, until });
    else if (until > run.until) run.until = until;
  }

  /** Null before the first visible tick (and for an unknown run). */
  elapsed(key: string): number | null {
    const ms = this.runs.get(key)?.ms;
    return ms === undefined || ms < 0 ? null : ms;
  }

  /** The run has played to its end; false while it runs, waits for a visible tab or was never started. */
  over(key: string): boolean {
    const run = this.runs.get(key);
    return run !== undefined && run.ms >= run.until;
  }

  /** Moves the running clocks on (only while `visible`); true while one still runs. */
  advance(dt: number, visible: boolean): boolean {
    let running = false;
    for (const run of this.runs.values()) {
      if (run.ms >= run.until) continue;
      if (visible) run.ms = run.ms < 0 ? 0 : Math.min(run.until, run.ms + dt);
      if (run.ms < run.until) running = true;
    }
    return running;
  }
}

const clocks = new RunClocks();
const listeners = new Set<() => void>();
let timer: number | null = null;
let last = 0;

/** One timer for every running clock (PERF-1); a hidden tab stops it until the tab is shown (PERF-3). */
function tick() {
  const now = performance.now();
  const dt = now - last;
  last = now;
  if (document.visibilityState !== 'visible') {
    stop();
    document.addEventListener('visibilitychange', run, { once: true });
    return;
  }
  const running = clocks.advance(dt, !isMoving());
  for (const listener of [...listeners]) listener();
  if (!running) stop();
}
function run() {
  if (timer !== null) return;
  last = performance.now();
  timer = window.setInterval(tick, TICK_MS);
}
function stop() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

/**
 * A run's clock as a component reads it: `select` turns the milliseconds (null — not started) into what
 * the component draws, so it redraws only when that changes (review D-56). `key` null — no run.
 */
export function useRunClock<T>(
  key: string | null,
  until: number,
  select: (ms: number | null) => T,
): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (key === null) return () => undefined;
      clocks.start(key, until);
      listeners.add(onChange);
      run();
      return () => void listeners.delete(onChange);
    },
    [key, until],
  );
  return useSyncExternalStore(subscribe, () => select(key === null ? null : clocks.elapsed(key)));
}

/**
 * Whether a run is over, read without starting it (D-58): the rating holds a batch's new achievements back
 * until the batch's show is over; a batch still waiting in the queue reads «not over».
 */
export function useRunOver(key: string | null): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    return () => void listeners.delete(onChange);
  }, []);
  return useSyncExternalStore(subscribe, () => key !== null && clocks.over(key));
}

/** The viewer asked the system for less motion: numbers jump, nothing flashes (D-56). */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
