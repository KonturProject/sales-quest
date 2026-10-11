import {
  SeasonConfigSchema,
  type Manager,
  type Membership,
  type SeasonConfig,
  type Team,
} from '../data/schemas/season.ts';
import { addDays } from '../engine/dates.ts';
import { nextManagerId } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import { cleanName, normalizeName } from '../import/match.ts';
import { schemaProblem } from './session.ts';

/**
 * The roster and the teams as a batch of edits (ADM-ROSTER, plan 2b-1): an edit is a value, the batch a
 * list applied in order to the season config. An edit that does not apply is named in `problems` and
 * skipped; the rest still apply — so the same list can be applied again to a season another admin
 * changed meanwhile (ADM-2). Pure.
 */

export type Norms = Record<string, number>;

/**
 * One change of the roster or of a team. `managerId` may be the `ref` of an `add` earlier in the batch:
 * a new person is named by its ref (`new-1`…) until the batch is written.
 */
export type RosterEdit =
  | { kind: 'add'; ref: string; name: string; teamId: string; from: string; norms: Norms }
  | { kind: 'rename'; managerId: string; name: string }
  | { kind: 'transfer'; managerId: string; teamId: string; from: string }
  | { kind: 'norms'; managerId: string; norms: Norms }
  | { kind: 'fire'; managerId: string; date: string; reason?: string }
  | { kind: 'unfire'; managerId: string }
  | { kind: 'team'; teamId: string; leaderName?: string; color?: string; characterId?: string }
  | { kind: 'order'; teamIds: string[] };

export type RosterResult = {
  config: SeasonConfig;
  /** Edits that did not apply, in words; index −1 — the batch as a whole. */
  problems: { index: number; message: string }[];
  /** Allowed, but worth a look. */
  warnings: string[];
  /** One per edit, in words, for the screen — names inside: never public. */
  lines: string[];
};

/** One edit that does not apply, in words for the admin. */
class Refused extends Error {}
const refuse = (message: string): never => {
  throw new Refused(message);
};

/** A team as the admin sees it: its group's code (`СР5`), else its leader. */
export function teamLabel(team: Team): string {
  return team.sourceCode ?? team.leaderName;
}

type Ctx = { config: SeasonConfig; refs: Map<string, string> };

const lastTeamId = (m: Manager) => (m.memberships[m.memberships.length - 1] as Membership).teamId;

function managerOf(ctx: Ctx, id: string): Manager {
  const real = ctx.refs.get(id) ?? id;
  return (
    ctx.config.managers.find((m) => m.id === real) ??
    refuse('этого оператора нет в составе — возможно, его уже убрали')
  );
}

function teamOf(config: SeasonConfig, id: string): Team {
  return config.teams.find((t) => t.id === id) ?? refuse('этой команды нет в игре');
}

/** A day of the game: before the start — the start; after the end — refused. */
function gameDate(config: SeasonConfig, date: string, what: string): string {
  if (date > config.period.end)
    refuse(`${what} ${dayMonth(date)} — после конца игры (${dayMonth(config.period.end)})`);
  return date < config.period.start ? config.period.start : date;
}

/** No two operators share a name or an alias (case, spaces, ё/е and NFC aside). */
function unique(config: SeasonConfig, name: string, exceptId?: string): void {
  const norm = normalizeName(name);
  const other = config.managers.find(
    (m) => m.id !== exceptId && [m.fullName, ...m.aliases].some((n) => normalizeName(n) === norm),
  );
  if (other)
    refuse(
      `такой оператор уже есть: ${other.fullName} (${teamLabel(teamOf(config, lastTeamId(other)))})`,
    );
}

function checkNorms(config: SeasonConfig, norms: Norms): Norms {
  return Object.fromEntries(
    config.metrics.map((m) => {
      const v = norms[m.id];
      if (v === undefined || !Number.isFinite(v) || v < 0)
        refuse(`норматив «${m.title}» — число от 0`);
      return [m.id, v as number];
    }),
  );
}

const withManager = (config: SeasonConfig, m: Manager): SeasonConfig => ({
  ...config,
  managers: config.managers.map((x) => (x.id === m.id ? m : x)),
});

