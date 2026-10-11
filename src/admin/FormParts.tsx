import type { FormEvent, ReactNode } from 'react';
import type { Team } from '../data/schemas/season.ts';

/**
 * The parts of the batch screens' forms (plans 2b-1, 2b-2): a form that adds to a batch, a labelled
 * field, the team select. Controls carry their name in `aria-label`, so a label's text never mixes
 * with a select's options.
 */

export function Form({
  title,
  children,
  onSubmit,
  onCancel,
  submit = 'В изменения',
  submitDisabled = false,
  named = false,
}: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  /** Without it, no «Отмена»: a form that stays open. */
  onCancel?: () => void;
  submit?: string;
  submitDisabled?: boolean;
  /** The title as the form's name: a landmark of its own, for a screen with several forms open. */
  named?: boolean;
}) {
  const send = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form
      className="sq-parchment w-full space-y-2 px-3 py-2 text-sm"
      onSubmit={send}
      {...(named ? { 'aria-label': title } : {})}
    >
      <div className="sq-caps">{title}</div>
      {children}
      <div className="flex gap-2">
        <button className="sq-button" type="submit" disabled={submitDisabled}>
          {submit}
        </button>
        {onCancel && (
          <button className="sq-button" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="min-w-36">{label}</span>
      {children}
    </label>
  );
}

export function TeamSelect({
  teams,
  value,
  onChange,
}: {
  teams: Team[];
  value: string;
  onChange: (teamId: string) => void;
}) {
  return (
    <select
      className="sq-input w-auto"
      aria-label="Команда"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.sourceCode ? `${t.sourceCode} • ${t.leaderName}` : t.leaderName}
        </option>
      ))}
    </select>
  );
}
