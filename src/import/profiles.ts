import type {
  FunnelProfile,
  ImportProfile,
  PaymentsProfile,
} from '../data/schemas/importProfiles.ts';

export type { FunnelProfile, ImportProfile, PaymentsProfile };
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

export const DEFAULT_PROFILES: ImportProfile[] = [DEFAULT_FUNNEL, DEFAULT_PAYMENTS];
