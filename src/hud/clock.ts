import { useEffect, useState } from 'react';

/** How often a running count or show reads its clock: the DOM changes this often, no frame loop. */
const TICK_MS = 50;

/**
 * Milliseconds since `run` began, counted only while the tab is visible (PERF-3: a hidden tab keeps the
 * moment for later), up to `until`, then the timer stops (PERF-1). Null before the first visible tick
 * and without a run.
 */
export function useVisibleClock(run: number | null, until: number): number | null {
  const [clock, setClock] = useState<{ run: number | null; ms: number }>({ run: null, ms: 0 });
  useEffect(() => {
    if (run === null) return;
    let ms = 0;
    let started = false;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible') {
        if (started) ms += now - last;
        started = true;
        setClock({ run, ms: Math.min(ms, until) });
        if (ms >= until) window.clearInterval(timer);
      }
      last = now;
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [run, until]);
  return run !== null && clock.run === run ? clock.ms : null;
}

/** The viewer asked the system for less motion: numbers jump, nothing flashes (D-56). */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
