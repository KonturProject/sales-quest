import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../../src/scene/layout.ts';
import { themeOf } from '../../../src/scene/themes.ts';
import {
  currentSpan,
  positionSpan,
  publishSpan,
  subscribeSpan,
} from '../../../src/scene/viewWindow.ts';

const layout = buildLayout(
  { cellsPerLocation: 8, trackLength: 32, overflowCells: 6 },
  ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf),
);

describe('the window of the camera on the track (GFX-5)', () => {
  it('is the range of positions whose cells lie between the edges of the view', () => {
    const all = positionSpan(layout, layout.bounds.minX, layout.bounds.maxX);
    expect(all).toEqual({ from: 0, to: layout.spots.length - 1 });
    const firstPanel = layout.panels[0];
    const one = positionSpan(layout, firstPanel?.x0 ?? 0, (layout.panels[1]?.x0 ?? 0) - 0.01);
    expect(one?.from).toBe(1);
    expect(one?.to).toBe(8);
    expect(positionSpan(layout, -1000, -999)).toBeNull();
  });

  it('tells the HUD only when it changes', () => {
    const seen: unknown[] = [];
    const stop = subscribeSpan(() => seen.push(currentSpan()));
    publishSpan({ from: 1, to: 8 });
    publishSpan({ from: 1, to: 8 });
    publishSpan({ from: 2, to: 9 });
    publishSpan(null);
    stop();
    publishSpan({ from: 3, to: 3 });
    expect(seen).toEqual([{ from: 1, to: 8 }, { from: 2, to: 9 }, null]);
  });
});
