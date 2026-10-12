import { useRef, useState } from 'react';
import type { Manager, SeasonConfig, Team } from '../data/schemas/season.ts';
import { localDate, localTimestamp } from '../data/time.ts';
import { isFiredOn, membersOn, teamOn } from '../engine/roster.ts';
import { Crest } from '../hud/Crest.tsx';
import { dayMonth } from '../import/grid.ts';
import { plateName } from '../text.ts';
import type { RepoState } from './pipeline.ts';
import { teamLabel, type RosterEdit } from './roster.ts';
import { RosterDraft } from './RosterDraft.tsx';
import { AddForm, FireForm, OperatorForm, TeamForm, VacationForm } from './RosterForms.tsx';
import { gameDay, prepareRoster, withEdit } from './rosterStep.ts';
import type { Session } from './session.ts';
import { HERO_TITLES } from './teamOptions.ts';

/** Which form is open: one at a time. */
type Open =
  | { form: 'operator'; managerId: string }
  | { form: 'fire'; managerId: string }
  | { form: 'add' }
  | { form: 'team'; teamId: string }
  /** A new vacation, or the one that starts on `from` (D-54). */
  | { form: 'vacation'; managerId: string; from?: string }
  | null;

const normsText = (config: SeasonConfig, m: Manager) =>
  m.dailyNorms
    ? config.metrics.map((x) => (m.dailyNorms?.[x.id] ?? 0).toLocaleString('ru-RU')).join(' / ')
    : 'нормы игры';

/** Since when the person is in the team they are shown in. */
const sinceIn = (m: Manager, teamId: string, day: string) =>
  (
    m.memberships.find((p) => p.teamId === teamId && p.from <= day && (!p.to || p.to >= day)) ??
    m.memberships.filter((p) => p.teamId === teamId).at(-1)
  )?.from;

/**
 * «Состав и команды» (ADM-ROSTER-1…6, plan 2b-1): the season as it will be after the batch — teams in
 * their order, each with its operators on the day; the forms add edits to the batch; the batch is
 * written once (`RosterDraft`). The batch lives in the admin page, so it survives a visit elsewhere.
 */
