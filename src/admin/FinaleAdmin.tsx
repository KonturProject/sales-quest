import { useState } from 'react';
import { localTimestamp } from '../data/time.ts';
import { computeGameState } from '../engine/gameState.ts';
import { podiumOf, topOperators } from '../finale/results.ts';
import { dayMonth } from '../import/grid.ts';
import { BatchDraft } from './BatchDraft.tsx';
import { closeGame, finaleMessage, reopenGame } from './finale.ts';
import { previewChange, type RepoState } from './pipeline.ts';
import type { Session } from './session.ts';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * «Подвести итоги» / «Вернуть игру» (D-59): one line, the podium and the top 3 for a check, one commit of the
 * config (`BatchDraft`). After it every screen plays the finale — or goes back to the map — at its next check.
 */
export function FinaleAdmin({
  session,
  closing: asked,
  onState,
  onCancel,
  onCommitted,
}: {
  session: Session;
  /** True — close the game; false — undo a closing. */
  closing: boolean;
  onState: (state: RepoState) => void;
  onCancel: () => void;
  onCommitted: (rev: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // The action is the one the screen was opened for: a fresh read after a conflict must not turn «Подвести
  // итоги» into «Вернуть игру» — it is refused instead (review D-59).
  const [closing] = useState(asked);
  // The moment of the closing is the moment the screen was opened; the batch is one stable line.
  const [now] = useState(() => localTimestamp(new Date()));
  const before = session.state.input;
  const { config } = before;
  const period = `${dayMonth(config.period.start)}–${dayMonth(config.period.end)}`;
  const [batch] = useState(() => [
    closing ? `Подвести итоги игры ${period}` : `Вернуть игру ${period}`,
  ]);
  const after = closing ? closeGame(before, now) : reopenGame(before);
  const wrong =
    closing && config.status !== 'active'
      ? 'итоги уже подведены'
      : !closing && config.status !== 'closed'
        ? 'игра и так идёт'
        : null;
  const game = computeGameState(after, now);
  const podium = podiumOf(game, after.config);
  const top = topOperators(game, after.config);

  return (
    <div className="space-y-3" data-testid="finale">
      <section className="sq-panel space-y-2 px-4 py-3">
        <div className="sq-title sq-caps">{closing ? 'Итоги игры' : 'Вернуть игру'}</div>
        <p className="sq-dim text-sm">
          {closing
            ? 'Проверьте пьедестал и лучших. После «Записать» все экраны покажут финал при следующей проверке данных; загрузки и корректировки останутся доступны.'
            : 'Финал уйдёт с экранов: вернутся карта, рейтинг и карточки команд.'}
        </p>
      </section>
      <BatchDraft
        session={session}
        name="finale"
        title={closing ? 'Итоги' : 'Возврат игры'}
        batch={batch}
        view={{
          state: session.state,
          input: after,
          lines: batch,
          problems: wrong ? [{ index: -1, message: wrong }] : [],
          warnings: [],
          preview: previewChange(before, after, now),
          message: finaleMessage(config, closing),
        }}
        extra={
          closing ? (
            <div className="space-y-2">
              <h3 className="sq-caps sq-muted">Пьедестал</h3>
              <ol className="sq-parchment">
                {podium.map((p) => (
                  <li key={p.teamId}>
                    {p.place} место — {p.title}: клетка {p.position} ·{' '}
                    {Math.round(p.progress * 100)} % плана
                  </li>
                ))}
              </ol>
              <h3 className="sq-caps sq-muted">Лучшие из лучших</h3>
              <ol className="sq-parchment">
                {top.map((t) => (
                  <li key={t.managerId}>
                    {t.rank}. {t.name} — {fmt(t.points)}
                  </li>
                ))}
              </ol>
            </div>
          ) : undefined
        }
        onRemove={onCancel}
        onWritten={() => undefined}
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
