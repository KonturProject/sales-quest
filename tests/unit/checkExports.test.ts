import { describe, expect, it } from 'vitest';
import { maskedFileName } from '../../scripts/lib/exports.ts';

describe('check-exports prints counts, never a name (plan 2a, review 2a)', () => {
  it("masks the surname in the export's file name", () => {
    expect(maskedFileName('C:/work/Воронка по дням Петрова.xlsx')).toBe(
      'Воронка по дням <фамилия>.xlsx',
    );
    expect(maskedFileName('/tmp/funnel.xlsx')).toBe('funnel.xlsx');
  });
});
