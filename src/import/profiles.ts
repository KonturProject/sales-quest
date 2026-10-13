import type {
  FunnelProfile,
  ImportProfile,
  IntradayProfile,
  PaymentsProfile,
} from '../data/schemas/importProfiles.ts';

export type { FunnelProfile, ImportProfile, IntradayProfile, PaymentsProfile };
export { ImportProfileSchema } from '../data/schemas/importProfiles.ts';

/** The funnel by days, as the author's export has it (`docs/IMPORT_FORMATS.md` §1, D-22). */
export const DEFAULT_FUNNEL: FunnelProfile = {
  id: 'funnel',
  kind: 'matrix',
  title: 'Воронка по дням',
  sheet: 'ВОРОНКА Первичная кампания',
  blockRow: 4,
  subBlockRow: 5,
  dateRow: 6,
  totalRow: 7,
  firstDataRow: 9,
  groupFlag: 'B',
  employeeFlag: 'C',
  nameColumn: 'G',
  groupCode: 'СР\\d+',
  metrics: [
    { metricId: 'inv6', block: 'Качественные счета', subBlock: 'Качественные счета, шт.' },
    { metricId: 'inv20', block: 'Разговоры от 20 минут', subBlock: 'Разговоры от 20 минут, шт.' },
  ],
};

/** The paid invoices (`docs/IMPORT_FORMATS.md` §2, D-22). */
export const DEFAULT_PAYMENTS: PaymentsProfile = {
  id: 'payments',
  kind: 'events',
  title: 'Оплаченные счета',
  sheet: 0,
  headerRow: 1,
  columns: {
    date: 'Дата оплаты',
    author: 'Автор',
    group: 'Группа',
    invoice: '№ счета',
    product: 'Тип головного продукта',
  },
  excludeProducts: ['Академия'],
  metricId: 'pay',
  groupCode: 'СР\\d+',
};

/** The intraday totals (`docs/IMPORT_FORMATS.md` §3, D-55): B — `inv6`, C — `inv20`, as the author's file. */
export const DEFAULT_INTRADAY: IntradayProfile = {
  id: 'intraday',
  kind: 'list',
  title: 'Промежуточные итоги',
  sheet: 0,
  nameColumn: 'A',
  groupCode: 'СР\\d+',
  metrics: [
    { column: 'B', metricId: 'inv6' },
    { column: 'C', metricId: 'inv20' },
  ],
};

export const DEFAULT_PROFILES: ImportProfile[] = [
  DEFAULT_FUNNEL,
  DEFAULT_PAYMENTS,
  DEFAULT_INTRADAY,
];

/**
 * The profiles an import uses: the config's, then every default one the config lacks by id (D-55). A
 * running game gets a new kind of export without a config change — viewers with older code read the
 * config with the kinds they know.
 */
export function profilesFor(configured: ImportProfile[]): ImportProfile[] {
  const own = new Set(configured.map((p) => p.id));
  return [...configured, ...DEFAULT_PROFILES.filter((p) => !own.has(p.id))];
}
