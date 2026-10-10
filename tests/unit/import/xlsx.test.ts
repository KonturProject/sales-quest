import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFunnel } from '../../../src/import/funnel.ts';
import { ImportError } from '../../../src/import/grid.ts';
import { parsePayments } from '../../../src/import/payments.ts';
import {
  DEFAULT_FUNNEL,
  DEFAULT_PAYMENTS,
  DEFAULT_PROFILES,
} from '../../../src/import/profiles.ts';
import { sha256 } from '../../../src/import/hash.ts';
import { parseWorkbook, readGrid, sheetNames } from '../../../src/import/xlsx.ts';
import { funnelGrid, paymentsGrid } from '../../support/grids.ts';

const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
const funnel = funnelGrid({
  dates,
  groups: [
    {
      code: 'СР1',
      name: 'Пл_НП_СР_Город_СР1_Входящие',
      people: [{ name: 'Ершова Мария', days: { '2026-10-05': [3, 1] } }],
    },
  ],
});

/** A workbook as the export is: sheets in order, written to bytes and read back like a file. */
function book(sheets: [string, XLSX.WorkSheet][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('reading an export file (SheetJS, QA-2)', () => {
  it('reads only the funnel sheet and parses it as the grid', () => {
    const ws = XLSX.utils.aoa_to_sheet(funnel);
    // The block names are merged across their columns in the export.
    ws['!merges'] = [{ s: { r: 3, c: 7 }, e: { r: 3, c: 20 } }];
    // The other sheet: the real one declares a million rows (IMPORT_FORMATS §1) and is never read —
    // writing such a test book takes seconds, so here it is smaller; the real file is timed by
    // scripts/check-exports.ts.
    const huge = XLSX.utils.aoa_to_sheet([['трафик']]);
    huge['!ref'] = 'A1:Z5000';
    const bytes = book([
      ['ВОРОНКА ПНС', huge],
      ['ВОРОНКА Первичная кампания', ws],
      ['Лист1', XLSX.utils.aoa_to_sheet([[]])],
    ]);
    expect(sheetNames(bytes)).toEqual(['ВОРОНКА ПНС', 'ВОРОНКА Первичная кампания', 'Лист1']);
    const { profile, parsed } = parseWorkbook(bytes, DEFAULT_PROFILES);
    expect(profile.id).toBe('funnel');
    expect(parsed).toEqual(parseFunnel(funnel, DEFAULT_FUNNEL));
  });

  it('keeps the rows in place when the first rows of a sheet are empty', () => {
    const ws = XLSX.utils.aoa_to_sheet(funnel);
    // Rows 1–3 are empty: a range starting at row 4 must not move row 4 to the top.
    ws['!ref'] = ws['!ref']?.replace(/^A1/, 'A4');
    const grid = readGrid(book([['ВОРОНКА Первичная кампания', ws]]), 'ВОРОНКА Первичная кампания');
    expect(grid[3]?.[6]).toBe('Сентябрь.2026');
  });

  it('recognises the paid invoices by their headers', () => {
    const grid = paymentsGrid([
      { invoice: 'Счёт-1', date: '2026-10-05', author: 'Ершова Мария', group: 'СР1' },
      { invoice: 'Счёт-2', date: '06.10.2026', author: 'Ершова Мария', group: 'СР1' },
    ]);
    const { profile, parsed } = parseWorkbook(
      book([['Sheet1', XLSX.utils.aoa_to_sheet(grid)]]),
      DEFAULT_PROFILES,
    );
    expect(profile.id).toBe('payments');
    expect(parsed).toEqual(parsePayments(grid, DEFAULT_PAYMENTS));
  });

  it('a workbook of another kind is refused in words', () => {
    const bytes = book([['Лист1', XLSX.utils.aoa_to_sheet([['Имя', 'Дата']])]]);
    expect(() => parseWorkbook(bytes, DEFAULT_PROFILES)).toThrow(ImportError);
    expect(() => parseWorkbook(bytes, DEFAULT_PROFILES)).toThrow(/не похож/);
  });

  it('fingerprints the bytes of a file (DATA-8)', async () => {
    const abc = new TextEncoder().encode('abc');
    expect(await sha256(abc.buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
