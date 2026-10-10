import { useEffect } from 'react';
import { formatHash } from '../app/router.ts';
import { useHashRoute } from '../app/useHashRoute.ts';
import { useStore } from '../app/store.ts';
import { getViewer, isDate } from '../app/viewer.ts';
import { QualitySection } from './QualitySection.tsx';

/** `14.10 09:00` from a local timestamp (D-11). */
const short = (ts: string | null) =>
  ts ? `${ts.slice(8, 10)}.${ts.slice(5, 7)} ${ts.slice(11, 16)}` : '—';
const ms = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)} мс`;

/**
 * `#/debug` — what the viewer loaded and computed, as plain tables (stage 1 acceptance). A lazy
 * chunk: viewers of the map never download it. `?date=YYYY-MM-DD` shows the game on that day.
 */
export default function DebugPage() {
  const viewer = getViewer();
  const state = useStore(viewer.store, (s) => s);
  const route = useHashRoute();
  const date = isDate(route.query.date) ? route.query.date : null;

  useEffect(() => {
    viewer.setDate(date);
    return () => viewer.setDate(null);
  }, [date, viewer]);

  const { sync, game } = state;
  if (sync.phase !== 'ready' || !game)
    return (
      <main className="p-4 text-slate-800">
        {state.error ?? (sync.phase === 'error' ? sync.message : 'Загрузка данных…')}
      </main>
    );

  const { loaded } = sync;
  const config = loaded.input.config;
  const leader = new Map(config.teams.map((t) => [t.id, t.leaderName]));
  const person = new Map(config.managers.map((m) => [m.id, m.fullName]));
  const title = new Map(config.achievements.map((a) => [a.id, a.title]));
  const setDate = (value: string) =>
    window.location.replace(
      formatHash({ path: '/debug', query: value ? { ...route.query, date: value } : {} }),
    );

  return (
    <main className="h-full overflow-auto bg-white p-4 text-sm text-slate-800">
      <h1 className="text-lg font-semibold">
        {config.title} · {config.period.start} … {config.period.end}
      </h1>
      <p>
        Данные: rev {loaded.version.rev.slice(0, 8)}, обновлены {short(loaded.version.updatedAt)},
        импорт от {short(game.dataAsOf)}, проверено {short(sync.checkedAt)}
        {sync.notice &&
          ` · ${sync.notice.kind === 'offline' ? `нет связи с ${short(sync.notice.since)}` : sync.notice.message}`}
      </p>
      <p>
        Загрузка {ms(loaded.timings.fetchMs)}, расшифровка {ms(loaded.timings.decryptMs)}, расчёт{' '}
        {ms(state.computeMs)}
      </p>
      <p className="my-2 flex items-center gap-2">
        <label>
          На дату{' '}
          <input
            aria-label="На дату"
            type="date"
            className="rounded border px-1"
            value={date ?? game.today}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <span data-testid="game-day">день игры: {game.today}</span>
        <button className="rounded border px-2" onClick={() => setDate('')}>
          Сегодня
        </button>
        <button className="rounded border px-2" onClick={() => viewer.refresh()}>
          Обновить
        </button>
        <button className="rounded border px-2" onClick={() => viewer.forgetPhrase()}>
          Сменить код
        </button>
      </p>

      <QualitySection />

      <h2 className="mt-4 font-semibold">
        Команды (трек {game.track.trackLength} клеток + {game.track.overflowCells} сверх плана)
      </h2>
      <table className="mt-1 border-collapse">
        <thead>
          <tr className="text-left">
            {['Команда', 'Клетка', 'Темп', 'Δ', 'Локация', 'Баллы', 'План', '%', 'Числ.'].map(
              (h) => (
                <th key={h} className="border px-2">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {game.teams.map((t) => (
            <tr key={t.teamId} data-testid="team-row">
              <td className="border px-2">{leader.get(t.teamId)}</td>
              <td className="border px-2">{t.position}</td>
              <td className="border px-2">{t.pacePosition}</td>
              <td className="border px-2">
                {t.deltaVsPace > 0 ? `+${t.deltaVsPace}` : t.deltaVsPace}
              </td>
              <td className="border px-2">{t.locationIndex}</td>
              <td className="border px-2">{Math.round(t.points)}</td>
              <td className="border px-2">{Math.round(t.targetPoints)}</td>
              <td className="border px-2">{Math.round(t.progress * 100)}</td>
              <td className="border px-2">{t.headcount.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-4 font-semibold">Лидерборд (первые 10)</h2>
      <table className="mt-1 border-collapse">
        <tbody>
          {game.managers.slice(0, 10).map((m) => (
            <tr key={m.managerId}>
              <td className="border px-2">{m.rank}</td>
              <td className="border px-2">{m.fullName}</td>
              <td className="border px-2">{leader.get(m.teamId)}</td>
              {config.metrics.map((metric) => (
                <td key={metric.id} className="border px-2" title={metric.title}>
                  {m.totals[metric.id] ?? 0}
                </td>
              ))}
              <td className="border px-2 font-semibold">{Math.round(m.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-4 font-semibold">Ачивки ({game.unlocks.length})</h2>
      <ul className="mt-1">
        {[...game.unlocks]
          .reverse()
          .slice(0, 20)
          .map((u) => (
            <li key={`${u.achievementId}|${u.managerId ?? u.teamId}|${u.unlockedAt}`}>
              {u.unlockedAt} — {title.get(u.achievementId)} —{' '}
              {u.managerId ? person.get(u.managerId) : `команда ${leader.get(u.teamId ?? '')}`}
              {u.source === 'manual' ? ' (вручную)' : ''}
            </li>
          ))}
      </ul>

      <h2 className="mt-4 font-semibold">Предупреждения ({game.warnings.length})</h2>
      <ul className="mt-1">
        {game.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </main>
  );
}
