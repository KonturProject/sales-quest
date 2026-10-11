import { useState } from 'react';
import { localTimestamp } from '../data/time.ts';
import { ConflictError } from './github.ts';
import { commitChange, loadRepoState, type RepoState } from './pipeline.ts';
import { PreviewMoves } from './PreviewTable.tsx';
import type { RosterEdit } from './roster.ts';
import { withoutEdit, type RosterStep } from './rosterStep.ts';
import { adminMessage, type Session } from './session.ts';

/**
 * «Несохранённые изменения» (plan 2b-1): the batch line by line, the preview «было → станет», one
 * commit on the read the preview was made of. After «данные изменились» the season is read again and the
 * same batch applies to it — lines that no longer fit turn red (ADM-2).
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
  // The batch the preview was shown for: any change of it hides the preview.
  const [shown, setShown] = useState<RosterEdit[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (edits.length === 0) return null;

  const problems = new Map(step.result.problems.map((p) => [p.index, p.message]));
  const whole = step.result.problems.filter((p) => p.index < 0);
  const previewShown = shown === edits;

  const save = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await commitChange(session.repo, step.state, step.input, {
        phrase: session.phrase,
        keys: session.keys,
        message: step.message,
        by: session.login,
        now: localTimestamp(new Date()),
      });
      if (result === 'unchanged') setNote('Нечего записывать: эти данные уже есть в игре');
      else {
        onEdits([]);
        onCommitted(result.rev);
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        try {
          onState(await loadRepoState(session.repo, session.phrase, session.keys));
          setShown(null);
          setNote(e.message);
        } catch (again) {
          setError(adminMessage(again));
        }
      } else setError(adminMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sq-panel space-y-2 px-4 py-3" data-testid="roster-draft">
      <div className="sq-title sq-caps">Несохранённые изменения ({edits.length})</div>
      <ul className="space-y-1 text-sm" aria-label="Изменения">
        {step.result.lines.map((line, i) => (
          <li key={`${String(i)}-${line}`} className="flex flex-wrap items-center gap-2">
            <span className={problems.has(i) ? 'sq-pace-down' : ''}>{line}</span>
            <button
              className="sq-button"
              aria-label={`Убрать: ${line}`}
              disabled={busy}
              onClick={() => onEdits(withoutEdit(edits, i))}
            >
              ×
            </button>
            {problems.has(i) && (
              <span role="alert" className="sq-pace-down w-full pl-3 text-xs">
                {problems.get(i)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {whole.map((p) => (
        <p key={p.message} role="alert" className="sq-pace-down text-sm">
          {p.message}
        </p>
      ))}
      {step.result.warnings.length > 0 && (
        <ul className="sq-plate space-y-0.5 px-3 py-1.5 text-sm" aria-label="Предупреждения">
          {step.result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {note && (
        <p role="status" className="sq-plate sq-plate-alarm px-3 py-1.5">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="sq-pace-down text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="sq-button"
          disabled={busy}
          onClick={() => {
            setShown(edits);
            setNote(null);
          }}
        >
          Показать превью
        </button>
        {previewShown && (
          <button
            className="sq-button"
            data-testid="roster-commit"
            disabled={busy || problems.size > 0 || whole.length > 0}
            onClick={() => void save()}
          >
            {busy ? 'Записываю…' : 'Записать'}
          </button>
        )}
      </div>
      {previewShown && (
        <div className="space-y-3 text-sm" data-testid="roster-preview">
          {problems.size > 0 && (
            <p className="sq-pace-down">Уберите красные строки — с ними запись невозможна.</p>
          )}
          <table className="sq-parchment w-full">
            <thead>
              <tr className="text-left">
                <th>Команда</th>
                <th>Людей сейчас: было → станет</th>
              </tr>
            </thead>
            <tbody>
              {step.people.map((p) => (
                <tr key={p.teamId}>
                  <td>{p.label}</td>
                  <td className={p.before !== p.after ? 'font-bold' : ''}>
                    {p.before === p.after ? p.after : `${p.before} → ${p.after}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PreviewMoves preview={step.preview} />
          <p className="sq-dim">Подпись в истории: {step.message}</p>
        </div>
      )}
    </section>
  );
}
