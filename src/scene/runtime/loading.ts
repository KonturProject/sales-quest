declare global {
  interface Window {
    /** Scene files still loading or being set up; e2e judges rest only at 0 (PERF-1). */
    __sqLoading?: number;
  }
}

/**
 * Counts a file the scene is loading until it has been applied (or failed, or the part unmounted):
 * a slow machine parses a file seconds after it arrives, and each applied file draws a frame — the
 * tests must not mistake that for a restless scene. Returns the «done» call; repeated calls are
 * ignored.
 */
export function beginLoad(): () => void {
  window.__sqLoading = (window.__sqLoading ?? 0) + 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    window.__sqLoading = Math.max((window.__sqLoading ?? 1) - 1, 0);
  };
}
