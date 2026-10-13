import type { Grid } from '../../src/import/grid.ts';

/**
 * Synthetic cell grids of the two real exports (`docs/IMPORT_FORMATS.md`), with fictional people:
 * what SheetJS gives for a sheet (`header: 1`), so the parsers are tested without files.
 */

/** Excel's serial number of a date (the 1900 system, as the exports have it). */
export function serial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** ISO week `YYYY.WW` of a date — the funnel's text in a week-total column. */
function isoWeek(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const year = date.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  const week =
    1 +
    Math.round(
      (date.getTime() - first.getTime()) / 86_400_000 / 7 - (((first.getUTCDay() + 6) % 7) - 3) / 7,
    );
  return `${year}.${String(week).padStart(2, '0')}`;
}

export type FunnelPerson = { name: string; days: Record<string, [number, number]> };
export type FunnelGroup = {
  code: string;
  name: string;
  people: FunnelPerson[];
  /** The group row's own numbers per date (to break the self-check); default — the people's sums. */
  totals?: Record<string, [number, number]>;
};

const G = 6; // column G: names
const FIRST_BLOCK = 7; // column H

/**
 * The funnel's matrix: rows 1–3 empty, row 4 block names (G — the month), row 5 sub-block names
 * (B «группа», C «сотр»), row 6 dates with a week total after every fifth, row 7 «Общий итог», row 8
 * «Названия строк», groups (B = 1) and employees (C = 1) from row 9, then a tail row of zeros.
 * Each block has the sub-block «<block>, шт.» and a second one, «Доля <block>», to be skipped.
 */
export function funnelGrid(opts: {
  dates: string[];
  groups: FunnelGroup[];
  /** An extra block before the needed ones: every column shifts (blocks are found by name). */
  extraBlockFirst?: boolean;
  /** Block names as written in row 4; default — the real ones. */
  blocks?: { inv6: string; inv20: string };
  /** Dates in row 6 as text `DD.MM.YYYY` instead of Excel numbers. */
  datesAsText?: boolean;
}): Grid {
  const names = opts.blocks ?? { inv6: 'Качественные счета', inv20: 'Разговоры от 20 минут' };
  // The date row of one sub-block: dates with a week total after every fifth.
  const subCols: (string | number)[] = [];
  opts.dates.forEach((d, i) => {
    subCols.push(
      opts.datesAsText ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : serial(d),
    );
    if (i % 5 === 4 || i === opts.dates.length - 1) subCols.push(isoWeek(d));
  });
  const width = subCols.length;
  type Block = { name: string; metric: 0 | 1 | null };
  const blocks: Block[] = [
    ...(opts.extraBlockFirst ? [{ name: 'Средний трафик', metric: null } as Block] : []),
    { name: names.inv20, metric: 1 },
    { name: 'Счета', metric: null },
    { name: names.inv6, metric: 0 },
  ];
  const rows: unknown[][] = [[], [], [], [], [], [], [], []];
  const set = (r: number, c: number, v: unknown) => {
    while (rows.length <= r) rows.push([]);
    const row = rows[r] as unknown[];
    while (row.length <= c) row.push('');
    row[c] = v;
  };
  set(3, G, 'Сентябрь.2026');
  set(4, 1, 'группа');
  set(4, 2, 'сотр');
  set(6, G, 'Общий итог');
  set(7, G, 'Названия строк');

  // Every data row: values per date for the metric of each block's first sub-block.
  type Line = {
    flags: [number, number, number];
    name: string;
    byDate: Record<string, [number, number]>;
  };
  const lines: Line[] = [];
  const total: Record<string, [number, number]> = {};
  for (const group of opts.groups) {
    const sums: Record<string, [number, number]> = {};
    for (const p of group.people)
      for (const [d, [a, b]] of Object.entries(p.days)) {
        const s = (sums[d] ??= [0, 0]);
        s[0] += a;
        s[1] += b;
      }
    const own = group.totals ?? sums;
    for (const [d, [a, b]] of Object.entries(own)) {
      const t = (total[d] ??= [0, 0]);
      t[0] += a;
      t[1] += b;
    }
    lines.push({ flags: [0, 1, 0], name: group.name, byDate: own });
    for (const p of group.people) lines.push({ flags: [0, 0, 1], name: p.name, byDate: p.days });
  }

  let col = FIRST_BLOCK;
  for (const block of blocks) {
    set(3, col, block.name);
    for (const [sub, isCount] of [
      [`${block.name}, шт.`, true],
      [`Доля ${block.name.toLowerCase()}`, false],
    ] as const) {
      set(4, col, sub);
      subCols.forEach((v, i) => set(5, col + i, v));
      opts.dates.forEach((d) => {
        const at =
          col +
          subCols.indexOf(
            opts.datesAsText ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : serial(d),
          );
        const value = (byDate: Record<string, [number, number]>) =>
          block.metric === null ? 7 : isCount ? (byDate[d]?.[block.metric] ?? '') : 0.5;
        set(6, at, value(total));
        lines.forEach((line, i) => set(8 + i, at, value(line.byDate) || ''));
      });
      col += width;
    }
  }
  lines.forEach((line, i) => {
    line.flags.forEach((f, c) => set(8 + i, c, f));
    set(8 + i, G, line.name);
  });
  rows.push([0, 0, 0, '', '', '', '']);
  return rows;
}

