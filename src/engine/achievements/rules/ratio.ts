import { EPS, sumIn, valueOf, windowsOf } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

/**
 * numerator / Σ denominators ≥ minRatio over a finished week or game, with a denominator of at
 * least minDenominator; dated the window's last day. A ratio can fall as data comes in, so it is
 * judged on the totals, not at the first good moment (D-29).
 */
export const ratio: RuleHandler<'ratio'> = (rule, ctx) => {
  const found: Candidate[] = [];
  const finished = windowsOf(rule.period, ctx.calendar).filter((w) => ctx.today > w.end);
  for (const [managerId, days] of ctx.days)
    for (const window of finished) {
      const numerator = sumIn(days, window, (d) => valueOf(d, rule.numerator));
      let denominator = 0;
      for (const metric of rule.denominator)
        denominator += sumIn(days, window, (d) => valueOf(d, metric));
      if (
        denominator >= rule.minDenominator - EPS &&
        numerator >= rule.minRatio * denominator - EPS
      )
        found.push({ managerId, date: window.end });
    }
  return found;
};
