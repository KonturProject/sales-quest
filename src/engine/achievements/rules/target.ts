import { workingDaysInGame } from '../../roster.ts';
import { weightsOf } from '../../scoring.ts';
import { dailyTargetPoints } from '../../targets.ts';
import { dayReaching } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

/**
 * The manager's plan for the whole game — daily norms (or the default) × their working days in
 * the game — reached in points by the end of a game week or by a date (D-29).
 */
export const target: RuleHandler<'target'> = (rule, ctx) => {
  const { config, calendar } = ctx;
  const deadline =
    rule.before === 'week_end' ? calendar.weeks[(rule.week ?? 0) - 1]?.end : rule.date;
  if (deadline === undefined) return [];
  const weights = weightsOf(config);
  const window = { start: calendar.start, end: deadline };
  const found: Candidate[] = [];
  for (const m of config.managers) {
    const plan =
      dailyTargetPoints(m, weights, config.defaultDailyTargetPoints) *
      workingDaysInGame(m, calendar).length;
    if (plan <= 0) continue;
    const date = dayReaching(ctx.days.get(m.id) ?? [], window, (d) => d.points, plan);
    if (date) found.push({ managerId: m.id, date });
  }
  return found;
};