export type PaymentLine = {
  invoice: string;
  date: string | number;
  author: string;
  group: string;
  product?: string;
};

export const PAYMENT_HEADERS = [
  'Пин',
  '№ счета',
  'Дата оплаты',
  'Группа',
  'Автор',
  'Клиент',
  'ИНН',
  'Издание',
  'Головной продукт',
  'Предложение',
  'Тип головного продукта',
  'Дата продажи',
  'К-во',
  'Подписка с',
  'Подписка по',
  'Сумма',
  'Статус новизны',
  'Блокировка содержимого',
  'Период последней предыдущей подписки',
  'Категория подписки',
  'Состояние активной подписки',
];

/** The paid invoices: row 1 headers, one line per invoice item, the final «Сумма заказа» row. */
export function paymentsGrid(lines: PaymentLine[]): Grid {
  const rows: unknown[][] = [PAYMENT_HEADERS];
  for (const l of lines)
    rows.push([
      'PIN-1',
      l.invoice,
      // An ISO date becomes Excel's number, as in the export; other text stays text.
      typeof l.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.date) ? serial(l.date) : l.date,
      l.group,
      l.author,
      'ООО Тестовый клиент',
      'ИНН-ТЕСТ',
      'Издание',
      'Продукт',
      'Предложение',
      l.product ?? 'Основной',
      '',
      1,
      '',
      '',
      123456,
      'Новая',
      '',
      '',
      '',
      '',
    ]);
  rows.push([
    'Сумма заказа',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    123456 * lines.length,
  ]);
  rows.push([]);
  return rows;
}

export type IntradayPerson = { name: string; inv6?: number | string; inv20?: number | string };
export type IntradayGroup = {
  name: string;
  people: IntradayPerson[];
  /** The group row's own B and C (a total the author may add later); default — empty. */
  total?: [number, number];
};

/**
 * The intraday totals «Промежуточные итоги» (D-55): no header row; a group's row (its name with the code
 * inside, B and C empty), then its operators with `inv6` in B and `inv20` in C; an empty cell is ''.
 */
export function intradayGrid(groups: IntradayGroup[]): Grid {
  const rows: unknown[][] = [];
  for (const g of groups) {
    rows.push([g.name, g.total?.[0] ?? '', g.total?.[1] ?? '']);
    for (const p of g.people) rows.push([p.name, p.inv6 ?? '', p.inv20 ?? '']);
  }
  return rows;
}
