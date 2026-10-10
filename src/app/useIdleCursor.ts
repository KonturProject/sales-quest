import { useEffect, useState } from 'react';

/** The pointer of a wall screen hides after this long without moving (PERF-5). */
export const CURSOR_HIDE_MS = 3000;

/** True while the pointer should be hidden: enabled (the TV mode) and still for `ms`. */
export function useIdleCursor(enabled: boolean, ms = CURSOR_HIDE_MS): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => setHidden(true), ms);
    const onMove = () => {
      setHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHidden(true), ms);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
    };
  }, [enabled, ms]);
  return enabled && hidden;
}
