import { IsoDateSchema } from '../data/schemas/common.ts';
import type { Adjustment } from '../data/schemas/records.ts';
import type { Metric, SeasonConfig, Team } from '../data/schemas/season.ts';
import { activeAdjustments, managerPointsBetween } from '../engine/adjustments.ts';
import { addDays, dateOf } from '../engine/dates.ts';
import { computeGameState, inputsAsOf, type TeamState } from '../engine/gameState.ts';
import { prepare, type EngineInput } from '../engine/prepare.ts';
import { teamOn } from '../engine/roster.ts';
import { pointsOf, weightsOf } from '../engine/scoring.ts';
import { dayMonth } from '../import/grid.ts';
import { plural } from '../text.ts';
import { previewChange, type Preview, type RepoState } from './pipeline.ts';
import { teamLabel } from './roster.ts';

/**
 * Corrections while the game runs (ADM-STEPS, ADM-RESET-TEAM, plan 2b-2): a correction is a value, the
 * batch a list applied in order to the season's adjustments. One that does not apply is named in
 * `problems` and skipped; the rest still apply — so the same list can be applied again to a season
 * another admin changed meanwhile (ADM-2), every written value derived anew from that season. Pure:
 * «now» is a parameter (D-11).
 */

export type Correction =
  | { kind: 'steps'; teamId: string; steps: number; reason: string }
  | {
      kind: 'metric';
      managerId: string;
      date: string;
      metricId: string;
      count: number;
      reason: string;
    }
  | { kind: 'reset'; teamId: string; reason: string };

export type CorrectionsResult = {
  /** The season with the corrections that apply appended to its adjustments. */
  input: EngineInput;
  /** Corrections that did not apply, in words, by their index in the batch. */
  problems: { index: number; message: string }[];
  /** Allowed, but worth a look. */
  warnings: string[];
  /** One per correction, in words, for the screen — names inside: never public. */
  lines: string[];
};

/** One correction that does not apply, in words for the admin. */
class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused(message);
};

const NOTHING_TO_TAKE = 'команда уже на старте — штрафовать нечего';
const AT_THE_END = 'команда уже в конце трека';

const fmt = (n: number) => n.toLocaleString('ru-RU');
/** «+3», «−3» — with the typographic minus. */
const signed = (n: number) => (n < 0 ? `−${fmt(-n)}` : `+${fmt(n)}`);
const isDay = (date: string) => IsoDateSchema.safeParse(date).success;
const isCount = (n: number) => Number.isInteger(n) && n !== 0;

/** A whole number typed with its sign: «3», «+3», «-3», «−3», «- 3» → 3 or −3; anything else — NaN. */
export function parseCount(text: string): number {
  const t = text.replace(/\s+/g, '').replace(/^[−–]/, '-');
  return /^[+-]?\d+$/.test(t) ? Number(t) : Number.NaN;
}

/**
 * The steps a figure at `position` really takes on a track that ends at `max`: never below the start
 * nor past the end (no debt, the author 11.10.2026).
 */
export function clampSteps(position: number, steps: number, max: number): number {
  return Math.min(max, Math.max(0, position + steps)) - position;
}

/** What the steps do to the figure, in words: «клетка 8 → 0: запишется −8, ниже старта нельзя». */
export function stepsHint(position: number, steps: number, max: number): string {
  const value = clampSteps(position, steps, max);
  if (value === 0) return steps < 0 ? NOTHING_TO_TAKE : AT_THE_END;
  const cut =
    value === steps
      ? ''
      : `: запишется ${signed(value)}, ${steps < 0 ? 'ниже старта' : 'дальше конца трека'} нельзя`;
  return `клетка ${String(position)} → ${String(position + value)}${cut}`;
}

/** count × weight, without the float's tails (3 × 0.1). */
const pointsOfCount = (metric: Metric, count: number) =>
  Math.round(count * metric.weight * 100) / 100;

/** A count of a metric and its points, in words: «Оплаты +1 = +10 баллов». */
export function metricText(metric: Metric, count: number): string {
  const value = pointsOfCount(metric, count);
  const word = Number.isInteger(value) ? plural(value, 'балл', 'балла', 'баллов') : 'балла';
  return `${metric.title} ${signed(count)} = ${signed(value)} ${word}`;
}

/** An operator's points for a day: the records by the weights and the point corrections of that day. */
function pointsOfDay(input: EngineInput, managerId: string, date: string): number {
  const values = prepare(input).series.get(managerId)?.get(date);
  const records = values ? pointsOf(values, weightsOf(input.config)) : 0;
  return managerPointsBetween(input.adjustments, date, date)
    .filter((e) => e.managerId === managerId)
    .reduce((sum, e) => sum + e.value, records);
}

/** `adj-<YYYYMMDDHHmm>-`: the minute a batch is made in. */
const idPrefix = (now: string) => `adj-${now.slice(0, 16).replace(/[-T:]/g, '')}-`;

