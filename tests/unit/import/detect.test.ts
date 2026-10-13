import { describe, expect, it } from 'vitest';
import { detectProfile } from '../../../src/import/detect.ts';
import { DEFAULT_INTRADAY, DEFAULT_PROFILES } from '../../../src/import/profiles.ts';
import { PAYMENT_HEADERS, intradayGrid } from '../../support/grids.ts';

describe('which export a file is', () => {
  it('the funnel by its sheet', () => {
    const p = detectProfile(
      ['ВОРОНКА ПНС', 'ВОРОНКА Первичная кампания', 'Лист1'],
      () => [],
      DEFAULT_PROFILES,
    );
    expect(p?.id).toBe('funnel');
  });

  it('the paid invoices by the headers of the first sheet', () => {
    const p = detectProfile(
      ['Sheet1'],
      (sheet) => (sheet === 0 ? [PAYMENT_HEADERS] : []),
      DEFAULT_PROFILES,
    );
    expect(p?.id).toBe('payments');
  });

  it('the paid invoices with the headers lower down — the October export has two lines above them', () => {
    const p = detectProfile(
      ['Sheet1'],
      (sheet) =>
        sheet === 0 ? [[], ['Детальные данные по оплаченным счетам'], PAYMENT_HEADERS] : [],
      DEFAULT_PROFILES,
    );
    expect(p?.id).toBe('payments');
  });

  it('anything else is not recognised', () => {
    expect(detectProfile(['Лист1'], () => [['Имя', 'Дата']], DEFAULT_PROFILES)).toBeNull();
  });

  it('the intraday totals by a group row followed by an operator with a number (D-55)', () => {
    const rows = intradayGrid([
      {
        name: 'Пл_НП_СР_Город_СР1_Входящие',
        people: [{ name: 'Ершова Мария', inv6: 3, inv20: 1 }],
      },
    ]);
    expect(detectProfile(['Лист1'], (s) => (s === 0 ? rows : []), DEFAULT_PROFILES)?.id).toBe(
      'intraday',
    );
  });

  it('the paid invoices stay the paid invoices whatever the order of the profiles', () => {
    const p = detectProfile(['Sheet1'], (sheet) => (sheet === 0 ? [PAYMENT_HEADERS] : []), [
      DEFAULT_INTRADAY,
      ...DEFAULT_PROFILES,
    ]);
    expect(p?.id).toBe('payments');
  });
});