export function Roster({
  session,
  edits,
  onEdits,
  onState,
  onCancel,
  onCommitted,
}: {
  session: Session;
  edits: RosterEdit[];
  onEdits: (edits: RosterEdit[]) => void;
  onState: (state: RepoState) => void;
  onCancel: () => void;
  onCommitted: (rev: string) => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  // A commit runs: no edit may join the batch being written, nor the screen be left (review 2b-1).
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  const today = localDate(new Date());
  const step = prepareRoster(session.state, edits, { today, now: localTimestamp(new Date()) });
  const config = step.result.config;
  const day = gameDay(config, today);
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  // New people of the batch are edited by their ref, never by the id they would get.
  const refOf = new Map([...step.result.refs].map(([ref, id]) => [id, ref]));
  const editId = (m: Manager) => refOf.get(m.id) ?? m.id;

  const add = (more: RosterEdit[]) => {
    onEdits(more.reduce(withEdit, edits));
    setOpen(null);
  };
  const newRef = () => {
    // Never a ref still in the batch: refs of removed people take their edits with them.
    const used = edits.reduce(
      (n, e) => (e.kind === 'add' ? Math.max(n, Number(/^new-(\d+)$/.exec(e.ref)?.[1] ?? 0)) : n),
      0,
    );
    counter.current = Math.max(counter.current, used) + 1;
    return `new-${String(counter.current)}`;
  };
  const move = (i: number, by: number) => {
    const ids = teams.map((t) => t.id);
    const j = i + by;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    add([{ kind: 'order', teamIds: ids }]);
  };
  const operatorsOf = (team: Team) =>
    config.managers
      .filter((m) => !isFiredOn(m, day) && teamOn(m, day) === team.id)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  const fired = config.managers
    .filter((m) => m.firedAt !== undefined)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  const close = () => setOpen(null);

  return (
    <div className="space-y-3" data-testid="roster">
      <section className="sq-panel space-y-1 px-4 py-3">
        <div className="sq-title sq-caps">Состав и команды</div>
        <p className="sq-dim text-sm">
          Показано на {dayMonth(day)} — с учётом несохранённых изменений. Ничего не записывается,
          пока вы не нажмёте «Записать» внизу.
        </p>
      </section>

      <fieldset disabled={busy} className="m-0 min-w-0 space-y-3 border-0 p-0">
        {teams.map((t, i) => {
          const ops = operatorsOf(t);
          return (
            <section
              key={t.id}
              aria-label={`Команда ${t.leaderName}`}
              className="sq-panel space-y-2 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Crest color={t.color} />
                <span className="sq-name">{plateName(t.leaderName, t.sourceCode)}</span>
                <span className="sq-dim text-sm">
                  {HERO_TITLES[t.characterId] ?? t.characterId} ·{' '}
                  {membersOn(config.managers, t.id, day).length} чел.
                </span>
                <span className="ml-auto flex flex-wrap gap-1">
                  <button
                    className="sq-button"
                    aria-label={`Выше: ${teamLabel(t)}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="sq-button"
                    aria-label={`Ниже: ${teamLabel(t)}`}
                    disabled={i === teams.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="sq-button"
                    onClick={() => setOpen({ form: 'team', teamId: t.id })}
                  >
                    Изменить команду
                  </button>
                </span>
              </div>
              {open?.form === 'team' && open.teamId === t.id && (
                <TeamForm team={t} onAdd={add} onCancel={close} />
              )}
              <details>
                <summary className="cursor-pointer text-sm">Операторы ({ops.length})</summary>
                <ul className="sq-parchment mt-1 space-y-1 px-2 py-1">
                  {ops.map((m) => (
                    // Keyed by the batch's id: a new person keeps the form when ids shift.
                    <li key={editId(m)} className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span data-testid="operator-name">{m.fullName}</span>
                      <span className="sq-dim">
                        {normsText(config, m)}
                        {(() => {
                          const since = sinceIn(m, t.id, day);
                          return since ? ` · с ${dayMonth(since)}` : '';
                        })()}
                      </span>
                      {m.firedAt && (
                        <span className="sq-pace-down">увольнение с {dayMonth(m.firedAt)}</span>
                      )}
                      {(m.vacations ?? []).map((v) => (
                        <span key={v.from} className="flex items-center gap-1 italic">
                          {v.from <= day && day <= v.to
                            ? `в отпуске до ${dayMonth(v.to)}`
                            : `отпуск ${dayMonth(v.from)}–${dayMonth(v.to)}`}
                          <button
                            className="sq-button not-italic"
                            aria-label={`Изменить отпуск: ${m.fullName} с ${dayMonth(v.from)}`}
                            onClick={() =>
                              setOpen({ form: 'vacation', managerId: editId(m), from: v.from })
                            }
                          >
                            Изменить
                          </button>
                          <button
                            className="sq-button not-italic"
                            aria-label={`Снять отпуск: ${m.fullName} с ${dayMonth(v.from)}`}
                            onClick={() =>
                              add([{ kind: 'unvacation', managerId: editId(m), from: v.from }])
                            }
                          >
                            Снять
                          </button>
                        </span>
                      ))}
                      <span className="ml-auto flex gap-1">
                        <button
                          className="sq-button"
                          aria-label={`Изменить: ${m.fullName}`}
                          onClick={() => setOpen({ form: 'operator', managerId: editId(m) })}
                        >
                          Изменить
                        </button>
                        <button
                          className="sq-button"
                          aria-label={`Отпуск: ${m.fullName}`}
                          disabled={m.firedAt !== undefined}
                          onClick={() => setOpen({ form: 'vacation', managerId: editId(m) })}
                        >
                          Отпуск
                        </button>
                        <button
                          className="sq-button"
                          aria-label={`Уволить: ${m.fullName}`}
                          disabled={m.firedAt !== undefined}
                          onClick={() => setOpen({ form: 'fire', managerId: editId(m) })}
                        >
                          Уволить
                        </button>
                      </span>
                      {open?.form === 'operator' && open.managerId === editId(m) && (
                        <OperatorForm
                          config={config}
                          teams={teams}
                          manager={m}
                          editId={editId(m)}
                          teamId={t.id}
                          day={day}
                          onAdd={add}
                          onCancel={close}
                        />
                      )}
                      {open?.form === 'vacation' && open.managerId === editId(m) && (
                        <VacationForm
                          config={config}
                          manager={m}
                          editId={editId(m)}
                          day={day}
                          vacation={(m.vacations ?? []).find((v) => v.from === open.from)}
                          onAdd={add}
                          onCancel={close}
                        />
                      )}
                      {open?.form === 'fire' && open.managerId === editId(m) && (
                        <FireForm
                          config={config}
                          manager={m}
                          editId={editId(m)}
                          day={day}
                          onAdd={add}
                          onCancel={close}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })}

        <section className="sq-panel space-y-2 px-4 py-3">
          <button className="sq-button" onClick={() => setOpen({ form: 'add' })}>
            Добавить оператора
          </button>
          {open?.form === 'add' && (
            <AddForm
              config={config}
              teams={teams}
              day={day}
              newRef={newRef}
              onAdd={add}
              onCancel={close}
            />
          )}
          <div className="sq-caps sq-muted text-sm">Уволенные ({fired.length})</div>
          {fired.length > 0 && (
            <ul className="sq-parchment space-y-1 px-2 py-1 text-sm">
              {fired.map((m) => {
                const t = teams.find((x) => x.id === m.memberships.at(-1)?.teamId);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-2">
                    <span>{m.fullName}</span>
                    <span className="sq-dim">
                      {t ? teamLabel(t) : ''} · с {dayMonth(m.firedAt as string)}
                      {m.firedReason ? ` (${m.firedReason})` : ''}
                    </span>
                    <button
                      className="sq-button ml-auto"
                      aria-label={`Вернуть: ${m.fullName}`}
                      onClick={() => add([{ kind: 'unfire', managerId: editId(m) }])}
                    >
                      Вернуть
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </fieldset>

      <RosterDraft
        session={session}
        step={step}
        edits={edits}
        onEdits={onEdits}
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
