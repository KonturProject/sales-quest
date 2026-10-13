import { describe, expect, it } from 'vitest';
import { countAt, nextStep, stepLeftText } from '../../src/hud/cards.ts';

const track = { trackLength: 20, maxPosition: 30 };
const plan = { progressMode: 'plan_percent' as const, pointsPerStep: undefined };

describe('«до шага» on the card (D-56)', () => {
  it('the share of the way to the next cell from the data, and the points left', () => {
    // A plan of 100 points over 20 cells: 5 points a cell; 12 points — 2 cells and 2 of 5.
    const s = nextStep({ points: 12, targetPoints: 100, position: 2 }, plan, track);
    expect(s?.share).toBeCloseTo(0.4);
    expect(s?.left).toBeCloseTo(3);
    expect(nextStep({ points: 10, targetPoints: 100, position: 2 }, plan, track)).toEqual({
      share: 0,
      left: 5,
    });
  });

  it('in the absolute mode by the points of a step', () => {
    const absolute = { progressMode: 'absolute' as const, pointsPerStep: 10 };
    const s = nextStep({ points: 25, targetPoints: 100, position: 2 }, absolute, track);
    expect(s?.share).toBeCloseTo(0.5);
    expect(s?.left).toBeCloseTo(5);
  });

  it('none at the end of the overflow zone or without a plan', () => {
    expect(nextStep({ points: 400, targetPoints: 100, position: 30 }, plan, track)).toBeNull();
    expect(nextStep({ points: 0, targetPoints: 0, position: 0 }, plan, track)).toBeNull();
  });

  it('the points left read as a whole number, at least 1', () => {
    expect(stepLeftText(3)).toBe('3');
    expect(stepLeftText(0.2)).toBe('1');
    expect(stepLeftText(1234.4)).toBe((1235).toLocaleString('ru-RU'));
  });
});

describe('counting up (D-56)', () => {
  it('from «было» to «стало», easing out; before the start it shows «было»', () => {
    expect(countAt(380, 392, null)).toBe(380);
    expect(countAt(380, 392, 0)).toBe(380);
    expect(countAt(380, 392, 1500)).toBe(392);
    expect(countAt(380, 392, 99_999)).toBe(392);
    const mid = countAt(380, 392, 750);
    expect(mid).toBeGreaterThan(386);
    expect(mid).toBeLessThan(392);
  });
});
