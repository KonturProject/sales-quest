import { BatchDraft } from './BatchDraft.tsx';
import type { RepoState } from './pipeline.ts';
import type { RosterEdit } from './roster.ts';
import { withoutEdit, type PeopleRow, type RosterStep } from './rosterStep.ts';
import type { Session } from './session.ts';

/** People per team «было → станет»: what a roster batch changes beyond the cells. */
function PeopleTable({ people }: { people: PeopleRow[] }) {
  return (
    <table className="sq-parchment w-full">
      <thead>
        <tr className="text-left">
          <th>Команда</th>
          <th>Людей сейчас: было → станет</th>
        </tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.teamId}>
            <td>{p.label}</td>
            <td className={p.before !== p.after ? 'font-bold' : ''}>
              {p.before === p.after ? p.after : `${p.before} → ${p.after}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Несохранённые изменения» of the roster (plan 2b-1): the shared batch draft (`BatchDraft`) with the
 * people per team in the preview.
 */
export function RosterDraft({
  session,
  step,
  edits,
  onEdits,
  onState,
  onCommitted,
  busy,
  setBusy,
}: {
  session: Session;
  step: RosterStep;
  edits: RosterEdit[];
  onEdits: (edits: RosterEdit[]) => void;
  onState: (state: RepoState) => void;
  onCommitted: (rev: string) => void;
  /** A commit runs: the whole roster screen waits for it (review 2b-1). */
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  return (
    <BatchDraft
      session={session}
      name="roster"
      title="Несохранённые изменения"
      batch={edits}
      view={{
        state: step.state,
        input: step.input,
        lines: step.result.lines,
        problems: step.result.problems,
        warnings: step.result.warnings,
        preview: step.preview,
        message: step.message,
      }}
      extra={<PeopleTable people={step.people} />}
      onRemove={(i) => onEdits(withoutEdit(edits, i))}
      onWritten={() => onEdits([])}
      onState={onState}
      onCommitted={onCommitted}
      busy={busy}
      setBusy={setBusy}
    />
  );
}
