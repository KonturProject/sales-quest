import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../../src/engine/track.ts';
import { buildLayout } from '../../../src/scene/layout.ts';
import {
  CYCLE_MS,
  GROUP_GAP,
  MIN_WINDOW_CELLS,
  TV_CYCLE_MS,
  VIEWER_PAUSE_MS,
  cycleStep,
  restCycle,
  groupBounds,
  positionsKey,
  teamGroups,
} from '../../../src/scene/restView.ts';
import { themeOf } from '../../../src/scene/themes.ts';
import { makeConfig } from '../../support/builders.ts';

const pos = (entries: [string, number][]) =>
  entries.map(([teamId, position]) => ({ teamId, position }));
const groupsOf = (p: ReturnType<typeof pos>) => teamGroups(p).map((g) => [g.min, g.max]);
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

  it('changes its key with any position, so after moves the cycle starts from the leaders', () => {
    // A team in the middle of a group moves without changing its bounds: still a new key.
    const before = pos([
      ['t1', 3],
      ['t2', 5],
      ['t3', 7],
    ]);
    const after = pos([
      ['t1', 3],
      ['t2', 6],
      ['t3', 7],
    ]);
    expect(groupsOf(before)).toEqual(groupsOf(after));
    expect(positionsKey(before)).not.toBe(positionsKey(after));
    expect(positionsKey(before)).toBe(positionsKey([...before].reverse()));
  });
});

describe('cycleStep (D-42)', () => {
  const base = {
    paused: false,
    animating: false,
    sinceViewerMs: 10 * 60_000,
    groups: 2,
    userCamera: false,
  };

  it('moves on to the next group once a minute when there are several', () => {
    expect(cycleStep(base)).toBe('advance');
    expect(cycleStep({ ...base, userCamera: true })).toBe('advance');
  });

  it('brings the camera back when the viewer left it elsewhere, else rests', () => {
    expect(cycleStep({ ...base, groups: 1, userCamera: true })).toBe('back');
    expect(cycleStep({ ...base, groups: 1 })).toBe('skip');
    expect(cycleStep({ ...base, groups: 0 })).toBe('skip');
  });

  it('waits while moves play, the tab is hidden or frozen, or the viewer was just at the camera', () => {
    expect(cycleStep({ ...base, animating: true })).toBe('skip');
    expect(cycleStep({ ...base, paused: true })).toBe('skip');
    expect(cycleStep({ ...base, sinceViewerMs: VIEWER_PAUSE_MS - 1 })).toBe('skip');
    expect(cycleStep({ ...base, sinceViewerMs: VIEWER_PAUSE_MS })).toBe('advance');
  });
});

describe('the rest view on a TV screen (PERF-5)', () => {
  it('walks the teams one by one every 20 s, a shared cell at once; elsewhere groups every minute', () => {
    expect(restCycle(false)).toEqual({ everyMs: CYCLE_MS, gap: GROUP_GAP });
    expect(restCycle(true)).toEqual({ everyMs: TV_CYCLE_MS, gap: 0 });
    expect(TV_CYCLE_MS).toBe(20_000);
    const positions = [
      { teamId: 'a', position: 10 },
      { teamId: 'b', position: 11 },
      { teamId: 'c', position: 11 },
      { teamId: 'd', position: 3 },
    ];
    expect(teamGroups(positions, restCycle(true).gap).map((g) => g.teamIds)).toEqual([
      ['b', 'c'],
      ['a'],
      ['d'],
    ]);
    expect(teamGroups(positions, restCycle(false).gap).map((g) => g.teamIds)).toEqual([
      ['b', 'c', 'a'],
      ['d'],
    ]);
  });
});
