import { useState, type ReactNode } from 'react';
import { localTimestamp } from '../data/time.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { ConflictError } from './github.ts';
import { commitChange, loadRepoState, type Preview, type RepoState } from './pipeline.ts';
import { PreviewMoves } from './PreviewTable.tsx';
import { adminMessage, type Session } from './session.ts';

/** What a batch screen gives its draft: the batch applied to the read it was made of. */
export type BatchView = {
  /** The read the batch was applied to: the base of the commit (ADM-2). */
  state: RepoState;
  /** The season after the batch: what «Записать» writes. */
  input: EngineInput;
  lines: string[];
  /** Lines that do not apply, by their index; −1 — the batch as a whole. */
  problems: { index: number; message: string }[];
  warnings: string[];
  preview: Preview;
  /** The public message: counts only (D-51). */
  message: string;
};

/**
 * The unsaved batch of a screen (plans 2b-1, 2b-2): line by line with «×», the preview «было →
 * станет», one commit on the read the preview was made of. After «данные изменились» the season is read
 * again and the screen applies the same batch to it — lines that no longer fit turn red (ADM-2).
 */
export function BatchDraft({
  session,
  name,
  title,
  batch,
  view,
  extra,
  onRemove,
  onWritten,
  onState,
  onCommitted,
  busy,
  setBusy,
}: {
  session: Session;
  /** The test ids: `<name>-draft`, `<name>-preview`, `<name>-commit`. */
  name: string;
  title: string;
  /** The batch itself: a new one hides the preview made for the old one. */
  batch: readonly unknown[];
  view: BatchView;
  /** More of the preview, before the teams' cells and the top 10. */
  extra?: ReactNode;
  onRemove: (index: number) => void;
  /** The batch is written: empty it. */
  onWritten: () => void;
  onState: (state: RepoState) => void;
  onCommitted: (rev: string) => void;
  /** A commit runs: the whole screen waits for it (review 2b-1). */
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  // The batch the preview was shown for: any change of it hides the preview.
  const [shown, setShown] = useState<readonly unknown[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (batch.length === 0) return null;

  const problems = new Map(view.problems.map((p) => [p.index, p.message]));
  const whole = view.problems.filter((p) => p.index < 0);
  const previewShown = shown === batch;

  const save = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await commitChange(session.repo, view.state, view.input, {
        phrase: session.phrase,
        keys: session.keys,
        message: view.message,
        by: session.login,
        now: localTimestamp(new Date()),
      });
      if (result === 'unchanged') setNote('Нечего записывать: эти данные уже есть в игре');
      else {
        onWritten();
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
    <section className="sq-panel space-y-2 px-4 py-3" data-testid={`${name}-draft`}>
      <div className="sq-title sq-caps">
        {title} ({batch.length})
      </div>
      <ul className="space-y-1 text-sm" aria-label="Изменения">
        {view.lines.map((line, i) => (
          <li key={`${String(i)}-${line}`} className="flex flex-wrap items-center gap-2">
            <span className={problems.has(i) ? 'sq-pace-down' : ''}>{line}</span>
            <button
              className="sq-button"
              aria-label={`Убрать: ${line}`}
              disabled={busy}
              onClick={() => onRemove(i)}
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
      {view.warnings.length > 0 && (
        <ul className="sq-plate space-y-0.5 px-3 py-1.5 text-sm" aria-label="Предупреждения">
          {view.warnings.map((w) => (
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
            setShown(batch);
            setNote(null);
          }}
        >
          Показать превью
        </button>
        {previewShown && (
          <button
            className="sq-button"
            data-testid={`${name}-commit`}
            disabled={busy || problems.size > 0 || whole.length > 0}
            onClick={() => void save()}
          >
            {busy ? 'Записываю…' : 'Записать'}
          </button>
        )}
      </div>
      {previewShown && (
        <div className="space-y-3 text-sm" data-testid={`${name}-preview`}>
          {problems.size > 0 && (
            <p className="sq-pace-down">Уберите красные строки — с ними запись невозможна.</p>
          )}
          {extra}
          <PreviewMoves preview={view.preview} />
          <p className="sq-dim">Подпись в истории: {view.message}</p>
        </div>
      )}
    </section>
  );
}
