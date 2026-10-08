import { describe, expect, it } from 'vitest';
import { parseSeasonConfig } from '../../src/data/schemas/season.ts';
import { computeGameState } from '../../src/engine/gameState.ts';
import { demoSeason, mondayOf } from '../../scripts/lib/demo.ts';

const start = '2026-10-05';

describe('demoSeason (DATA-16, D-32)', () => {
  it('is repeatable for a seed and differs between seeds', () => {
    expect(demoSeason({ start, seed: 7 })).toEqual(demoSeason({ start, seed: 7 }));
    expect(demoSeason({ start, seed: 8 }).records).not.toEqual(
      demoSeason({ start, seed: 7 }).records,
    );
  });

  it('makes a valid two-week game of six teams and about fifty people', () => {
    const { config } = demoSeason({ start });
    expect(parseSeasonConfig(config)).toEqual(config);
    expect([config.period, config.teams.length, config.managers.length]).toEqual([
      { start: '2026-10-05', end: '2026-10-18' },
      6,
      48,
    ]);
    expect(config.managers.filter((m) => m.firedAt).length).toBe(1);
    expect(config.managers.filter((m) => m.memberships.length > 1).length).toBe(1);
  });

  it('plays out like a game: teams spread on the track, achievements fall, no warnings', () => {
    const input = demoSeason({ start });
    const end = computeGameState(input, '2026-10-19T09:00:00+03:00');
    const positions = end.teams.map((t) => t.position);
    expect(Math.min(...positions)).toBeGreaterThan(8);
    expect(Math.max(...positions)).toBeGreaterThan(Math.min(...positions) + 4);
    expect(new Set(end.unlocks.map((u) => u.achievementId)).size).toBeGreaterThanOrEqual(8);
    expect(end.warnings).toEqual([]);

    // Mid-game, the days to come are not seen yet.
    const mid = computeGameState(input, '2026-10-09T09:00:00+03:00');
    expect(mid.dataAsOf).toBe('2026-10-09T09:00:00+03:00');
    expect(Math.max(...mid.teams.map((t) => t.position))).toBeLessThan(Math.max(...positions));
  });
});

describe('mondayOf', () => {
  it('finds the Monday of the week', () => {
    expect(['2026-10-05', '2026-10-08', '2026-10-11'].map(mondayOf)).toEqual([
      '2026-10-05',
      '2026-10-05',
      '2026-10-05',
    ]);
  });
});
