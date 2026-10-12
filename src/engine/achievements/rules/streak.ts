import { isOnVacation } from '../../roster.ts';
import { EPS, valueOf } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

/**
 * `days` working days in a row with at least `minPerDay`; days off and the operator's vacation days
 * neither break nor extend it (D-29, D-54).
 */
export const streak: RuleHandler<'streak'> = (rule, ctx) => {
  const found: Candidate[] = [];
  const workingDays = ctx.calendar.workingDays.filter((d) => d <= ctx.today);
  const managers = new Map(ctx.config.managers.map((m) => [m.id, m]));
  for (const [managerId, days] of ctx.days) {
    const manager = managers.get(managerId);
    const byDate = new Map(days.map((d) => [d.date, d]));
    let run = 0;
    for (const date of workingDays) {
      // A day of the operator's vacation is a day off for them: it neither breaks nor extends (D-54).
      if (manager && isOnVacation(manager, date)) continue;
      const day = byDate.get(date);
      run = day && valueOf(day, rule.metric) >= rule.minPerDay - EPS ? run + 1 : 0;
      if (run === rule.days) {
        found.push({ managerId, date });
        run = 0; // a second full run counts again for repeatable achievements
      }
    }
  }
  return found;
};
