import { eachDate } from '../../dates.ts';
import { effectiveMemberships, isFiredOn, teamOn } from '../../roster.ts';
import { EPS, valueOf, windowsOf } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

/**
 * On some day of the window, everyone in the team that day (not fired) has at least `minEach`
 * of the metric over their days in this team since the window began. A later newcomer does not
 * take it back; a fired member does not hold the team back (D-29, R-5).
 */
export const teamAllMembers: RuleHandler<'team_all_members'> = (rule, ctx) => {
  const { config, today } = ctx;
  const found: Candidate[] = [];
  const managers = config.managers.map((m) => ({
    m,
    periods: effectiveMemberships(m),
    days: new Map((ctx.days.get(m.id) ?? []).map((d) => [d.date, d])),
  }));
  for (const window of windowsOf(rule.period, ctx.calendar)) {
    const last = window.end < today ? window.end : today;
    if (last < window.start) continue;
    const totals = new Map<string, number>(); // `${teamId}|${managerId}` → running total
    const done = new Set<string>();
    for (const date of eachDate(window.start, last)) {
      const members = new Map<string, string[]>(); // teamId → managers in it on `date`
      for (const { m, periods, days } of managers) {
        const day = days.get(date);
        if (day) {
          const key = `${teamOn(m, date)}|${m.id}`;
          totals.set(key, (totals.get(key) ?? 0) + valueOf(day, rule.metric));
        }
        if (isFiredOn(m, date)) continue;
        const period = periods.find((p) => date >= p.from && (p.to === undefined || date <= p.to));
        if (period) members.set(period.teamId, [...(members.get(period.teamId) ?? []), m.id]);
      }
      for (const [teamId, ids] of members)
        if (
          !done.has(teamId) &&
          ids.every((id) => (totals.get(`${teamId}|${id}`) ?? 0) >= rule.minEach - EPS)
        ) {
          done.add(teamId);
          found.push({ teamId, date });
        }
    }
  }
  return found;
};
