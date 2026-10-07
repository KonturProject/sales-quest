import { EPS, valueOf, windowsOf } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

/** numerator / Σ denominators ≥ minRatio, once the denominator reaches minDenominator. */
export const ratio: RuleHandler<'ratio'> = (rule, ctx) => {
  const found: Candidate[] = [];
  for (const [managerId, days] of ctx.days)
    for (const window of windowsOf(rule.period, ctx.calendar)) {
      let numerator = 0;
      let denominator = 0;
      for (const d of days) {
        if (d.date < window.start || d.date > window.end) continue;
        numerator += valueOf(d, rule.numerator);
        for (const metric of rule.denominator) denominator += valueOf(d, metric);
        if (
          denominator >= rule.minDenominator - EPS &&
          numerator >= rule.minRatio * denominator - EPS
        ) {
          found.push({ managerId, date: d.date });
          break;
        }
      }
    }
  return found;
};