/** The largest number of the minute's ids in the file: a second batch of that minute goes on from it. */
function takenIds(adjustments: Adjustment[], prefix: string): number {
  return adjustments.reduce((max, a) => {
    const n = a.id.startsWith(prefix) ? Number(a.id.slice(prefix.length)) : 0;
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
}

function teamOf(input: EngineInput, id: string): Team {
  return input.config.teams.find((t) => t.id === id) ?? refuse('этой команды нет в игре');
}

/**
 * The figure's place before the track's limits — the sum `adjustedPosition` (src/engine/progress.ts)
 * clamps: past the end when the data ran beyond the overflow zone, below 0 when corrections took more
 * points than the data gave. The figure stands at the limit then, and steps must cover the gap for it
 * to land where the line says (review 2b-2).
 */
function rawPlace(input: EngineInput, teamId: string, computed: number, today: string): number {
  let removed = 0;
  let steps = 0;
  for (const a of activeAdjustments(inputsAsOf(input, today).adjustments, today)) {
    if (a.type === 'team_reset' && a.teamId === teamId) {
      removed = a.value;
      steps = 0;
    } else if (a.type === 'season_reset') {
      removed = a.value[teamId] ?? 0;
      steps = 0;
    } else if (a.type === 'team_steps' && a.teamId === teamId) steps += a.value;
  }
  return computed - removed + steps;
}

/**
 * Where a team stands at `now`, the batch's earlier corrections in: the figure, its place before the
 * track's limits, the data's own place, the end.
 */
function placeOf(input: EngineInput, teamId: string, now: string) {
  const state = computeGameState(input, now);
  const team = state.teams.find((t) => t.teamId === teamId) as TeamState; // a team of the config
  return {
    position: team.position,
    raw: rawPlace(input, teamId, team.computedPosition, state.today),
    computed: team.computedPosition,
    max: state.track.maxPosition,
  };
}

type Made = { adjustment: Adjustment; line: string; warning?: string };
type Meta = { id: string; at: string; by: string; today: string };

function applyOne(input: EngineInput, c: Correction, meta: Meta): Made {
  const reason = c.reason.trim();
  if (reason === '') refuse('укажите причину');
  const base = { id: meta.id, at: meta.at, by: meta.by };
  switch (c.kind) {
    case 'steps': {
      const team = teamOf(input, c.teamId);
      if (!isCount(c.steps)) refuse('шаги — целое число, не 0');
      const { position, raw, max } = placeOf(input, team.id, meta.at);
      const moved = clampSteps(position, c.steps, max);
      if (moved === 0) refuse(c.steps < 0 ? NOTHING_TO_TAKE : AT_THE_END);
      // From the unclamped sum: the figure lands on `position + moved` even when the data hold it past
      // the end of the track or a minus holds it below the start (review 2b-2).
      const value = position + moved - raw;
      return {
        adjustment: { ...base, type: 'team_steps', teamId: team.id, value, reason },
        line: `Шаги: ${teamLabel(team)} ${signed(c.steps)} — ${stepsHint(position, c.steps, max)} (${reason})`,
      };
    }
    case 'metric': {
      const { config } = input;
      const m =
        config.managers.find((x) => x.id === c.managerId) ??
        refuse('этого оператора нет в составе');
      const metric =
        config.metrics.find((x) => x.id === c.metricId) ?? refuse('такого показателя нет в игре');
      if (!isCount(c.count)) refuse('сколько — целое число, не 0');
      if (!isDay(c.date)) refuse('укажите день');
      const { start, end } = config.period;
      if (c.date < start || c.date > end)
        refuse(`${dayMonth(c.date)} — не день игры (${dayMonth(start)}–${dayMonth(end)})`);
      if (c.date > meta.today) refuse(`${dayMonth(c.date)} ещё не наступило`);
      const value = pointsOfCount(metric, c.count);
      if (value === 0) refuse(`у показателя «${metric.title}» вес 0 — баллов это не даст`);
      // The team of that day gets the points (R-1); a fired operator's late payment too.
      const team = teamOf(input, teamOn(m, c.date));
      const day = pointsOfDay(input, m.id, c.date) + value;
      return {
        adjustment: {
          ...base,
          type: 'manager_points',
          managerId: m.id,
          date: c.date,
          value,
          // The count in words for the journal (2b-3): the points alone do not say what was fixed.
          reason: `${metric.title} ${signed(c.count)}: ${reason}`,
        },
        line: `Показатели: ${m.fullName} (${teamLabel(team)}), ${dayMonth(c.date)} — ${metricText(metric, c.count)} (${reason})`,
        ...(day < 0
          ? {
              warning: `${m.fullName}, ${dayMonth(c.date)}: баллов за день станет меньше нуля (${signed(day)}) — проверьте день и оператора`,
            }
          : {}),
      };
    }
    case 'reset': {
      const team = teamOf(input, c.teamId);
      const { position, computed } = placeOf(input, team.id, meta.at);
      return {
        // The data's own place before the track's limits (D-17). Below zero only when corrections took
        // more points than the data gave — the figure stands at the start then anyway.
        adjustment: {
          ...base,
          type: 'team_reset',
          teamId: team.id,
          value: Math.max(0, computed),
          reason,
        },
        line: `На старт: ${teamLabel(team)} — клетка ${String(position)} → 0 (${reason})`,
      };
    }
  }
}

/** A correction that did not apply, as it was typed. */
function plainLine(config: SeasonConfig, c: Correction): string {
  const team = (id: string) => {
    const t = config.teams.find((x) => x.id === id);
    return t ? teamLabel(t) : `команда ${id}`;
  };
  const n = (v: number) => (Number.isFinite(v) ? signed(v) : '?');
  const reason = c.reason.trim() === '' ? '' : ` (${c.reason.trim()})`;
  switch (c.kind) {
    case 'steps':
      return `Шаги: ${team(c.teamId)} ${n(c.steps)}${reason}`;
    case 'metric': {
      const who =
        config.managers.find((m) => m.id === c.managerId)?.fullName ?? `оператор ${c.managerId}`;
      const what = config.metrics.find((m) => m.id === c.metricId)?.title ?? c.metricId;
      const day = isDay(c.date) ? dayMonth(c.date) : 'без дня';
      return `Показатели: ${who}, ${day} — ${what} ${n(c.count)}${reason}`;
    }
    case 'reset':
      return `На старт: ${team(c.teamId)}${reason}`;
  }
}

export function applyCorrections(
  input: EngineInput,
  corrections: Correction[],
  opts: { now: string; by: string },
): CorrectionsResult {
  const prefix = idPrefix(opts.now);
  let taken = takenIds(input.adjustments, prefix);
  const today = dateOf(opts.now);
  let current = input;
  const problems: CorrectionsResult['problems'] = [];
  const warnings: string[] = [];
  const lines: string[] = [];
  corrections.forEach((c, index) => {
    try {
      const made = applyOne(current, c, {
        id: `${prefix}${String(taken + 1)}`,
        at: opts.now,
        by: opts.by,
        today,
      });
      taken += 1;
      current = { ...current, adjustments: [...current.adjustments, made.adjustment] };
      lines.push(made.line);
      if (made.warning !== undefined) warnings.push(made.warning);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      lines.push(plainLine(current.config, c));
      problems.push({ index, message: e.message });
    }
  });
  return { input: current, problems, warnings, lines };
}

/**
 * Corrections cancelled (ADM-UNDO, 2b-3): each stays in the file, struck through — `revoked` with who, when and
 * why — and leaves the points (the engine skips it). An id gone meanwhile or cancelled already is a problem; the
 * others still apply, so the same ids apply again to a season read anew (ADM-2).
 */
export function revokeAdjustments(
  input: EngineInput,
  ids: string[],
  meta: { by: string; at: string; reason: string },
): { input: EngineInput; problems: { id: string; message: string }[] } {
  const problems: { id: string; message: string }[] = [];
  const cancel = new Set<string>();
  for (const id of ids) {
    const found = input.adjustments.find((a) => a.id === id);
    if (!found) problems.push({ id, message: 'корректировки больше нет' });
    else if (found.revoked) problems.push({ id, message: 'корректировка уже отменена' });
    else cancel.add(id);
  }
  const revoked = { by: meta.by, at: meta.at, reason: meta.reason };
  return {
    input: {
      ...input,
      adjustments: input.adjustments.map((a) => (cancel.has(a.id) ? { ...a, revoked } : a)),
    },
    problems,
  };
}

/** The day an operator's numbers are fixed for by default: yesterday, inside the game. */
export function metricDay(config: SeasonConfig, today: string): string {
  const { start, end } = config.period;
  const day = addDays(today, -1);
  return day < start ? start : day > end ? end : day;
}

/** The public message of a batch (D-51): counts only, never a name. */
export function correctionsCommitMessage(corrections: Correction[]): string {
  const count = (kind: Correction['kind']) => corrections.filter((c) => c.kind === kind).length;
  const parts = (
    [
      [count('steps'), 'шаги'],
      [count('metric'), 'показатели'],
      [count('reset'), 'старт'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${String(n)} — ${what}`);
  return `корректировки: ${parts.join(', ')}`;
}

/**
 * A corrections batch as the screen runs it (plan 2b-2), pure: the batch applied to the season read
 * from GitHub, the preview «было → станет», the cells after it and the public message. «Записать»
 * commits `result.input` on `state` — the read the preview was made of (ADM-2).
 */
export type CorrectionsStep = {
  state: RepoState;
  result: CorrectionsResult;
  preview: Preview;
  /** Each team's cell with the batch applied — where the next correction starts from. */
  positions: Map<string, number>;
  /** The last cell of the track: the end of the overflow zone. */
  max: number;
  message: string;
};

export function prepareCorrections(
  state: RepoState,
  corrections: Correction[],
  opts: { now: string; by: string },
): CorrectionsStep {
  const result = applyCorrections(state.input, corrections, opts);
  const preview = previewChange(state.input, result.input, opts.now);
  const applied = corrections.filter((_, i) => !result.problems.some((p) => p.index === i));
  return {
    state,
    result,
    preview,
    positions: new Map(preview.teams.map((t) => [t.teamId, t.after])),
    max: computeGameState(state.input, opts.now).track.maxPosition,
    message: correctionsCommitMessage(applied),
  };
}
