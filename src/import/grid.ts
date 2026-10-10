/**
 * A sheet as SheetJS gives it with `header: 1` — rows of cell values — and the readings of a cell
 * the parsers need. Pure: the parsers are tested on grids, without files (QA-2).
 */

export type Grid = unknown[][];

/** Stops an import; the message is for the admin, in Russian. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function cellText(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** A number of a cell: `''` (no data) is 0, numeric text is read, anything else is 0. */
export function cellNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = cellText(v).replace(/\s/g, '').replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const pad = (n: number) => String(n).padStart(2, '0');
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** A real calendar date `YYYY-MM-DD`, or null (`2026-02-30` is not one). */
function checked(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${y}-${pad(m)}-${pad(d)}`
    : null;
}

/**
 * The date of a cell as `YYYY-MM-DD`: an Excel serial number (the 1900 system; a time of day is
 * dropped), a `Date`, `DD.MM.YYYY` or `YYYY-MM-DD` text; null for anything else — a week total
 * `2026.40`, a name, an empty cell.
 */
export function cellDate(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 20_000 || v > 80_000) return null;
    return new Date(EXCEL_EPOCH + Math.floor(v) * 86_400_000).toISOString().slice(0, 10);
  }
  if (v instanceof Date)
    return Number.isNaN(v.getTime())
      ? null
      : checked(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const t = cellText(v);
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (ru) return checked(Number(ru[3]), Number(ru[2]), Number(ru[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return checked(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

/** A column's index by its letters: `A` → 0, `G` → 6, `AE` → 30. */
export function column(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** `05.10` from `2026-10-05`, for the admin's messages. */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
