import type { LeaderboardRow } from '../../leaderboard.ts';
import { EPS } from '../context.ts';
import type { Candidate, RuleHandler } from '../types.ts';

/**
 * Top places of a finished week or game, with points above zero (D-29); `everyWeek` — in the top
 * in every week of the game, dated the end of the last week (D-15).
 */
export const rank: RuleHandler<'rank'> = (rule, ctx) => {
  const { calendar } = ctx;
  const top = (rows: LeaderboardRow[]) =>
    rows
      .filter((r) => r.rank !== null && r.rank <= rule.top && r.points > EPS)
      .map((r) => r.managerId);

  if (rule.everyWeek) {
    const last = calendar.weeks[calendar.weeks.length - 1];
    const boards = calendar.weeks.map((w) => ctx.board(w.index));
    if (!last || boards.some((b) => b === null)) return [];
    const [firstWeek, ...rest] = boards.map((b) => new Set(top(b ?? [])));
    return [...(firstWeek ?? [])]
      .filter((id) => rest.every((week) => week.has(id)))
      .map((managerId) => ({ managerId, date: last.end }));
  }

  const periods: [number | 'season', string][] =
    rule.period === 'season'
      ? [['season', calendar.end]]
      : calendar.weeks.map((w) => [w.index, w.end]);
  const found: Candidate[] = [];
  for (const [period, end] of periods) {
    const board = ctx.board(period);
    if (board) for (const managerId of top(board)) found.push({ managerId, date: end });
  }
  return found;
};
