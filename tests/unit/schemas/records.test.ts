import { describe, expect, it } from 'vitest';
import {
  AdjustmentSchema,
  ImportLogSchema,
  MetricRecordSchema,
} from '../../../src/data/schemas/records.ts';
import {
  at,
  daily,
  importLog,
  managerPoints,
  seasonReset,
  teamReset,
  teamSteps,
} from '../../support/builders.ts';

describe('AdjustmentSchema', () => {
  it('accepts every adjustment the engine applies', () => {
    for (const a of [
      teamSteps('a1', 't1', -2, at('2026-10-06')),
      teamReset('a2', 't1', 7, at('2026-10-06')),
      seasonReset('a3', { t1: 7, t2: 3 }, at('2026-10-06')),
      managerPoints('a4', 'm1', 15, at('2026-10-06')),
    ])
      expect(AdjustmentSchema.parse(a)).toEqual(a);
  });

  it('rejects a negative reset position and an unknown type', () => {
    expect(AdjustmentSchema.safeParse(teamReset('a', 't1', -1, at('2026-10-06'))).success).toBe(
      false,
    );
    expect(
      AdjustmentSchema.safeParse({ ...teamSteps('a', 't1', 1, at('2026-10-06')), type: 'teleport' })
        .success,
    ).toBe(false);
  });

  it('requires a timestamp with an offset (D-11)', () => {
    const a = { ...teamSteps('a', 't1', 1, at('2026-10-06')), at: '2026-10-06 10:00' };
    expect(AdjustmentSchema.safeParse(a).success).toBe(false);
  });

  it('rejects UTC "Z" timestamps: the calendar date must be the local one (D-11)', () => {
    // 00:30 in Moscow written as UTC would land on the previous day.
    const a = { ...teamSteps('a', 't1', 1, at('2026-10-06')), at: '2026-10-05T21:30:00Z' };
    expect(AdjustmentSchema.safeParse(a).success).toBe(false);
  });
});

describe('MetricRecordSchema', () => {
  it('accepts a daily record and rejects negative counts', () => {
    expect(MetricRecordSchema.parse(daily('m1', '2026-10-06', { pay: 2 }))).toEqual(
      daily('m1', '2026-10-06', { pay: 2 }),
    );
    expect(MetricRecordSchema.safeParse(daily('m1', '2026-10-06', { pay: -1 })).success).toBe(
      false,
    );
  });
});

describe('ImportLogSchema', () => {
  it('requires a SHA-256 of the file (DATA-8)', () => {
    expect(ImportLogSchema.parse(importLog('i1', at('2026-10-06')))).toEqual(
      importLog('i1', at('2026-10-06')),
    );
    expect(
      ImportLogSchema.safeParse({ ...importLog('i1', at('2026-10-06')), fileSha256: 'abc' })
        .success,
    ).toBe(false);
  });
});
