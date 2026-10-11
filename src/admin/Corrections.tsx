import { useState } from 'react';
import { localDate, localTimestamp } from '../data/time.ts';
import { dayMonth } from '../import/grid.ts';
import { plateName } from '../text.ts';
import { BatchDraft } from './BatchDraft.tsx';
import { MetricForm, ResetForm, StepsForm } from './CorrectionForms.tsx';
import { prepareCorrections, type Correction } from './corrections.ts';
import type { RepoState } from './pipeline.ts';
import type { Session } from './session.ts';

/**
 * «Корректировки» (ADM-STEPS, ADM-RESET-TEAM, plan 2b-2): the teams' cells as they will be after the
 * batch, three forms that add corrections to it, the batch written once (`BatchDraft`). The batch
 * lives in the admin page, so it survives a visit elsewhere.
 */
export function Corrections({
  session,
  corrections,
  onCorrections,
  onState,
  onCancel,
  onCommitted,
}: {
  session: Session;
  corrections: Correction[];
  onCorrections: (corrections: Correction[]) => void;
  onState: (state: RepoState) => void;
  onCancel: () => void;
  onCommitted: (rev: string) => void;
}) {
  // A commit runs: no correction may join the batch being written, nor the screen be left.
  const [busy, setBusy] = useState(false);
  const today = localDate(new Date());
  const step = prepareCorrections(session.state, corrections, {
    now: localTimestamp(new Date()),
    by: session.login,
  });
  const config = session.state.input.config;
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  const add = (c: Correction) => onCorrections([...corrections, c]);
  const cells = new Map(step.preview.teams.map((t) => [t.teamId, t]));

  return (
    <div className="space-y-3" data-testid="corrections">
      <section className="sq-panel space-y-2 px-4 py-3">
        <div className="sq-title sq-caps">Корректировки</div>
        <p className="sq-dim text-sm">
          Клетки команд на {dayMonth(today)} — с учётом несохранённых корректировок. Ничего не
          записывается, пока вы не нажмёте «Записать» внизу.
        </p>
        <table className="sq-parchment w-full text-sm">
          <tbody>
            {teams.map((t) => {
              const c = cells.get(t.id);
              return (
                <tr key={t.id}>
                  <td>{plateName(t.leaderName, t.sourceCode)}</td>
                  <td className={c && c.before !== c.after ? 'font-bold' : ''}>
                    клетка {c ? (c.before === c.after ? c.after : `${c.before} → ${c.after}`) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <fieldset disabled={busy} className="m-0 min-w-0 space-y-3 border-0 p-0">
        <section className="sq-panel px-4 py-3">
          <StepsForm teams={teams} positions={step.positions} max={step.max} onAdd={add} />
        </section>
        <section className="sq-panel px-4 py-3">
          <MetricForm config={config} teams={teams} today={today} onAdd={add} />
        </section>
        <details className="sq-panel px-4 py-3">
          <summary className="cursor-pointer text-sm">Редкое</summary>
          <ResetForm teams={teams} positions={step.positions} onAdd={add} />
        </details>
      </fieldset>

      <BatchDraft
        session={session}
        name="corrections"
        title="Несохранённые корректировки"
        batch={corrections}
        view={{
          state: step.state,
          input: step.result.input,
          lines: step.result.lines,
          problems: step.result.problems,
          warnings: step.result.warnings,
          preview: step.preview,
          message: step.message,
        }}
        onRemove={(i) => onCorrections(corrections.filter((_, j) => j !== i))}
        onWritten={() => onCorrections([])}
        onState={onState}
        onCommitted={onCommitted}
        busy={busy}
        setBusy={setBusy}
      />
      <button className="sq-button" disabled={busy} onClick={onCancel}>
        Назад
      </button>
    </div>
  );
}
