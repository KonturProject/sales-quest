import { describe, expect, it } from 'vitest';
import { parsePayments } from '../../../src/import/payments.ts';
import { DEFAULT_PAYMENTS } from '../../../src/import/profiles.ts';
import { paymentsGrid, serial, type PaymentLine } from '../../support/grids.ts';

const line = (
  invoice: string,
  date: string,
  author: string,
  extra: Partial<PaymentLine> = {},
): PaymentLine => ({ invoice, date, author, group: 'СР1', ...extra });

describe('the paid invoices (IMPORT_FORMATS §2)', () => {
  it('one invoice = one payment on its first line, «Академия» not counted', () => {
    const p = parsePayments(
      paymentsGrid([
        line('Счёт-7', '2026-10-05', 'Ершова Мария'),
        line('Счёт-7', '2026-10-05', 'Ершова Мария'),
        line('Счёт-8', '2026-10-05', 'Ершова Мария'),
        line('Счёт-9', '2026-10-05', 'Ершова Мария', { product: 'Академия' }),
        line('Счёт-10', '2026-10-06', 'Фёдоров Иван', { group: 'СР5' }),
      ]),
      DEFAULT_PAYMENTS,
    );
    expect(p.profileId).toBe('payments');
    expect(p.metrics).toEqual(['pay']);
    expect(p.rows).toEqual([
      { name: 'Ершова Мария', group: 'СР1', date: '2026-10-05', values: { pay: 2 } },
      { name: 'Фёдоров Иван', group: 'СР5', date: '2026-10-06', values: { pay: 1 } },
    ]);
    expect(p.groups).toEqual(['СР1', 'СР5']);
    expect(p.warnings).toEqual([]);
  });

  it('one invoice, several lines with different authors or dates — counted once, warned', () => {
    const p = parsePayments(
      paymentsGrid([
        line('Счёт-7', '2026-10-05', 'Ершова Мария'),
        line('Счёт-7', '2026-10-06', 'Белова Анна'),
        line('Счёт-7', '2026-10-05', 'Ершова Мария'),
      ]),
      DEFAULT_PAYMENTS,
    );
    expect(p.rows).toEqual([
      { name: 'Ершова Мария', group: 'СР1', date: '2026-10-05', values: { pay: 1 } },
    ]);
    expect(p.warnings).toEqual([expect.stringMatching(/1 сч.т.*разн/)]);
  });

  it('skips the final sum row and lines without a date or an author', () => {
    const grid = paymentsGrid([line('Счёт-7', '2026-10-05', 'Ершова Мария')]);
    grid.splice(
      2,
      0,
      ['PIN', 'Счёт-1', '', 'СР1', 'Ершова Мария'],
      ['PIN', 'Счёт-2', serial('2026-10-05'), 'СР1', ''],
    );
    const p = parsePayments(grid, DEFAULT_PAYMENTS);
    expect(p.rows).toEqual([
      { name: 'Ершова Мария', group: 'СР1', date: '2026-10-05', values: { pay: 1 } },
    ]);
  });

  it('the period runs from the first to the last payment date, dates as numbers or text', () => {
    const p = parsePayments(
      paymentsGrid([
        line('Счёт-1', '2026-10-07', 'Ершова Мария'),
        line('Счёт-2', '2026-10-05', 'Ершова Мария'),
        { invoice: 'Счёт-3', date: '06.10.2026', author: 'Белова Анна', group: 'СР1' },
      ]),
      DEFAULT_PAYMENTS,
    );
    expect(p.period).toEqual(['2026-10-05', '2026-10-07']);
    expect(p.rows.map((r) => r.date)).toContain('2026-10-06');
  });

  it('never keeps clients, INN, sums or invoice numbers', () => {
    const json = JSON.stringify(
      parsePayments(paymentsGrid([line('Счёт-7', '2026-10-05', 'Ершова Мария')]), DEFAULT_PAYMENTS),
    );
    expect(json).not.toMatch(/ИНН-ТЕСТ|Тестовый клиент|123456|Счёт-7/);
  });

  it('a missing column is an error naming it', () => {
    const grid = paymentsGrid([line('Счёт-7', '2026-10-05', 'Ершова Мария')]);
    (grid[0] as unknown[])[2] = 'Дата платежа';
    expect(() => parsePayments(grid, DEFAULT_PAYMENTS)).toThrow(/«Дата оплаты»/);
  });
});
