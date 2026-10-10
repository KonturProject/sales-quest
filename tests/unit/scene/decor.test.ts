import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../../scripts/lib/assets.ts';
import { buildTrack } from '../../../src/engine/track.ts';
import { DECOR, DECOR_MODELS, decorSpots } from '../../../src/scene/decor.ts';
import { PANEL_DEPTH, PANEL_WIDTH, buildLayout } from '../../../src/scene/layout.ts';
import { themeOf } from '../../../src/scene/themes.ts';
import { makeConfig } from '../../support/builders.ts';

const track = buildTrack(
  { ...makeConfig(), track: { cellsPerWorkingDay: 3, overflowPct: 50 } },
  10,
);
const themes = ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf);
const manifest = JSON.parse(readFileSync('src/assets/manifest.json', 'utf8')) as Manifest;
const decorFile = manifest.models?.find((m) => m.file === 'decor/decor.glb');

describe('decor on the painted panels (D-44)', () => {
  it('stands on its panel and keeps off the path and its cells', () => {
    for (const arrangement of ['row', 'snake'] as const) {
      const layout = buildLayout(track, themes, arrangement);
      for (const spot of decorSpots(layout)) {
        const panel = layout.panels.find(
          (p) =>
            spot.x >= p.x0 &&
            spot.x <= p.x0 + PANEL_WIDTH &&
            Math.abs(spot.z - p.z0) <= PANEL_DEPTH / 2,
        );
        expect(panel, `${spot.model} at ${spot.u},${spot.v}`).toBeDefined();
        const nearest = Math.min(
          ...(panel?.path ?? []).map((q) => Math.hypot(q.x - spot.x, q.z - spot.z)),
        );
        expect(nearest, `${spot.model} at ${spot.u},${spot.v}`).toBeGreaterThan(1);
      }
    }
  });

  it('uses only models of the decor file, within the triangles of a location (§12.1)', () => {
    expect(decorFile).toBeDefined();
    const triangles = new Map(decorFile?.items.map((i) => [i.id, i.triangles]));
    expect([...DECOR_MODELS].sort()).toEqual([...triangles.keys()].sort());
    for (const [theme, items] of Object.entries(DECOR)) {
      const sum = items.reduce((s, i) => s + (triangles.get(i.model) ?? 0), 0);
      expect(sum, theme).toBeLessThanOrEqual(15_000);
    }
  });
});
