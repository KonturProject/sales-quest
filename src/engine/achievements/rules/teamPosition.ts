import type { Candidate, RuleContext, RuleHandler, RuleOf } from '../types.ts';

function cellToReach(rule: RuleOf<'team_position'>, ctx: RuleContext): number {
  const { track } = ctx;
  switch (rule.reach) {
    case 'location':
      return track.locations.find((l) => l.index === rule.locationIndex)?.firstCell ?? Infinity;
    case 'finish':
      return track.trackLength;
    case 'overflow':
      return track.trackLength + 1;
    case 'overflow_end':
      return track.maxPosition;
  }
}

/**
 * A team's figure reaches a location, the finish, a step past it or the end of the overflow zone
 * at the end of a working day (timeline, D-29). `firstOnly` — the first such day only; of that
 * day's teams the one further along wins, teams on the same cell all win (D-28).
 */
export const teamPosition: RuleHandler<'team_position'> = (rule, ctx) => {
  const cell = cellToReach(rule, ctx);
  const reached = new Map<string, { date: string; position: number }>();
  for (const day of ctx.timeline)
    for (const t of day.teams)
      if (!reached.has(t.teamId) && t.position >= cell)
        reached.set(t.teamId, { date: day.date, position: t.position });

  const all: Candidate[] = [...reached].map(([teamId, r]) => ({ teamId, date: r.date }));
  if (!rule.firstOnly || all.length === 0) return all;
  const firstDay = all.reduce((min, c) => (c.date < min ? c.date : min), all[0]?.date ?? '');
  const sameDay = [...reached].filter(([, r]) => r.date === firstDay);
  const furthest = Math.max(...sameDay.map(([, r]) => r.position));
  return sameDay
    .filter(([, r]) => r.position === furthest)
    .map(([teamId]) => ({ teamId, date: firstDay }));
};
