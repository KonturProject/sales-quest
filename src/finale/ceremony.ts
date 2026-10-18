/**
 * The ceremony of the finale (D-59): five steps on one clock, the winner last. Pure — the HUD reads it from
 * the run clock (D-56), so a remounted page continues where it was and a hidden tab waits.
 */

export type Step = 'end' | 'best' | 'achievements' | 'top' | 'podium';

export const STEPS: readonly { step: Step; ms: number }[] = [
  { step: 'end', ms: 10_000 },
  { step: 'best', ms: 12_000 },
  { step: 'achievements', ms: 10_000 },
  { step: 'top', ms: 10_000 },
  { step: 'podium', ms: 14_000 },
];

export const CEREMONY_MS = STEPS.reduce((s, x) => s + x.ms, 0);

/** Items of a step appear evenly over this share of it; the rest of the step they stand. */
const REVEAL_SHARE = 0.6;

/**
 * Where the ceremony is: the step, its index and how many of its items are on view (cards one by one; the
 * view maps `shown` of «top» and «podium» to places from the last). Null at and after the end.
 */
export type Phase = { step: Step; index: number; shown: number };

export function phaseAt(ms: number, counts: Record<Step, number>): Phase | null {
  let start = 0;
  for (const [index, { step, ms: length }] of STEPS.entries()) {
    if (ms < start + length) {
      const count = counts[step];
      const every = (length * REVEAL_SHARE) / Math.max(1, count);
      const shown = count === 0 ? 0 : Math.min(count, 1 + Math.floor((ms - start) / every));
      return { step, index, shown };
    }
    start += length;
  }
  return null;
}
