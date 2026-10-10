import type { Layout } from './layout.ts';

/**
 * Which part of the track the camera shows (GFX-5): the scene publishes it from its rendered
 * frames, the mini-map of the HUD draws it as a frame. No frames — no updates (PERF-1).
 */

export type Span = { from: number; to: number };

/** The positions whose cells lie between two edges of the view along x; null — none. */
export function positionSpan(layout: Layout, minX: number, maxX: number): Span | null {
  let from = Infinity;
  let to = -Infinity;
  for (const s of layout.spots)
    if (s.x >= minX && s.x <= maxX) {
      from = Math.min(from, s.position);
      to = Math.max(to, s.position);
    }
  return from <= to ? { from, to } : null;
}

let current: Span | null = null;
const listeners = new Set<() => void>();

export function publishSpan(span: Span | null): void {
  if (span === current || (span && current && span.from === current.from && span.to === current.to))
    return;
  current = span;
  for (const listener of listeners) listener();
}

export function currentSpan(): Span | null {
  return current;
}

export function subscribeSpan(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
