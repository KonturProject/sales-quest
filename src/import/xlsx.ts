import * as XLSX from 'xlsx';
import { detectProfile } from './detect.ts';
import { parseFunnel } from './funnel.ts';
import { ImportError, type Grid } from './grid.ts';
import { parseIntraday } from './intraday.ts';
import type { Parsed } from './parsed.ts';
import type { ImportProfile } from './profiles.ts';
import { HEADER_SEARCH_ROWS, parsePayments } from './payments.ts';

/**
 * Export files through SheetJS (§13.2, D-7a): only in the admin's worker and in Node scripts —
 * never in the viewers' bundle. A sheet is read only when needed: the funnel's book has another
 * sheet declaring a million rows (IMPORT_FORMATS §1).
 */

export function sheetNames(bytes: ArrayBuffer): string[] {
  return XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames;
}

/** One sheet as rows of cells, row 1 at index 0 whatever range the file declares. */
export function readGrid(
  bytes: ArrayBuffer,
  sheet: string | number,
  names = sheetNames(bytes),
): Grid {
  const name = typeof sheet === 'number' ? names[sheet] : sheet;
  if (name === undefined || !names.includes(name))
    throw new ImportError(`в файле нет листа «${String(sheet)}»`);
  const ws = XLSX.read(bytes, { type: 'array', sheets: [name], dense: true }).Sheets[name];
  if (!ws?.['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.s = { r: 0, c: 0 };
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
    range,
  });
}

/**
 * Which export the file is, and its numbers; `ImportError` for a file the game does not know. `day` — the
 * day of a file without dates (the intraday totals, D-55).
 */
export function parseWorkbook(
  bytes: ArrayBuffer,
  profiles: ImportProfile[],
  day: string,
): { profile: ImportProfile; parsed: Parsed } {
  const names = sheetNames(bytes);
  const grids = new Map<string | number, Grid>();
  const grid = (sheet: string | number) => {
    let g = grids.get(sheet);
    if (!g) grids.set(sheet, (g = readGrid(bytes, sheet, names)));
    return g;
  };
  const profile = detectProfile(
    names,
    (sheet) => (names.length > 0 ? grid(sheet).slice(0, HEADER_SEARCH_ROWS) : []),
    profiles,
  );
  if (!profile)
    throw new ImportError(
      'файл не похож ни на воронку по дням, ни на выгрузку оплаченных счетов, ни на промежуточные итоги — проверьте, тот ли это файл',
    );
  const parsed =
    profile.kind === 'matrix'
      ? parseFunnel(grid(profile.sheet), profile)
      : profile.kind === 'events'
        ? parsePayments(grid(profile.sheet), profile)
        : parseIntraday(grid(profile.sheet), profile, day);
  return { profile, parsed };
}
