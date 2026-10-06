import { z } from 'zod';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from './common.ts';

/** records.enc.json: one manager-day (or a running-total snapshot, DATA-6) of metric values. */
export const MetricRecordSchema = z.object({
  managerId: IdSchema,
  date: IsoDateSchema,
  kind: z.enum(['daily', 'snapshot']),
  values: z.record(z.string(), z.number().min(0)),
  importId: z.string().min(1),
});
export type MetricRecord = z.output<typeof MetricRecordSchema>;

const base = {
  id: z.string().min(1),
  reason: z.string().min(1),
  by: z.string().min(1),
  at: IsoDateTimeSchema,
  revoked: z
    .object({ by: z.string().min(1), at: IsoDateTimeSchema, reason: z.string().min(1) })
    .optional(),
};

/** adjustments.enc.json: admin actions applied on top of the computed result (ADM-1). */
export const AdjustmentSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('team_steps'), teamId: IdSchema, value: z.number().int() }),
  /** `value` — the computed position removed by the reset (D-17). */
  z.object({
    ...base,
    type: z.literal('team_reset'),
    teamId: IdSchema,
    value: z.number().int().min(0),
  }),
  z.object({
    ...base,
    type: z.literal('season_reset'),
    value: z.record(z.string(), z.number().int().min(0)),
  }),
  z.object({ ...base, type: z.literal('manager_points'), managerId: IdSchema, value: z.number() }),
  z.object({
    ...base,
    type: z.literal('grant_achievement'),
    achievementId: IdSchema,
    managerId: IdSchema.optional(),
    teamId: IdSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('revoke_achievement'),
    achievementId: IdSchema,
    managerId: IdSchema.optional(),
    teamId: IdSchema.optional(),
  }),
  /** Audit only: weights live in the config, the engine ignores this record. */
  z.object({
    ...base,
    type: z.literal('weights_change'),
    value: z.record(z.string(), z.number().min(0)),
  }),
]);
export type Adjustment = z.output<typeof AdjustmentSchema>;

/** imports.enc.json: one entry per import (DATA-8). */
export const ImportLogSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  profileId: z.string().min(1),
  rows: z.number().int().min(0),
  matched: z.number().int().min(0),
  unmatched: z.number().int().min(0),
  dateRange: z.tuple([IsoDateSchema, IsoDateSchema]),
  by: z.string().min(1),
  at: IsoDateTimeSchema,
  warnings: z.array(z.string()),
});
export type ImportLog = z.output<typeof ImportLogSchema>;
