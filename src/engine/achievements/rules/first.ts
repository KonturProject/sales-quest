import { teamOn } from '../../roster.ts';
import { EPS, valueOf, windowsOf } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

type FirstDay = { date: string; entries: { managerId: string; value: number }[] };

/**
 * The first day anyone in the department (or in each team) has the metric. Data is daily, so of
 * that day's managers the one with the larger value wins; equal values — all of them (D-28).
 */
export const first: RuleHandler<'first'> = (rule, ctx) => {
  const managers = new Map(ctx.config.managers.map((m) => [m.id, m]));
  const found: Candidate[] = [];
  for (const window of windowsOf(rule.period, ctx.calendar)) {
    const groups = new Map<string, FirstDay>(); // department ('') or team → its first day
    for (const [managerId, days] of ctx.days) {
      const manager = managers.get(managerId);
      if (!manager) continue;
      for (const d of days) {
        const value = valueOf(d, rule.metric);
        if (d.date < window.start || d.date > window.end || value <= 0) continue;
        if (!ctx.eligible(managerId, d.date)) continue;
        const group = rule.within === 'team' ? teamOn(manager, d.date) : '';
        const best = groups.get(group);
        if (!best || d.date < best.date)
          groups.set(group, { date: d.date, entries: [{ managerId, value }] });
        else if (d.date === best.date) best.entries.push({ managerId, value });
        if (rule.within === 'department') break; // this manager's later days cannot be earlier
      }
    }
    for (const { date, entries } of groups.values()) {
      const max = Math.max(...entries.map((e) => e.value));
      for (const e of entries)
        if (e.value >= max - EPS) found.push({ managerId: e.managerId, date });
    }
  }
  return found;
};
