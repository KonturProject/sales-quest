import { describe, expect, it } from 'vitest';
import { detectProfile } from '../../../src/import/detect.ts';
import { DEFAULT_PROFILES } from '../../../src/import/profiles.ts';
import { PAYMENT_HEADERS } from '../../support/grids.ts';

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
      (sheet) => (sheet === 0 ? PAYMENT_HEADERS : []),
      DEFAULT_PROFILES,
    );
    expect(p?.id).toBe('payments');
  });

  it('anything else is not recognised', () => {
    expect(detectProfile(['Лист1'], () => ['Имя', 'Дата'], DEFAULT_PROFILES)).toBeNull();
  });
});
