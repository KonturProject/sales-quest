import { describe, expect, it } from 'vitest';
import { minimapModel, spanFraction } from '../../src/hud/minimap.ts';

const track = {
  cellsPerLocation: 8,
  trackLength: 32,
  overflowCells: 8,
  maxPosition: 40,
  locations: [1, 2, 3, 4].map((index) => ({
    index,
    title: `Локация ${index}`,
    themePackId: `theme${index}`,
    firstCell: (index - 1) * 8 + 1,
    lastCell: index * 8,
  })),
};
const teams = [
  { id: 'a', color: '#aa0000', leaderName: 'Алина Смирнова', order: 1 },
  { id: 'b', color: '#0000bb', leaderName: 'Борис Кузнецов', order: 2 },
  { id: 'c', color: '#00cc00', leaderName: 'Вера Соколова', order: 3 },
];

describe('the mini-map (GFX-5)', () => {
  const model = minimapModel({
    track,
    teams,
    states: [
      { teamId: 'a', position: 10, pacePosition: 8 },
      { teamId: 'b', position: 10, pacePosition: 12 },
      { teamId: 'c', position: 55, pacePosition: 50 },
    ],
    colorOf: (id) => `color-${id}`,
  });

  it('lays the four locations and the cells beyond the plan along the whole track', () => {
    expect(model.bands.map((b) => [b.title, b.color, b.from, b.to])).toEqual([
      ['Локация 1', 'color-theme1', 0, 0.2],
      ['Локация 2', 'color-theme2', 0.2, 0.4],
      ['Локация 3', 'color-theme3', 0.4, 0.6],
      ['Локация 4', 'color-theme4', 0.6, 0.8],
      ['Сверх плана', null, 0.8, 1],
    ]);
    expect(model.finish).toBe(0.8);
  });

  it('puts each team at its share of the track, stacks a shared cell, clamps past the end', () => {
    expect(model.markers.map((m) => [m.teamId, m.at, m.stack])).toEqual([
      ['a', 0.25, 0],
      ['b', 0.25, 1],
      ['c', 1, 0],
    ]);
    expect(model.markers[0]?.position).toBe(10);
    expect(model.paces.map((p) => [p.teamId, p.at])).toEqual([
      ['a', 0.2],
      ['b', 0.3],
      ['c', 1],
    ]);
  });

  it('turns the camera window into a share of the track', () => {
    expect(spanFraction({ from: 4, to: 14 }, 40)).toEqual({ from: 0.1, to: 0.35 });
    expect(spanFraction({ from: -3, to: 60 }, 40)).toEqual({ from: 0, to: 1 });
    expect(spanFraction(null, 40)).toBeNull();
  });
});
