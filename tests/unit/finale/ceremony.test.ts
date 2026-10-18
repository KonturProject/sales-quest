import { describe, expect, it } from 'vitest';
import { CEREMONY_MS, STEPS, phaseAt, type Step } from '../../../src/finale/ceremony.ts';
import { readFinaleSeen, writeFinaleSeen } from '../../../src/finale/seen.ts';

const counts: Record<Step, number> = { end: 1, best: 6, achievements: 4, top: 3, podium: 3 };

describe('the ceremony (D-59)', () => {
  it('the steps follow in order and end at a minute', () => {
    expect(STEPS.map((s) => s.step)).toEqual(['end', 'best', 'achievements', 'top', 'podium']);
    expect(CEREMONY_MS).toBe(56_000);
    expect(phaseAt(0, counts)?.step).toBe('end');
    expect(phaseAt(10_000, counts)?.step).toBe('best');
    expect(phaseAt(10_000, counts)?.index).toBe(1);
    expect(phaseAt(55_999, counts)?.step).toBe('podium');
    expect(phaseAt(56_000, counts)).toBeNull();
    expect(phaseAt(90_000, counts)).toBeNull();
  });

  it('items appear one by one and stop at the count', () => {
    // «best» runs 10 000…22 000 ms: six cards over its first 60 %.
    expect(phaseAt(10_000, counts)?.shown).toBe(1);
    expect(phaseAt(10_000 + 12_000 * 0.3, counts)?.shown).toBe(4);
    expect(phaseAt(10_000 + 12_000 * 0.6, counts)?.shown).toBe(6);
    expect(phaseAt(21_999, counts)?.shown).toBe(6);
    expect(phaseAt(10_000, { ...counts, best: 0 })?.shown).toBe(0);
  });
});

describe('the ceremony this browser played (D-59)', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };
  const at1 = '2026-10-26T13:00:00+03:00';
  const at2 = '2026-10-26T15:30:00+03:00';

  it('the memory: a played closing is remembered', () => {
    const store = memory();
    expect(readFinaleSeen('s', store)).toBeNull();
    writeFinaleSeen('s', at1, store);
    expect(readFinaleSeen('s', store)).toBe(at1);
    writeFinaleSeen('next', at2, store);
    expect(readFinaleSeen('s', store)).toBeNull();
    expect(readFinaleSeen('next', store)).toBe(at2);
  });

  it('a new closing plays again', () => {
    const store = memory();
    writeFinaleSeen('s', at1, store);
    expect(readFinaleSeen('s', store)).not.toBe(at2);
  });

  it('no storage — nothing remembered, no exception', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeFinaleSeen('s', at1, broken)).not.toThrow();
    expect(readFinaleSeen('s', broken)).toBeNull();
    expect(readFinaleSeen('s', null)).toBeNull();
  });
});
