/**
 * Local timestamps with a numeric offset (D-11): `2026-10-08T19:05:00+03:00`. The engine takes
 * only the calendar date from "now", so it must be the local date, not the UTC one.
 */
export function localTimestamp(date: Date): string {
  const offset = -date.getTimezoneOffset(); // minutes east of UTC
  const shifted = new Date(date.getTime() + offset * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** The local calendar date, `YYYY-MM-DD`. */
export function localDate(date: Date): string {
  return localTimestamp(date).slice(0, 10);
}
