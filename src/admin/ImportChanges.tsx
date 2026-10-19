import { Fragment, useState } from 'react';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { dayMonth } from '../import/grid.ts';
import { metricText, parseCount, type Correction } from './corrections.ts';
import { Field, Form } from './FormParts.tsx';
import type { ImportStep } from './importStep.ts';
import type { MetricChange, OperatorChange } from './importDiff.ts';
import { teamLabel } from './roster.ts';

/**
 * «Что меняет файл» (2b-3): per operator, every metric «было → по выгрузке», «с правкой» when the author's
 * corrections count there; «Поправить» adds a «показатели за день» correction to this same commit (not for an
 * intraday file); a hint where the file brings what was added by hand, with a tick to cancel it here.
 */
export function ImportChanges({
  step,
  config,
  days,
  canFix,
  fixes,
  cancels,
  onFixes,
  onCancels,
}: {
  step: ImportStep;
  config: SeasonConfig;
  /** The file's days: a fix is for one of them. */
  days: string[];
  /** False for an intraday file: the next funnel rewrites its day. */
  canFix: boolean;
  fixes: Correction[];
  cancels: string[];
  onFixes: (next: Correction[]) => void;
  onCancels: (next: string[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [byDay, setByDay] = useState<Set<string>>(new Set());
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const teams = new Map(config.teams.map((t) => [t.id, t]));
  const span = metrics.length + 2;
  const reasonOf = new Map(step.state.input.adjustments.map((a) => [a.id, a.reason]));
  const toggleDays = (id: string) => {
    const next = new Set(byDay);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setByDay(next);
  };

  return (
    <div className="space-y-2 text-sm" data-testid="import-changes">
      <h3 className="sq-caps sq-muted">Что меняет файл</h3>
      {step.changes.length === 0 ? (
        <p className="sq-dim">Файл ничего не меняет в показателях операторов.</p>
      ) : (
        <table aria-label="Что меняет файл" className="sq-parchment w-full">
          <thead>
            <tr className="text-left">
              <th>Оператор</th>
              {metrics.map((m) => (
                <th key={m.id}>{m.title}</th>
              ))}
              <th className="sr-only">Действия</th>
            </tr>
          </thead>
          <tbody>
            {step.changes.map((row) => {
              const team = teams.get(row.teamId);
              const hints = step.doubles.filter((d) => d.managerId === row.managerId);
              return (
                <Fragment key={row.managerId}>
                  <tr>
                    <td>
                      <div className="font-bold">{row.name}</div>
                      <div className="text-xs">{team ? teamLabel(team) : row.teamId}</div>
                    </td>
                    {row.metrics.map((m) => (
                      <td key={m.metricId}>
                        <Change change={m} />
                      </td>
                    ))}
                    <td className="text-right whitespace-nowrap">
                      {row.days.length > 1 && (
                        <button
                          className="sq-button"
                          aria-expanded={byDay.has(row.managerId)}
                          onClick={() => toggleDays(row.managerId)}
                        >
                          по дням
                        </button>
                      )}
                      {canFix && (
                        <button
                          className="sq-button"
                          aria-label={`Поправить: ${row.name}`}
                          onClick={() => setOpen(open === row.managerId ? null : row.managerId)}
                        >
                          Поправить
                        </button>
                      )}
                    </td>
                  </tr>
                  {byDay.has(row.managerId) &&
                    row.days.map((d) => (
                      <tr key={d.date} className="text-xs">
                        <td className="pl-4">{dayMonth(d.date)}</td>
                        {d.metrics.map((m) => (
                          <td key={m.metricId}>
                            <Change change={m} />
                          </td>
                        ))}
                        <td />
                      </tr>
                    ))}
                  {hints.flatMap((h) =>
                    h.adjustmentIds.map((id) => (
                      <tr key={id}>
                        <td colSpan={span}>
                          <div className="sq-plate sq-plate-alarm space-y-1 px-2 py-1">
                            <p>
                              Похоже, это уже было добавлено вручную: «{reasonOf.get(id) ?? id}» (
                              {dayMonth(h.date)}) — а выгрузка прибавила за этот день +{h.raised}.
                            </p>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={cancels.includes(id)}
                                onChange={(e) =>
                                  onCancels(
                                    e.target.checked
                                      ? [...cancels, id]
                                      : cancels.filter((c) => c !== id),
                                  )
                                }
                              />
                              Отменить эту корректировку в этой записи
                            </label>
                          </div>
                        </td>
                      </tr>
                    )),
                  )}
                  {open === row.managerId && (
                    <tr>
                      <td colSpan={span}>
                        <FixForm
                          row={row}
                          config={config}
                          days={days}
                          onAdd={(fix) => {
                            onFixes([...fixes, fix]);
                            setOpen(null);
                          }}
                          onCancel={() => setOpen(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {cancels.length > 0 && (
        // Every cancel of this commit, whether its hint is still there or not: nothing is cancelled unseen, and
        // a cancel that no longer applies (after a fresh read) can be taken out (review 2b-3).
        <div className="space-y-1">
          <h3 className="sq-caps sq-muted">Отменяются в этой записи</h3>
          <ul aria-label="Отменяются в этой записи" className="sq-parchment space-y-1">
            {cancels.map((id) => {
              const problem = step.problems.find((p) => p.cancel === id);
              const found = step.state.input.adjustments.find((a) => a.id === id);
              const day =
                found && 'date' in found && found.date ? ` (${dayMonth(found.date)})` : '';
              return (
                <li key={id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    {found ? `«${found.reason}»${day}` : `корректировка ${id}`}
                  </span>
                  {problem && (
                    <span role="alert" className="sq-pace-down">
                      {problem.message}
                    </span>
                  )}
                  <button
                    className="sq-button"
                    onClick={() => onCancels(cancels.filter((c) => c !== id))}
                  >
                    Убрать
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {fixes.length > 0 && (
        <div className="space-y-1">
          <h3 className="sq-caps sq-muted">Правки в этой записи</h3>
          <ul aria-label="Правки в этой записи" className="sq-parchment space-y-1">
            {fixes.map((fix, index) => {
              const problem = step.problems.find((p) => p.index === index);
              return (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">{lineOf(config, fix)}</span>
                  {problem && (
                    <span role="alert" className="sq-pace-down">
                      {problem.message}
                    </span>
                  )}
                  <button
                    className="sq-button"
                    onClick={() => onFixes(fixes.filter((_, i) => i !== index))}
                  >
                    Убрать
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** «3 → 4», «3 → 4 (с правкой 5)»; an unchanged metric without corrections — dimmed. */
function Change({ change }: { change: MetricChange }) {
  const { before, file, manual } = change;
  if (before === file && manual === 0) return <span className="opacity-50">{file}</span>;
  return (
    <span className={before !== file ? 'font-bold' : ''}>
      {before === file ? file : `${String(before)} → ${String(file)}`}
      {manual !== 0 && ` (с правкой ${String(file + manual)})`}
    </span>
  );
}

/** A fix in words for the list: who, which day, what — the same words as «Корректировки». */
function lineOf(config: SeasonConfig, fix: Correction): string {
  if (fix.kind !== 'metric') return fix.reason;
  const who = config.managers.find((m) => m.id === fix.managerId)?.fullName ?? fix.managerId;
  const metric = config.metrics.find((m) => m.id === fix.metricId);
  const what =
    metric && Number.isFinite(fix.count) && fix.count !== 0
      ? metricText(metric, fix.count)
      : fix.metricId;
  return `${who}, ${dayMonth(fix.date)} — ${what} (${fix.reason.trim()})`;
}

/** The «Показатели» fields for one operator of the table; the day among the file's, the last by default. */
function FixForm({
  row,
  config,
  days,
  onAdd,
  onCancel,
}: {
  row: OperatorChange;
  config: SeasonConfig;
  days: string[];
  onAdd: (fix: Correction) => void;
  onCancel: () => void;
}) {
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? '');
  const [count, setCount] = useState('');
  const [date, setDate] = useState(days.at(-1) ?? '');
  const [reason, setReason] = useState('');
  const metric = metrics.find((m) => m.id === metricId);
  const n = parseCount(count);
  return (
    <Form
      title="Правка в этой записи"
      named
      submit="Добавить"
      onCancel={onCancel}
      onSubmit={() =>
        onAdd({
          kind: 'metric',
          managerId: row.managerId,
          name: row.name,
          date,
          metricId,
          count: n,
          reason,
        })
      }
    >
      <p className="font-bold">{row.name}</p>
      <Field label="Показатель">
        <select
          className="sq-input w-auto"
          aria-label="Показатель"
          value={metricId}
          onChange={(e) => setMetricId(e.target.value)}
        >
          {metrics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Сколько (+ или −)">
        <input
          className="sq-input w-20"
          inputMode="numeric"
          aria-label="Сколько"
          required
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </Field>
      <Field label="День">
        <select
          className="sq-input w-auto"
          aria-label="День"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {dayMonth(d)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Причина">
        <input
          className="sq-input flex-1"
          aria-label="Причина"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <p className="italic">
        {count.trim() === ''
          ? 'Например, +1 или −1'
          : Number.isInteger(n) && n !== 0 && metric
            ? metricText(metric, n)
            : 'сколько — целое число, не 0'}
      </p>
    </Form>
  );
}
