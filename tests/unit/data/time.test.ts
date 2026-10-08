import { describe, expect, it } from 'vitest';
import { localDate, localTimestamp } from '../../../src/data/time.ts';

/** A moment as seen from a time zone `offsetMin` minutes east of UTC. */
function seenFrom(utc: string, offsetMin: number): Date {
  const date = new Date(utc);
  date.getTimezoneOffset = () => -offsetMin;
  return date;
}

describe('localTimestamp (D-11)', () => {
  it('writes the local time with its offset', () => {
    expect(localTimestamp(seenFrom('2026-10-08T16:05:09Z', 180))).toBe('2026-10-08T19:05:09+03:00');
    expect(localTimestamp(seenFrom('2026-10-08T16:05:09Z', -330))).toBe(
      '2026-10-08T10:35:09-05:30',
    );
    expect(localTimestamp(seenFrom('2026-10-08T16:05:09Z', 0))).toBe('2026-10-08T16:05:09+00:00');
  });

  it('gives the local date: 00:30 in Moscow is already the next day', () => {
    expect(localDate(seenFrom('2026-10-07T21:30:00Z', 180))).toBe('2026-10-08');
  });
});
