import type { AutoRule, Candidate, RuleContext } from '../types.ts';
import { first } from './first.ts';
import { growth } from './growth.ts';
import { rank } from './rank.ts';
import { ratio } from './ratio.ts';
import { streak } from './streak.ts';
import { target } from './target.ts';
import { teamAllMembers } from './teamAllMembers.ts';
import { teamPace } from './teamPace.ts';
import { teamPosition } from './teamPosition.ts';
import { threshold } from './threshold.ts';

/** One handler per rule type (§6.1): a new type of rule is a new handler here. */
export function runRule(rule: AutoRule, ctx: RuleContext): Candidate[] {
  switch (rule.type) {
    case 'threshold':
      return threshold(rule, ctx);
    case 'streak':
      return streak(rule, ctx);
    case 'ratio':
      return ratio(rule, ctx);
    case 'rank':
      return rank(rule, ctx);
    case 'first':
      return first(rule, ctx);
    case 'growth':
      return growth(rule, ctx);
    case 'target':
      return target(rule, ctx);
    case 'team_position':
      return teamPosition(rule, ctx);
    case 'team_pace':
      return teamPace(rule, ctx);
    case 'team_all_members':
      return teamAllMembers(rule, ctx);
  }
}

/** Rules that need day-by-day data and cannot run on running totals alone (ACH-4). */
export function dailyMetricOf(rule: AutoRule): string | undefined {
  if (rule.type === 'streak' || rule.type === 'first') return rule.metric;
  if (rule.type === 'threshold' && rule.period === 'day') return rule.metric;
  return undefined;
}
