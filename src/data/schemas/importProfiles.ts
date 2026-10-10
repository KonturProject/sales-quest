import { z } from 'zod';
import { IdSchema } from './common.ts';

/**
 * Import profiles in the season config (§9.2, D-19, plan 2a): where the numbers are in each kind of
 * export. A renamed block or sheet is fixed here, not in code (OQ-13). Rows are 1-based and columns
 * are letters, as the admin sees them in Excel.
 */

const Row = z.number().int().min(1);
const Letters = z.string().regex(/^[A-Z]{1,3}$/, 'колонка: буквы, например G');

/** The funnel: a matrix of blocks of days per employee (D-19). */
export const FunnelProfileSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('matrix'),
  title: z.string().min(1),
  sheet: z.string().min(1),
  blockRow: Row,
  subBlockRow: Row,
  dateRow: Row,
  /** The department's total («Общий итог»): the self-check sums the groups against it. */
  totalRow: Row,
  firstDataRow: Row,
  groupFlag: Letters,
  employeeFlag: Letters,
  nameColumn: Letters,
  /** The team's code in a group's name, a regular expression (`СР\d+`, D-21). */
  groupCode: z.string().min(1),
  metrics: z
    .array(
      z.object({ metricId: IdSchema, block: z.string().min(1), subBlock: z.string().min(1) }),
    )
    .min(1),
});

/** The paid invoices: one line per invoice item (events, §9.2). */
export const PaymentsProfileSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('events'),
  title: z.string().min(1),
  /** A sheet's name, or its index (0 — the first). */
  sheet: z.union([z.string().min(1), z.number().int().min(0)]),
  headerRow: Row,
  columns: z.object({
    date: z.string().min(1),
    author: z.string().min(1),
    group: z.string().min(1),
    invoice: z.string().min(1),
    product: z.string().min(1),
  }),
  /** Product types not counted (`Академия`, IMPORT_FORMATS §2). */
  excludeProducts: z.array(z.string()),
  metricId: IdSchema,
  groupCode: z.string().min(1),
});

export const ImportProfileSchema = z.discriminatedUnion('kind', [
  FunnelProfileSchema,
  PaymentsProfileSchema,
]);

export type FunnelProfile = z.output<typeof FunnelProfileSchema>;
export type PaymentsProfile = z.output<typeof PaymentsProfileSchema>;
export type ImportProfile = z.output<typeof ImportProfileSchema>;
