import { eachDate } from '../../dates.ts';
import { isFiredOn, memberOn, teamOn } from '../../roster.ts';
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
  const dayOf = new Map(
    config.managers.map((m) => [m.id, new Map((ctx.days.get(m.id) ?? []).map((d) => [d.date, d]))]),
  );
  for (const window of windowsOf(rule.period, ctx.calendar)) {
    const last = window.end < today ? window.end : today;
    if (last < window.start) continue;
    const dates = eachDate(window.start, last);
    for (const team of config.teams) {
      // Running total of each manager's metric in this team, by date.
      const totals = new Map<string, number>();
      for (const date of dates) {
        for (const m of config.managers) {
          const d = dayOf.get(m.id)?.get(date);
          if (d && teamOn(m, date) === team.id)
            totals.set(m.id, (totals.get(m.id) ?? 0) + valueOf(d, rule.metric));
        }
        const members = config.managers.filter(
          (m) => memberOn(m, team.id, date) && !isFiredOn(m, date),
        );
        if (
          members.length > 0 &&
          members.every((m) => (totals.get(m.id) ?? 0) >= rule.minEach - EPS)
        ) {
          found.push({ teamId: team.id, date });
          break;
        }
      }
    }
  }
  return found;
};
