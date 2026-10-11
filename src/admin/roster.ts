import {
  SeasonConfigSchema,
  type Manager,
  type Membership,
  type SeasonConfig,
  type Team,
} from '../data/schemas/season.ts';
import { IsoDateSchema } from '../data/schemas/common.ts';
import { addDays } from '../engine/dates.ts';
import { nextManagerId } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import { cleanName, normalizeName } from '../import/match.ts';
import { VARIANTS } from '../scene/heroCatalog.ts';
import { plural } from '../text.ts';
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
  /** The id each new person of the batch got, by its ref: the screen edits them by the ref. */
  refs: Map<string, string>;
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

/** A real calendar day `YYYY-MM-DD`: a cleared date field gives '' (review 2b-1). */
const isDay = (date: string) => IsoDateSchema.safeParse(date).success;

/** A day of the game: before the start — the start; after the end — refused; no day — refused. */
function gameDate(config: SeasonConfig, date: string, what: string): string {
  if (!isDay(date)) refuse(`${what}: укажите дату`);
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
      if (!isDay(edit.date)) refuse('увольнение: укажите дату');
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
  if (edit.kind === 'order') {
    const ids = c.teams.map((t) => t.id);
    if (edit.teamIds.length !== ids.length || !ids.every((id) => edit.teamIds.includes(id)))
      refuse('порядок должен перечислить все команды по одному разу');
    return { ...c, teams: c.teams.map((t) => ({ ...t, order: edit.teamIds.indexOf(t.id) + 1 })) };
  }
  const t = teamOf(c, edit.teamId);
  const next = { ...t };
  if (edit.leaderName !== undefined) {
    const v = edit.leaderName.trim();
    if (!v) refuse(`у команды ${teamLabel(t)} должен быть руководитель`);
    next.leaderName = v;
  }
  if (edit.color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(edit.color)) refuse('цвет — в формате #RRGGBB');
    next.color = edit.color.toUpperCase();
  }
  if (edit.characterId !== undefined) {
    if (!VARIANTS.some((v) => v.id === edit.characterId)) refuse('такого героя нет');
    next.characterId = edit.characterId;
  }
  if (
    next.leaderName === t.leaderName &&
    next.color === t.color.toUpperCase() &&
    next.characterId === t.characterId
  )
    refuse(`в команде ${teamLabel(t)} ничего не изменилось`);
  return { ...c, teams: c.teams.map((x) => (x.id === t.id ? next : x)) };
}

/** A team colour this close to another's reads as the same on the board (CIE76 ΔE in Lab). */
export const SIMILAR_COLOR_DELTA_E = 30;

/** CIE Lab of an sRGB colour `#RRGGBB` (D65). */
function lab(hex: string): [number, number, number] {
  const lin = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function similarColors(a: string, b: string): boolean {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) < SIMILAR_COLOR_DELTA_E;
}

/** What applied and is worth a look: a colour close to another team's, norms of zero. */
function warningsOf(c: SeasonConfig, edits: RosterEdit[], applied: boolean[]): string[] {
  const out: string[] = [];
  edits.forEach((edit, i) => {
    if (!applied[i]) return;
    if (edit.kind === 'team' && edit.color !== undefined) {
      const t = teamOf(c, edit.teamId);
      for (const other of c.teams)
        if (other.id !== t.id && similarColors(t.color, other.color))
          out.push(`цвет ${teamLabel(t)} похож на ${teamLabel(other)}`);
    }
    if (edit.kind === 'add' || edit.kind === 'norms') {
      if (!Object.values(edit.norms).every((v) => v === 0)) return;
      const who =
        edit.kind === 'add'
          ? cleanName(edit.name)
          : (c.managers.find((m) => m.id === edit.managerId)?.fullName ?? 'оператора');
      out.push(`у ${who} нормативы нулевые — цели команде это не добавит`);
    }
  });
  return out;
}

/** The public message of a batch (D-51): counts only, never a name. */
export function rosterCommitMessage(edits: RosterEdit[]): string {
  const count = (kind: RosterEdit['kind']) => edits.filter((e) => e.kind === kind).length;
  const roster: string[] = [];
  const add = (n: number, one: string, few: string, many: string) => {
    if (n > 0) roster.push(`${n} ${plural(n, one, few, many)}`);
  };
  add(count('add'), 'новый', 'новых', 'новых');
  add(count('transfer'), 'перевод', 'перевода', 'переводов');
  add(count('fire'), 'увольнение', 'увольнения', 'увольнений');
  add(count('unfire'), 'возврат', 'возврата', 'возвратов');
  add(count('rename'), 'переименование', 'переименования', 'переименований');
  add(count('norms'), 'смена нормативов', 'смены нормативов', 'смен нормативов');
  const changed = new Set(edits.flatMap((e) => (e.kind === 'team' ? [e.teamId] : []))).size;
  const teams: string[] = [];
  if (changed > 0) teams.push(`${changed} ${plural(changed, 'изменена', 'изменены', 'изменены')}`);
  if (count('order') > 0) teams.push('порядок');
  return [
    roster.length > 0 ? `состав: ${roster.join(', ')}` : null,
    teams.length > 0 ? `команды: ${teams.join(', ')}` : null,
  ]
    .filter((part) => part !== null)
    .join('; ');
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
  const day = (date: string) =>
    isDay(date) ? `с ${dayMonth(date < c.period.start ? c.period.start : date)}` : 'без даты';
  const norms = (n: Norms) =>
    c.metrics.map((m) => (n[m.id] ?? 0).toLocaleString('ru-RU')).join(' / ');
  switch (edit.kind) {
    case 'add':
      return `Новый: ${cleanName(edit.name)} → ${team(edit.teamId)} ${day(edit.from)}`;
    case 'rename':
      return `ФИО: ${who(edit.managerId)} → ${cleanName(edit.name)}`;
    case 'transfer':
      return `Перевод: ${who(edit.managerId)} → ${team(edit.teamId)} ${day(edit.from)}`;
    case 'norms':
      return `Нормативы: ${who(edit.managerId)} — ${norms(edit.norms)}`;
    case 'fire': {
      const reason = edit.reason?.trim();
      return `Увольнение: ${who(edit.managerId)} ${day(edit.date)}${reason ? ` (${reason})` : ''}`;
    }
    case 'unfire':
      return `Возврат: ${who(edit.managerId)}`;
    case 'team': {
      const parts = [
        edit.leaderName !== undefined ? `руководитель ${edit.leaderName.trim()}` : null,
        edit.color !== undefined ? 'цвет' : null,
        edit.characterId !== undefined ? 'герой' : null,
      ].filter((part) => part !== null);
      return `Команда ${team(edit.teamId)}: ${parts.join(', ')}`;
    }
    case 'order':
      return `Порядок команд: ${edit.teamIds.map(team).join(', ')}`;
  }
}

export function applyRosterEdits(config: SeasonConfig, edits: RosterEdit[]): RosterResult {
  const ctx: Ctx = { config, refs: new Map() };
  const problems: RosterResult['problems'] = [];
  const lines: string[] = [];
  const applied: boolean[] = [];
  edits.forEach((edit, index) => {
    lines.push(lineOf(ctx, edit));
    try {
      ctx.config = applyOne(ctx, edit);
      applied.push(true);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      problems.push({ index, message: e.message });
      applied.push(false);
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
      refs: ctx.refs,
    };
  return {
    config: parsed.data,
    problems,
    warnings: warningsOf(parsed.data, edits, applied),
    lines,
    refs: ctx.refs,
  };
}
