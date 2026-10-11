import type { SeasonConfig } from '../data/schemas/season.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { membersOn } from '../engine/roster.ts';
import { previewChange, type Preview, type RepoState } from './pipeline.ts';
import {
  applyRosterEdits,
  rosterCommitMessage,
  teamLabel,
  type RosterEdit,
  type RosterResult,
} from './roster.ts';

/**
 * A roster batch as the screen runs it (plan 2b-1), pure: the batch applied to the season read from
 * GitHub, the preview «было → станет», the people of each team on a day of the game and the public
 * message. «Записать» commits on `state` — the read the preview was made of (ADM-2).
 */

export type PeopleRow = { teamId: string; label: string; before: number; after: number };

export type RosterStep = {
  state: RepoState;
  result: RosterResult;
  input: EngineInput;
  preview: Preview;
  people: PeopleRow[];
  message: string;
};

/** The admin's day as a day of the game: before the start — the start; after the end — the end. */
export function gameDay(config: SeasonConfig, today: string): string {
  const { start, end } = config.period;
  return today < start ? start : today > end ? end : today;
}

export function prepareRoster(
  state: RepoState,
  edits: RosterEdit[],
  opts: { today: string; now: string },
): RosterStep {
  const result = applyRosterEdits(state.input.config, edits);
  const input = { ...state.input, config: result.config };
  const day = gameDay(result.config, opts.today);
  const people = [...result.config.teams]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      teamId: t.id,
      label: teamLabel(t),
      before: membersOn(state.input.config.managers, t.id, day).length,
      after: membersOn(result.config.managers, t.id, day).length,
    }));
  const applied = edits.filter((_, i) => !result.problems.some((p) => p.index === i));
  return {
    state,
    result,
    input,
    preview: previewChange(state.input, input, opts.now),
    people,
    message: rosterCommitMessage(applied),
  };
}

/** The batch with one more edit: a new order of the teams replaces the previous one. */
export function withEdit(edits: RosterEdit[], edit: RosterEdit): RosterEdit[] {
  return edit.kind === 'order'
    ? [...edits.filter((e) => e.kind !== 'order'), edit]
    : [...edits, edit];
}

/**
 * The batch without one edit. A removed «Новый» takes the edits of that person with it: they name it
 * by its ref and would otherwise apply to nobody — or, were ids reused, to someone else.
 */
export function withoutEdit(edits: RosterEdit[], index: number): RosterEdit[] {
  const gone = edits[index];
  const ref = gone?.kind === 'add' ? gone.ref : null;
  return edits.filter(
    (e, i) => i !== index && !(ref !== null && 'managerId' in e && e.managerId === ref),
  );
}
