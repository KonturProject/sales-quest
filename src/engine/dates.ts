const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 of a calendar date `YYYY-MM-DD` (D-11); throws on anything else. */
export function toDayNumber(date: string): number {
  const match = DATE_RE.exec(date);
  const day = match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
    : Number.NaN;
  if (Number.isNaN(day) || fromDayNumber(day) !== date) throw new Error(`не дата: ${date}`);
  return day;
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** ISO weekday: 1 = Monday … 7 = Sunday (1970-01-01 was a Thursday). */
export function isoWeekday(date: string): number {
  return ((((toDayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = toDayNumber(from), last = toDayNumber(to); d <= last; d++)
    dates.push(fromDayNumber(d));
  return dates;
}

/** Calendar date of a local timestamp as written: `2026-10-06T00:30:00+03:00` → `2026-10-06` (D-11). */
export function dateOf(timestamp: string): string {
  const date = timestamp.slice(0, 10);
  toDayNumber(date);
  return date;
}
