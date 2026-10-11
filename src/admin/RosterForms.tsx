import { useState, type FormEvent, type ReactNode } from 'react';
import type { Manager, SeasonConfig, Team } from '../data/schemas/season.ts';
import { VARIANTS } from '../scene/heroCatalog.ts';
import { parseDecimal } from '../text.ts';
import { DEFAULT_NORMS } from './newGame.ts';
import type { Norms, RosterEdit } from './roster.ts';
import { HERO_TITLES } from './teamOptions.ts';

/**
 * The forms of «Состав и команды» (ADM-ROSTER-2, ADM-ROSTER-3, plan 2b-1): each turns what the admin
 * typed into edits for the batch — nothing is written until «Записать». Controls carry their name in
 * `aria-label`, so a label's text never mixes with a select's options.
 */

type Add = (edits: RosterEdit[]) => void;

function Form({
  title,
  children,
  onSubmit,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className="sq-parchment w-full space-y-2 px-3 py-2 text-sm" onSubmit={submit}>
      <div className="sq-caps">{title}</div>
      {children}
      <div className="flex gap-2">
        <button className="sq-button" type="submit">
          В изменения
        </button>
        <button className="sq-button" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="min-w-36">{label}</span>
      {children}
    </label>
  );
}

const text = (norms: Norms) =>
  Object.fromEntries(Object.entries(norms).map(([k, v]) => [k, v.toLocaleString('ru-RU')]));
const numbers = (texts: Record<string, string>) =>
  Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, parseDecimal(v)]));
const sameNorms = (a: Norms, b: Norms) => Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);

