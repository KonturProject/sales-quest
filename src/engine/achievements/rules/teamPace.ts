import type { Candidate, RuleHandler } from '../types.ts';

/**
 * Ahead of the team's own pace line (D-26) at the end of `aheadDays` working days in a row; days
 * off are skipped. A team without a plan has no pace to beat.
 */
export const teamPace: RuleHandler<'team_pace'> = (rule, ctx) => {
  const found: Candidate[] = [];
  const runs = new Map<string, number>();
  for (const day of ctx.timeline) {
    if (!day.working) continue;
    for (const t of day.teams) {
      const ahead = t.targetPoints > 0 && t.position > t.pacePosition;
      const run = ahead ? (runs.get(t.teamId) ?? 0) + 1 : 0;
      if (run === rule.aheadDays) {
        found.push({ teamId: t.teamId, date: day.date });
        runs.set(t.teamId, 0); // a second full run counts again for repeatable achievements
      } else runs.set(t.teamId, run);
    }
  }
  return found;
};
