import { z } from 'zod';

/** Calendar date `YYYY-MM-DD`, no time zone (D-11). */
export const IsoDateSchema = z.iso.date();

/**
 * Timestamp in the author's local time with a numeric offset, e.g. `2026-10-06T14:05:00+03:00`.
 * UTC `Z` is refused: the engine takes the written calendar date (D-11), and 00:30 in Moscow
 * written as UTC would fall on the previous day.
 */
export const IsoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .regex(/[+-]\d{2}:\d{2}$/, 'время с часовым поясом, например 2026-10-06T14:05:00+03:00');

/** Stable machine id: latin letters, digits, `_` and `-`. */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'id: латиница, цифры, _ и -, не длиннее 64 символов');

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'цвет в формате #RRGGBB');
