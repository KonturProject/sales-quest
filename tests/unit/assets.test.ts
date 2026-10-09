import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  budgetProblems,
  edgeFade,
  fadeEdges,
  hexToRgb,
  type Manifest,
} from '../../scripts/lib/assets.ts';
import { AMBIENT_HEIGHT, ambientCloud, random } from '../../src/scene/ambient.ts';

describe('panel edges (D-41: seams sink into one mist)', () => {
  it('take all of the background on the border, none past the band, smoothly between', () => {
    const band = { x: 0.1, y: 0.1 };
    expect(edgeFade(0, 50, 100, 100, band)).toBeGreaterThan(0.95);
    expect(edgeFade(99, 50, 100, 100, band)).toBeGreaterThan(0.95);
    expect(edgeFade(50, 0, 100, 100, band)).toBeGreaterThan(0.95);
    expect(edgeFade(50, 50, 100, 100, band)).toBe(0);
    expect(edgeFade(20, 50, 100, 100, band)).toBe(0);
    const near = edgeFade(3, 50, 100, 100, band);
    const far = edgeFade(7, 50, 100, 100, band);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('blend the border pixels into the background colour and keep the middle', () => {
    const w = 20;
    const h = 10;
    const pixels = new Uint8Array(w * h * 3).fill(200);
    fadeEdges(pixels, w, h, 3, hexToRgb('#2d4050'), { x: 0.2, y: 0.2 });
    expect([...pixels.subarray(0, 3)].map((v) => Math.abs(v - 200) > 100)).toEqual([
      true,
      true,
      true,
    ]);
    const middle = ((h / 2) * w + w / 2) * 3;
    expect([...pixels.subarray(middle, middle + 3)]).toEqual([200, 200, 200]);
    expect(hexToRgb('#2d4050')).toEqual([0x2d, 0x40, 0x50]);
  });
});

describe('asset budgets (§12.1, GFX-PIPE-3)', () => {
  const ok: Manifest = {
    board: [
      {
        theme: 'ruins',
        source: 'ruins1.jfif',
        file: 'board/ruins.webp',
        width: 1024,
        height: 559,
        bytes: 100_000,
        licence: 'own (D-37)',
      },
    ],
    heroes: [
      {
        hero: 'knight',
        file: 'heroes/knight.glb',
        bytes: 400_000,
        texture: { width: 128, height: 128 },
        clips: ['Idle', 'Running_A', 'Jump_Full_Short', 'Cheer'],
        height: 2.4,
        variants: [{ id: 'knight', triangles: 2800 }],
        pack: 'KayKit',
        licence: 'CC0-1.0',
      },
    ],
  };

  it('pass a manifest within them', () => {
    expect(budgetProblems(ok)).toEqual([]);
  });

  it('name every broken budget', () => {
    const bad: Manifest = {
      board: [{ ...ok.board[0]!, width: 2048, licence: 'unknown', bytes: 25 * 1024 * 1024 }],
      heroes: [{ ...ok.heroes[0]!, variants: [{ id: 'knight', triangles: 3200 }] }],
    };
    const problems = budgetProblems(bad).join('\n');
    expect(problems).toMatch(/2048×559 больше 1024²/);
    expect(problems).toMatch(/knight: 3200 треугольников больше 3000/);
    expect(problems).toMatch(/ассеты .* МБ больше 20 МБ/);
    expect(problems).toMatch(/лицензия «unknown»/);
    expect(budgetProblems(ok, { ...BUDGET, gpuTextureBytes: 1 }).join()).toMatch(/в GPU/);
  });

  it('take only CC0, plain CC BY and own art of the author, and every clip the scene plays', () => {
    const withLicence = (licence: string) =>
      budgetProblems({ ...ok, heroes: [{ ...ok.heroes[0]!, licence }] });
    expect(withLicence('CC-BY-4.0')).toEqual([]);
    expect(withLicence('CC-BY-NC-4.0').join()).toMatch(/лицензия/);
    expect(withLicence('CC-BY-SA-4.0').join()).toMatch(/лицензия/);
    expect(withLicence('own').join()).toMatch(/лицензия/);
    const noCheer = budgetProblems({
      ...ok,
      heroes: [{ ...ok.heroes[0]!, clips: ['Idle', 'Running_A', 'Jump_Full_Short'] }],
    });
    expect(noCheer.join()).toMatch(/нет клипов Cheer/);
  });
});

describe('ambient clouds (3b)', () => {
  it('are the same for the same panel and stay over it', () => {
    const panel = { x0: 22, width: 22, depth: 12 };
    const a = ambientCloud(panel, 7, 50);
    expect(ambientCloud(panel, 7, 50)).toEqual(a);
    expect(ambientCloud(panel, 8, 50)).not.toEqual(a);
    for (let i = 0; i < 50; i++) {
      const [x, y, z] = [a.positions[i * 3]!, a.positions[i * 3 + 1]!, a.positions[i * 3 + 2]!];
      expect(x).toBeGreaterThanOrEqual(22);
      expect(x).toBeLessThanOrEqual(44);
      expect(y).toBeGreaterThanOrEqual(AMBIENT_HEIGHT[0]);
      expect(y).toBeLessThanOrEqual(AMBIENT_HEIGHT[1]);
      expect(Math.abs(z)).toBeLessThanOrEqual(6);
    }
    const next = random(0);
    expect(next()).toBeGreaterThan(0);
  });
});
