import { EPS, dayReaching, valueOf, windowsOf } from '../context.ts';
import type { Candidate, ManagerDay, RuleHandler } from '../types.ts';

/** A metric (or points) reaches a value in a day, or in total over a week / the game (D-29). */
export const threshold: RuleHandler<'threshold'> = (rule, ctx) => {
  const found: Candidate[] = [];
  const value = (d: ManagerDay) => valueOf(d, rule.metric);
  for (const [managerId, days] of ctx.days) {
    if (rule.period === 'day') {
      for (const d of days)
        if (value(d) >= rule.value - EPS) found.push({ managerId, date: d.date });
      continue;
    }
    for (const window of windowsOf(rule.period, ctx.calendar)) {
      const date = dayReaching(days, window, value, rule.value);
      if (date) found.push({ managerId, date });
    }
  }
  return found;
};
