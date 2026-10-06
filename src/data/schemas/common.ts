import { z } from 'zod';

/** Calendar date `YYYY-MM-DD`, no time zone (D-11). */
export const IsoDateSchema = z.iso.date();

/** Timestamp with an offset in the author's local time, e.g. `2026-10-06T14:05:00+03:00`. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** Stable machine id: latin letters, digits, `_` and `-`. */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'id: латиница, цифры, _ и -, не длиннее 64 символов');

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'цвет в формате #RRGGBB');
