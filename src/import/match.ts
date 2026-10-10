import type { Manager, SeasonConfig } from '../data/schemas/season.ts';
import { teamOn } from '../engine/roster.ts';
import type { Person } from './parsed.ts';

/** A name as compared (DATA-9): single spaces, `ё` as `е`, any case. */
export function normalizeName(name: string): string {
  return name
    .replace(/[ёЁ]/g, (c) => (c === 'ё' ? 'е' : 'Е'))
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** A name as stored: trimmed, single spaces, letters as written. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export type Unknown = {
  name: string;
  norm: string;
  group: string | null;
  /** The team whose `sourceCode` is the person's group (D-21), if any. */
  suggestedTeamId: string | null;
};

export type Match = {
  /** Normalised name → the operator's id. */
  managerOf: Map<string, string>;
  /** People the roster does not know and the admin has not told to ignore — asked once (DATA-10). */
  unknown: Unknown[];
  /** Names on the ignore list (`importIgnore`), as written in the file. */
  ignored: string[];
  /** «возможно, перевод»: listed in another group than the roster's team on `onDate`. */
  moved: string[];
};

/** The people of an export against the roster: by full name and by aliases (DATA-9, DATA-10). */
export function matchPeople(people: Person[], config: SeasonConfig, onDate: string): Match {
  const byName = new Map<string, Manager>();
  for (const m of config.managers)
    for (const n of [m.fullName, ...m.aliases]) {
      const key = normalizeName(n);
      if (!byName.has(key)) byName.set(key, m);
    }
  const ignore = new Set(config.importIgnore.map(normalizeName));
  const codeOf = new Map(config.teams.map((t) => [t.id, t.sourceCode]));
  const teamOfCode = new Map(
    config.teams.flatMap((t) => (t.sourceCode ? [[t.sourceCode, t.id] as const] : [])),
  );

  const match: Match = { managerOf: new Map(), unknown: [], ignored: [], moved: [] };
  const seen = new Set<string>();
  for (const p of people) {
    const norm = normalizeName(p.name);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const m = byName.get(norm);
    if (m) {
      match.managerOf.set(norm, m.id);
      const code = codeOf.get(teamOn(m, onDate));
      if (p.group && code && p.group !== code)
        match.moved.push(
          `${p.name}: в выгрузке в группе ${p.group}, в составе — в ${code} (возможно, перевод)`,
        );
    } else if (ignore.has(norm)) match.ignored.push(p.name);
    else
      match.unknown.push({
        name: p.name,
        norm,
        group: p.group,
        suggestedTeamId: (p.group && teamOfCode.get(p.group)) ?? null,
      });
  }
  return match;
}
