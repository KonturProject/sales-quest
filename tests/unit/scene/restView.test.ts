import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../../src/engine/track.ts';
import { buildLayout } from '../../../src/scene/layout.ts';
import {
  GROUP_GAP,
  MIN_WINDOW_CELLS,
  groupBounds,
  groupsKey,
  teamGroups,
} from '../../../src/scene/restView.ts';
import { themeOf } from '../../../src/scene/themes.ts';
import { makeConfig } from '../../support/builders.ts';

const pos = (entries: [string, number][]) =>
  entries.map(([teamId, position]) => ({ teamId, position }));
const layout = buildLayout(
  buildTrack({ ...makeConfig(), track: { cellsPerWorkingDay: 3, overflowPct: 50 } }, 10),
  ['ruins', 'ice', 'volcano', 'heaven'].map(themeOf),
);

describe('teamGroups (D-42: more than 4 cells apart — another group)', () => {
  it('keeps teams within 4 cells of a neighbour together, leaders first', () => {
    const groups = teamGroups(
      pos([
        ['t1', 10],
        ['t2', 14],
        ['t3', 22],
        ['t4', 18],
        ['t5', 2],
      ]),
    );
    expect(groups.map((g) => g.teamIds)).toEqual([['t3', 't4', 't2', 't1'], ['t5']]);
    expect(groups.map((g) => [g.min, g.max])).toEqual([
      [10, 22],
      [2, 2],
    ]);
  });

  it('splits at a gap of 5 cells, not at 4', () => {
    expect(
      teamGroups(
        pos([
          ['a', 0],
          ['b', GROUP_GAP],
        ]),
      ),
    ).toHaveLength(1);
    expect(
      teamGroups(
        pos([
          ['a', 0],
          ['b', GROUP_GAP + 1],
        ]),
      ),
    ).toHaveLength(2);
    expect(teamGroups([])).toEqual([]);
  });
});

describe('groupBounds', () => {
  it('frames the group with a cell more on each side', () => {
    const b = groupBounds(layout, { min: 10, max: 17 });
    for (const p of [9, 10, 17, 18]) {
      const s = layout.spots[p]!;
      expect(s.x).toBeGreaterThanOrEqual(b.minX);
      expect(s.x).toBeLessThanOrEqual(b.maxX);
    }
    expect(layout.spots[20]!.x).toBeGreaterThan(b.maxX);
  });

  it('gives a lone figure a window of at least six cells, even at the ends of the track', () => {
    const last = layout.spots.length - 1;
    for (const p of [0, 12, last]) {
      const b = groupBounds(layout, { min: p, max: p });
      const inside = layout.spots.filter((s) => s.x >= b.minX && s.x <= b.maxX);
      expect(inside.length).toBeGreaterThanOrEqual(MIN_WINDOW_CELLS);
    }
  });

  it('changes its key when the groups change', () => {
    const a = teamGroups(
      pos([
        ['t1', 3],
        ['t2', 9],
      ]),
    );
    const b = teamGroups(
      pos([
        ['t1', 4],
        ['t2', 9],
      ]),
    );
    expect(groupsKey(a)).not.toBe(groupsKey(b));
    expect(groupsKey(a)).toBe(
      groupsKey(
        teamGroups(
          pos([
            ['t2', 9],
            ['t1', 3],
          ]),
        ),
      ),
    );
  });
});
