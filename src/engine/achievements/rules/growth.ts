import { EPS, dayReaching, sumIn, valueOf } from '../context.ts';
import type { Candidate, ManagerDay, RuleHandler } from '../types.ts';

/** A game week's total reaches the previous week's total + weekOverWeekPct, from minBase (D-29). */
export const growth: RuleHandler<'growth'> = (rule, ctx) => {
  const found: Candidate[] = [];
  const value = (d: ManagerDay) => valueOf(d, rule.metric);
  const weeks = ctx.calendar.weeks;
  for (let k = 1; k < weeks.length; k++) {
    const previous = weeks[k - 1];
    const current = weeks[k];
    if (!previous || !current) continue;
    for (const [managerId, days] of ctx.days) {
      const base = sumIn(days, previous, value);
      if (base < rule.minBase - EPS) continue;
      const date = dayReaching(days, current, value, base * (1 + rule.weekOverWeekPct / 100));
      if (date) found.push({ managerId, date });
    }
  }
  return found;
};
