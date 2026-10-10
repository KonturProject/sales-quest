import type { ImportResult } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import type { Preview } from './pipeline.ts';

const move = (before: number | null, after: number) =>
  before === null ? `→ ${after}` : before === after ? `${after}` : `${before} → ${after}`;

/** «Было → станет» before a commit (ADM-PREVIEW). */
export function PreviewTable({
  preview,
  summary,
}: {
  preview: Preview;
  summary: ImportResult['summary'];
}) {
  return (
    <div className="space-y-3 text-sm" data-testid="preview-table">
      <p>
        Период {dayMonth(summary.period[0])}–{dayMonth(summary.period[1])}; строк {summary.rows};
        операторов узнано {summary.matched}
        {summary.added > 0 && `, новых ${summary.added}`}
        {summary.ignored > 0 && `, пропущено ${summary.ignored}`}.
      </p>
      {summary.warnings.length > 0 && (
        <ul className="sq-plate sq-plate-alarm space-y-0.5 px-3 py-1.5">
          {summary.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <table className="sq-parchment w-full">
        <thead>
          <tr className="text-left">
            <th>Команда</th>
            <th>Клетка: было → станет</th>
          </tr>
        </thead>
        <tbody>
          {preview.teams.map((t) => (
            <tr key={t.teamId}>
              <td>{t.leaderName}</td>
              <td className={t.after !== t.before ? 'font-bold' : ''}>{move(t.before, t.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="sq-parchment w-full">
        <thead>
          <tr className="text-left">
            <th>Топ-10</th>
            <th>Место: было → станет</th>
          </tr>
        </thead>
        <tbody>
          {preview.top.map((m) => (
            <tr key={m.managerId}>
              <td>{m.name}</td>
              <td>{move(m.before, m.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
