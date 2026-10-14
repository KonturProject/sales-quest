/** «1 шаг / 2 шага / 5 шагов»: the Russian plural form for `n`. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** The nameplate over a team's hero: the group before the leader, «СР6 • Вера Соколова» (author, 11.10.2026). */
export function plateName(leaderName: string, sourceCode?: string): string {
  return sourceCode ? `${sourceCode} • ${leaderName}` : leaderName;
}

/** A number typed in a form: «1,5» and «1.5» are 1.5; empty or not a number — NaN. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}

/** «Алина С.»: a name short enough for a token's plate or a line of the board (D-47, D-58). */
export function shortName(full: string): string {
  const [first, last] = full.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : (first ?? '');
}
