import { Fragment, useState, type ReactNode } from 'react';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { dayMonth } from '../import/grid.ts';
import type { MetricChange, OperatorChange } from './importDiff.ts';
import { teamLabel } from './roster.ts';

/**
 * The table «Что меняет файл» (2b-3): per operator, every metric «было → по выгрузке», «с правкой» when the
 * author's corrections count there, «по дням» on demand. The import preview adds its actions and rows (the fix,
 * the double-count hint); the journal shows it as it was.
 */
export function ChangesTable({
  changes,
  config,
  actions,
  below,
}: {
  changes: OperatorChange[];
  config: SeasonConfig;
  /** More buttons in a row's last cell, after «по дням». */
  actions?: (row: OperatorChange) => ReactNode;
  /** Rows after a row and its days; `span` — the table's width in cells. */
  below?: (row: OperatorChange, span: number) => ReactNode;
}) {
  const [byDay, setByDay] = useState<Set<string>>(new Set());
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const teams = new Map(config.teams.map((t) => [t.id, t]));
  const span = metrics.length + 2;
  const toggleDays = (id: string) => {
    const next = new Set(byDay);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setByDay(next);
  };
  return (
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
        {changes.map((row) => {
          const team = teams.get(row.teamId);
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
                  {actions?.(row)}
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
              {below?.(row, span)}
            </Fragment>
          );
        })}
      </tbody>
    </table>
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
