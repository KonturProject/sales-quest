import { IsoDateSchema } from '../data/schemas/common.ts';
import type { Adjustment } from '../data/schemas/records.ts';
import type { SeasonConfig, Team } from '../data/schemas/season.ts';
import { dateOf } from '../engine/dates.ts';
import { computeGameState, type TeamState } from '../engine/gameState.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { dayMonth } from '../import/grid.ts';
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

/** Where a team stands at `now`, the batch's earlier corrections in: the figure, the data's place, the end. */
function placeOf(input: EngineInput, teamId: string, now: string) {
  const state = computeGameState(input, now);
  const team = state.teams.find((t) => t.teamId === teamId) as TeamState; // a team of the config
  return { position: team.position, computed: team.computedPosition, max: state.track.maxPosition };
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
      const { position, max } = placeOf(input, team.id, meta.at);
      const value = clampSteps(position, c.steps, max);
      if (value === 0) refuse(c.steps < 0 ? NOTHING_TO_TAKE : AT_THE_END);
      return {
        adjustment: { ...base, type: 'team_steps', teamId: team.id, value, reason },
        line: `Шаги: ${teamLabel(team)} ${signed(c.steps)} — ${stepsHint(position, c.steps, max)} (${reason})`,
      };
    }
    case 'metric':
      return refuse('ещё не умею'); // Task 2
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