function NormsFields({
  config,
  values,
  onChange,
}: {
  config: SeasonConfig;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {config.metrics.map((m) => (
        <label key={m.id} className="flex items-center gap-1">
          {m.title}
          <input
            className="sq-input w-20"
            inputMode="decimal"
            aria-label={m.title}
            value={values[m.id] ?? ''}
            onChange={(e) => onChange({ ...values, [m.id]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function TeamSelect({
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

const dateInput = (
  config: SeasonConfig,
  label: string,
  value: string,
  onChange: (v: string) => void,
) => (
  <input
    type="date"
    required
    className="sq-input w-auto"
    aria-label={label}
    min={config.period.start}
    max={config.period.end}
    value={value}
    onChange={(e) => onChange(e.target.value)}
  />
);

/** «Изменить»: the name (the old one to the aliases), the team from a day, the norms. */
export function OperatorForm({
  config,
  teams,
  manager,
  editId,
  teamId,
  day,
  onAdd,
  onCancel,
}: {
  config: SeasonConfig;
  teams: Team[];
  manager: Manager;
  /** The id the batch knows the person by: the ref of someone new in it. */
  editId: string;
  /** The team the person is shown in. */
  teamId: string;
  day: string;
  onAdd: Add;
  onCancel: () => void;
}) {
  const own = manager.dailyNorms ?? config.defaultDailyNorms ?? DEFAULT_NORMS;
  const [name, setName] = useState(manager.fullName);
  const [team, setTeam] = useState(teamId);
  const [from, setFrom] = useState(day);
  const [norms, setNorms] = useState(() => text(own));
  const submit = () => {
    const edits: RosterEdit[] = [];
    if (name.trim() !== manager.fullName) edits.push({ kind: 'rename', managerId: editId, name });
    if (team !== teamId) edits.push({ kind: 'transfer', managerId: editId, teamId: team, from });
    const typed = numbers(norms);
    if (!sameNorms(typed, own)) edits.push({ kind: 'norms', managerId: editId, norms: typed });
    if (edits.length > 0) onAdd(edits);
    else onCancel();
  };
  return (
    <Form title={`Оператор: ${manager.fullName}`} onSubmit={submit} onCancel={onCancel}>
      <Field label="ФИО">
        <input
          className="sq-input flex-1"
          aria-label="ФИО"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Команда">
        <TeamSelect teams={teams} value={team} onChange={setTeam} />
      </Field>
      {team !== teamId && (
        <Field label="Дата перевода">{dateInput(config, 'Дата перевода', from, setFrom)}</Field>
      )}
      <NormsFields config={config} values={norms} onChange={setNorms} />
    </Form>
  );
}

/** «Уволить»: the day (still in the team on it, off the rating from it) and a reason. */
export function FireForm({
  config,
  manager,
  editId,
  day,
  onAdd,
  onCancel,
}: {
  config: SeasonConfig;
  manager: Manager;
  editId: string;
  day: string;
  onAdd: Add;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(day);
  const [reason, setReason] = useState('');
  return (
    <Form
      title={`Уволить: ${manager.fullName}`}
      onSubmit={() =>
        onAdd([
          {
            kind: 'fire',
            managerId: editId,
            date,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
        ])
      }
      onCancel={onCancel}
    >
      <Field label="Дата увольнения">{dateInput(config, 'Дата увольнения', date, setDate)}</Field>
      <Field label="Причина (необязательно)">
        <input
          className="sq-input flex-1"
          aria-label="Причина"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <p className="sq-dim">
        В этот день оператор ещё в команде; с него — не в рейтинге. Заработанное остаётся команде.
      </p>
    </Form>
  );
}

/** «Добавить оператора»: the name, the team, since when, the norms of the game. */
export function AddForm({
  config,
  teams,
  day,
  newRef,
  onAdd,
  onCancel,
}: {
  config: SeasonConfig;
  teams: Team[];
  day: string;
  newRef: () => string;
  onAdd: Add;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState(teams[0]?.id ?? '');
  const [from, setFrom] = useState(day);
  const [norms, setNorms] = useState(() => text(config.defaultDailyNorms ?? DEFAULT_NORMS));
  return (
    <Form
      title="Новый оператор"
      onSubmit={() =>
        onAdd([{ kind: 'add', ref: newRef(), name, teamId: team, from, norms: numbers(norms) }])
      }
      onCancel={onCancel}
    >
      <Field label="ФИО">
        <input
          className="sq-input flex-1"
          aria-label="ФИО"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Команда">
        <TeamSelect teams={teams} value={team} onChange={setTeam} />
      </Field>
      <Field label="С какого дня">{dateInput(config, 'С какого дня', from, setFrom)}</Field>
      <NormsFields config={config} values={norms} onChange={setNorms} />
    </Form>
  );
}

/** «Изменить команду»: the leader, the colour, the hero — only what changed goes to the batch. */
export function TeamForm({
  team,
  onAdd,
  onCancel,
}: {
  team: Team;
  onAdd: Add;
  onCancel: () => void;
}) {
  const [leader, setLeader] = useState(team.leaderName);
  const [color, setColor] = useState(team.color);
  const [hero, setHero] = useState(team.characterId);
  const submit = () => {
    const edit: Extract<RosterEdit, { kind: 'team' }> = { kind: 'team', teamId: team.id };
    if (leader.trim() !== team.leaderName) edit.leaderName = leader;
    if (color.toUpperCase() !== team.color.toUpperCase()) edit.color = color;
    if (hero !== team.characterId) edit.characterId = hero;
    if (Object.keys(edit).length > 2) onAdd([edit]);
    else onCancel();
  };
  return (
    <Form title="Команда" onSubmit={submit} onCancel={onCancel}>
      <Field label="Руководитель">
        <input
          className="sq-input flex-1"
          aria-label="Руководитель"
          value={leader}
          onChange={(e) => setLeader(e.target.value)}
        />
      </Field>
      <Field label="Цвет">
        <input
          type="color"
          aria-label="Цвет"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </Field>
      <Field label="Герой">
        <select
          className="sq-input w-auto"
          aria-label="Герой"
          value={hero}
          onChange={(e) => setHero(e.target.value)}
        >
          {VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>
              {HERO_TITLES[v.id] ?? v.id}
            </option>
          ))}
        </select>
      </Field>
    </Form>
  );
}