function applyOne(ctx: Ctx, edit: RosterEdit): SeasonConfig {
  const c = ctx.config;
  switch (edit.kind) {
    case 'add': {
      const name = cleanName(edit.name);
      if (!name) refuse('у нового оператора нет ФИО');
      unique(c, name);
      teamOf(c, edit.teamId);
      const dailyNorms = checkNorms(c, edit.norms);
      const from = gameDate(c, edit.from, 'приход');
      const id = nextManagerId(c.managers);
      ctx.refs.set(edit.ref, id);
      const added: Manager = {
        id,
        fullName: name,
        aliases: [],
        dailyNorms,
        memberships: [{ teamId: edit.teamId, from }],
      };
      return { ...c, managers: [...c.managers, added] };
    }
    case 'rename': {
      const m = managerOf(ctx, edit.managerId);
      const name = cleanName(edit.name);
      if (!name) refuse('ФИО не может быть пустым');
      if (name === m.fullName) refuse('ФИО не изменилось');
      unique(c, name, m.id);
      const norm = normalizeName(name);
      const aliases = m.aliases.filter((a) => normalizeName(a) !== norm);
      // A spelling fix (ё, case) keeps no alias: imports know both spellings anyway.
      const old = normalizeName(m.fullName);
      if (old !== norm && !aliases.some((a) => normalizeName(a) === old)) aliases.push(m.fullName);
      return withManager(c, { ...m, fullName: name, aliases });
    }
    case 'transfer': {
      const m = managerOf(ctx, edit.managerId);
      teamOf(c, edit.teamId);
      const from = gameDate(c, edit.from, 'перевод');
      if (m.firedAt !== undefined && from > m.firedAt)
        refuse(`${m.fullName}: увольнение с ${dayMonth(m.firedAt)} — перевод после него не нужен`);
      const first = m.memberships[0] as Membership;
      const kept = m.memberships.filter((p) => p.from < from);
      const last = kept[kept.length - 1];
      if (!last) {
        // On (or before) the first day: the team is replaced, the day of coming stays.
        if (first.teamId === edit.teamId) refuse(`${m.fullName} уже в этой команде`);
        return withManager(c, { ...m, memberships: [{ teamId: edit.teamId, from: first.from }] });
      }
      const open = last.to === undefined || last.to >= from;
      if (open && last.teamId === edit.teamId) refuse(`${m.fullName} уже в этой команде`);
      const closed = kept.map((p, i) =>
        i === kept.length - 1 && open ? { ...p, to: addDays(from, -1) } : p,
      );
      return withManager(c, { ...m, memberships: [...closed, { teamId: edit.teamId, from }] });
    }
    case 'norms': {
      const m = managerOf(ctx, edit.managerId);
      return withManager(c, { ...m, dailyNorms: checkNorms(c, edit.norms) });
    }
    case 'fire': {
      const m = managerOf(ctx, edit.managerId);
      if (m.firedAt !== undefined)
        refuse(`${m.fullName}: увольнение уже записано — с ${dayMonth(m.firedAt)}`);
      if (edit.date > c.period.end)
        refuse(`увольнение ${dayMonth(edit.date)} — после конца игры (${dayMonth(c.period.end)})`);
      const first = m.memberships[0] as Membership;
      if (edit.date < first.from)
        refuse(
          `${m.fullName}: увольнение ${dayMonth(edit.date)} раньше прихода в команду (${dayMonth(first.from)})`,
        );
      const reason = edit.reason?.trim();
      return withManager(c, {
        ...m,
        firedAt: edit.date,
        ...(reason ? { firedReason: reason } : {}),
      });
    }
    case 'unfire': {
      const m = managerOf(ctx, edit.managerId);
      if (m.firedAt === undefined) refuse(`${m.fullName}: увольнения нет — возвращать нечего`);
      const back: Manager = { ...m };
      delete back.firedAt;
      delete back.firedReason;
      return withManager(c, back);
    }
    case 'team':
    case 'order':
      return applyTeamEdit(c, edit);
  }
}

/** Team edits (the leader, the colour, the hero) and the order of the cards. */
function applyTeamEdit(
  c: SeasonConfig,
  edit: Extract<RosterEdit, { kind: 'team' | 'order' }>,
): SeasonConfig {
  return refuse(`правка команд (${edit.kind}) в игре ${c.id} — в следующей задаче`);
}

/** The edit in words, from the season as it is before the edit. */
function lineOf(ctx: Ctx, edit: RosterEdit): string {
  const c = ctx.config;
  const who = (id: string) =>
    c.managers.find((m) => m.id === (ctx.refs.get(id) ?? id))?.fullName ?? `оператор ${id}`;
  const team = (id: string) => {
    const t = c.teams.find((x) => x.id === id);
    return t ? teamLabel(t) : `команда ${id}`;
  };
  const day = (date: string) => dayMonth(date < c.period.start ? c.period.start : date);
  const norms = (n: Norms) =>
    c.metrics.map((m) => (n[m.id] ?? 0).toLocaleString('ru-RU')).join(' / ');
  switch (edit.kind) {
    case 'add':
      return `Новый: ${cleanName(edit.name)} → ${team(edit.teamId)} с ${day(edit.from)}`;
    case 'rename':
      return `ФИО: ${who(edit.managerId)} → ${cleanName(edit.name)}`;
    case 'transfer':
      return `Перевод: ${who(edit.managerId)} → ${team(edit.teamId)} с ${day(edit.from)}`;
    case 'norms':
      return `Нормативы: ${who(edit.managerId)} — ${norms(edit.norms)}`;
    case 'fire': {
      const reason = edit.reason?.trim();
      return `Увольнение: ${who(edit.managerId)} с ${dayMonth(edit.date)}${reason ? ` (${reason})` : ''}`;
    }
    case 'unfire':
      return `Возврат: ${who(edit.managerId)}`;
    case 'team':
    case 'order':
      return '';
  }
}

export function applyRosterEdits(config: SeasonConfig, edits: RosterEdit[]): RosterResult {
  const ctx: Ctx = { config, refs: new Map() };
  const problems: RosterResult['problems'] = [];
  const lines: string[] = [];
  edits.forEach((edit, index) => {
    lines.push(lineOf(ctx, edit));
    try {
      ctx.config = applyOne(ctx, edit);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      problems.push({ index, message: e.message });
    }
  });
  const parsed = SeasonConfigSchema.safeParse(ctx.config);
  if (!parsed.success)
    return {
      config,
      problems: [
        ...problems,
        { index: -1, message: `состав не проходит проверку: ${schemaProblem(parsed.error)}` },
      ],
      warnings: [],
      lines,
    };
  return { config: parsed.data, problems, warnings: [], lines };
}
