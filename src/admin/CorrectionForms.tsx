import { useState } from 'react';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import { teamOn } from '../engine/roster.ts';
import { dayMonth } from '../import/grid.ts';
import { plateName } from '../text.ts';
import { metricDay, metricText, parseCount, stepsHint, type Correction } from './corrections.ts';
import { Field, Form, TeamSelect } from './FormParts.tsx';
import { teamLabel } from './roster.ts';

/**
 * The forms of «Корректировки» (ADM-STEPS, ADM-RESET-TEAM, plan 2b-2): each turns what the admin typed
 * into a correction for the batch — nothing is written until «Записать». Whether it applies is the
 * batch's to say (a red line); the forms only show what it will do.
 */

type Add = (c: Correction) => void;
const isCount = (n: number) => Number.isInteger(n) && n !== 0;

function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Причина">
      <input
        className="sq-input flex-1"
        aria-label="Причина"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function Count({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="sq-input w-20"
      inputMode="numeric"
      aria-label={label}
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** «Шаги команде»: a bonus (+N) or a penalty (−N), never past the start or the end (no debt). */
export function StepsForm({
  teams,
  positions,
  max,
  onAdd,
}: {
  teams: Team[];
  /** Each team's cell with the batch applied. */
  positions: Map<string, number>;
  max: number;
  onAdd: Add;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [steps, setSteps] = useState('');
  const [reason, setReason] = useState('');
  const n = parseCount(steps);
  const team = teams.find((t) => t.id === teamId);
  const hint =
    steps.trim() === ''
      ? 'Например, +3 или −2'
      : isCount(n)
        ? `${team ? teamLabel(team) : ''}: ${stepsHint(positions.get(teamId) ?? 0, n, max)}`
        : 'шаги — целое число, не 0';
  return (
    <Form
      title="Шаги команде"
      named
      submit="В корректировки"
      onSubmit={() => {
        onAdd({ kind: 'steps', teamId, steps: n, reason });
        setSteps('');
        setReason('');
      }}
    >
      <Field label="Команда">
        <TeamSelect teams={teams} value={teamId} onChange={setTeamId} />
      </Field>
      <Field label="Шаги (+ бонус, − штраф)">
        <Count label="Шаги" value={steps} onChange={setSteps} />
      </Field>
      <Reason value={reason} onChange={setReason} />
      <p className="italic">{hint}</p>
    </Form>
  );
}

/** «Показатели оператора за день»: a count of a metric for a day, written as its points (D-25). */
export function MetricForm({
  config,
  teams,
  today,
  onAdd,
}: {
  config: SeasonConfig;
  teams: Team[];
  today: string;
  onAdd: Add;
}) {
  const metrics = [...config.metrics].sort((a, b) => a.order - b.order);
  const last = today < config.period.end ? today : config.period.end;
  const [managerId, setManagerId] = useState('');
  const [date, setDate] = useState(() => metricDay(config, today));
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? '');
  const [count, setCount] = useState('');
  const [reason, setReason] = useState('');
  const metric = metrics.find((m) => m.id === metricId);
  const n = parseCount(count);
  // People by the team of the chosen day (R-1), the fired too: a late payment is theirs. While the
  // field is cleared or half-typed (Backspace gives '', a year passes through 0002…) — by the default
  // day: the roster's dates throw on a non-day, and the whole admin with its batches went down (review 2b-2).
  const groupDay =
    date >= config.period.start && date <= config.period.end ? date : metricDay(config, today);
  const groups = teams.map((t) => ({
    team: t,
    people: config.managers
      .filter((m) => teamOn(m, groupDay) === t.id)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
  }));
  return (
    <Form
      title="Показатели оператора за день"
      named
      submit="В корректировки"
      onSubmit={() => {
        onAdd({ kind: 'metric', managerId, date, metricId, count: n, reason });
        setCount('');
        setReason('');
      }}
    >
      <Field label="Оператор">
        <select
          className="sq-input w-auto"
          aria-label="Оператор"
          required
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
        >
          <option value="">— выберите —</option>
          {groups.map(({ team, people }) => (
            <optgroup key={team.id} label={plateName(team.leaderName, team.sourceCode)}>
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                  {m.firedAt ? ` · увольнение с ${dayMonth(m.firedAt)}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="День">
        <input
          type="date"
          required
          className="sq-input w-auto"
          aria-label="День"
          min={config.period.start}
          max={last}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
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
        <Count label="Сколько" value={count} onChange={setCount} />
      </Field>
      <Reason value={reason} onChange={setReason} />
      <p className="italic">
        {count.trim() === ''
          ? 'Например, +1 или −1'
          : isCount(n) && metric
            ? metricText(metric, n)
            : 'сколько — целое число, не 0'}
      </p>
      {n > 0 && (
        <p className="sq-plate sq-plate-alarm px-3 py-1">
          Если это потом придёт в выгрузке, оно посчитается дважды — тогда корректировку нужно будет
          убрать.
        </p>
      )}
    </Form>
  );
}

/** «Вернуть команду на старт» (D-17): rare, so behind «Редкое» and a checkbox. */
export function ResetForm({
  teams,
  positions,
  onAdd,
}: {
  teams: Team[];
  positions: Map<string, number>;
  onAdd: Add;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  return (
    <Form
      title="Вернуть команду на старт"
      named
      submit="В корректировки"
      submitDisabled={!sure}
      onSubmit={() => {
        onAdd({ kind: 'reset', teamId, reason });
        setReason('');
        setSure(false);
      }}
    >
      <Field label="Команда">
        <TeamSelect teams={teams} value={teamId} onChange={setTeamId} />
      </Field>
      <Reason value={reason} onChange={setReason} />
      <p className="italic">
        клетка {positions.get(teamId) ?? 0} → 0; дальше фигурка пойдёт от старта по новым данным.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        Понимаю: фигурка встанет на старт; отменить можно будет только после части 2б-3
      </label>
    </Form>
  );
}
