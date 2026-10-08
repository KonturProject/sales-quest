import { useEffect, useRef, useState } from 'react';
import { IDLE_SLOW_MS, renderMode, type RenderMode } from './policy.ts';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;

/**
 * The render mode from the page's visibility, focus and input (PERF-3…7). Re-evaluated on each
 * event and once a threshold (freeze, idle) is due — a timer, never a frame loop.
 */
export function useRenderMode(opts: { tv: boolean; blurFreezeMs: number }): RenderMode {
  const { tv, blurFreezeMs } = opts;
  const [mode, setMode] = useState<RenderMode>('active');
  const current = useRef<RenderMode>('active');

  useEffect(() => {
    let blurredAt: number | null = document.hasFocus() ? null : performance.now();
    let lastInput = performance.now();
    let timer: number | undefined;

    const evaluate = () => {
      const now = performance.now();
      const next = renderMode({
        hidden: document.visibilityState === 'hidden',
        blurredMs: blurredAt === null ? null : now - blurredAt,
        blurFreezeMs,
        idleMs: now - lastInput,
        tv,
      });
      current.current = next;
      setMode(next);
      window.clearTimeout(timer);
      const waits: number[] = [];
      if (!tv && blurredAt !== null && next !== 'frozen')
        waits.push(blurFreezeMs - (now - blurredAt));
      if (!tv && next === 'active') waits.push(IDLE_SLOW_MS - (now - lastInput));
      const wait = Math.min(...waits.filter((w) => w > 0));
      if (Number.isFinite(wait)) timer = window.setTimeout(evaluate, wait + 50);
    };
    const onBlur = () => {
      blurredAt = performance.now();
      evaluate();
    };
    const onFocus = () => {
      blurredAt = null;
      evaluate();
    };
    const onInput = () => {
      lastInput = performance.now();
      if (current.current === 'slow') evaluate();
    };

    evaluate();
    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', evaluate);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput);
    };
  }, [tv, blurFreezeMs]);

  return mode;
}
