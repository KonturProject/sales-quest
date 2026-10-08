import { z } from 'zod';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from './schemas/common.ts';
import {
  AdjustmentSchema,
  ImportLogSchema,
  MetricRecordSchema,
  type Adjustment,
  type ImportLog,
  type MetricRecord,
} from './schemas/records.ts';
import { parseSeasonConfig, type SeasonConfig } from './schemas/season.ts';

/** The encrypted files of a season (§13.4, D-33). */
export const SEASON_FILES = ['config', 'records', 'adjustments', 'imports'] as const;
export type SeasonFile = (typeof SEASON_FILES)[number];

/** Paths inside `data/`. */
export const dataPath = {
  version: 'version.json',
  index: 'seasons/index.json',
  season: (seasonId: string, file: SeasonFile) => `seasons/${seasonId}/${file}.enc.json`,
};

const Base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'не base64');
const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'не отпечаток SHA-256');

/** More would let a broken or hostile file grind a weak laptop in PBKDF2 for minutes. */
export const MAX_KDF_ITERATIONS = 5_000_000;

/** `*.enc.json` (SEC-6, D-33). The iteration floor for published data is checked by `check:data`. */
export const EnvelopeSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal('AES-GCM'),
    kdf: z.literal('PBKDF2-SHA256'),
    iter: z.number().int().positive().max(MAX_KDF_ITERATIONS),
    salt: Base64,
    iv: Base64,
    ciphertext: Base64,
  })
  .strict();

/** `data/version.json` — open, no personal data; polled by every viewer (SYNC-1). */
export const VersionSchema = z.object({
  schemaVersion: z.literal(1),
  /** Fingerprint of all season files: changes with any of them. */
  rev: Hex64,
  seasonId: IdSchema,
  updatedAt: IsoDateTimeSchema,
  lastImportAt: IsoDateTimeSchema.nullable(),
  /** SHA-256 of each encrypted file as published — a client reloads only the changed ones. */
  files: z.object({ config: Hex64, records: Hex64, adjustments: Hex64, imports: Hex64 }),
});
export type Version = z.output<typeof VersionSchema>;

export const SeasonSummarySchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  status: z.enum(['draft', 'active', 'closed']),
  period: z.object({ start: IsoDateSchema, end: IsoDateSchema }),
});
export type SeasonSummary = z.output<typeof SeasonSummarySchema>;

/** `data/seasons/index.json` — open. */
export const SeasonIndexSchema = z.object({
  schemaVersion: z.literal(1),
  seasons: z.array(SeasonSummarySchema),
});

const RecordsFileSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(MetricRecordSchema),
});
const AdjustmentsFileSchema = z.object({
  schemaVersion: z.literal(1),
  adjustments: z.array(AdjustmentSchema),
});
const ImportsFileSchema = z.object({
  schemaVersion: z.literal(1),
  imports: z.array(ImportLogSchema),
});

export type SeasonFileContent = {
  config: SeasonConfig;
  records: MetricRecord[];
  adjustments: Adjustment[];
  imports: ImportLog[];
};

/**
 * Data that does not read, though the phrase is right: a damaged file, or files from two
 * publications while the site is mid-deploy. The viewer keeps what it has and looks again.
 */
export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

/** Data written by a newer site than the one running (DATA-15). */
export class DataVersionError extends Error {
  constructor() {
    super('данные новее этой версии сайта — обновите страницу');
    this.name = 'DataVersionError';
  }
}

const KNOWN_SCHEMA_VERSION = 1;

function checkSchemaVersion(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  const v = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v === 'number' && v > KNOWN_SCHEMA_VERSION) throw new DataVersionError();
}

/** The content of a decrypted season file, validated (DATA-15). */
export function parseSeasonFile<F extends SeasonFile>(file: F, value: unknown): SeasonFileContent[F] {
  checkSchemaVersion(value);
  switch (file) {
    case 'config':
      return parseSeasonConfig(value) as SeasonFileContent[F];
    case 'records':
      return RecordsFileSchema.parse(value).records as SeasonFileContent[F];
    case 'adjustments':
      return AdjustmentsFileSchema.parse(value).adjustments as SeasonFileContent[F];
    default:
      return ImportsFileSchema.parse(value).imports as SeasonFileContent[F];
  }
}

/** What a season file holds before encryption. */
export function seasonFileValue<F extends SeasonFile>(file: F, content: SeasonFileContent[F]): unknown {
  return file === 'config' ? content : { schemaVersion: 1, [file]: content };
}

export function parseVersion(text: string): Version {
  const value: unknown = JSON.parse(text);
  checkSchemaVersion(value);
  return VersionSchema.parse(value);
}

export function parseIndex(text: string): z.output<typeof SeasonIndexSchema> {
  const value: unknown = JSON.parse(text);
  checkSchemaVersion(value);
  return SeasonIndexSchema.parse(value);
}

/** SHA-256 of a file's text, hex. */
export async function fingerprint(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The data revision: a fingerprint of the files' fingerprints. */
export function revOf(files: Record<SeasonFile, string>): Promise<string> {
  return fingerprint(SEASON_FILES.map((f) => files[f]).join('\n'));
}

/** How data files are written: stable formatting, so fingerprints follow the content only. */
export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
