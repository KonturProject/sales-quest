import { beforeAll, describe, expect, it } from 'vitest';
import { decryptJson, type Envelope } from '../../../src/data/crypto.ts';
import {
  DataVersionError,
  EnvelopeSchema,
  SEASON_FILES,
  dataPath,
  fingerprint,
  parseIndex,
  parseSeasonFile,
  parseVersion,
  revOf,
} from '../../../src/data/files.ts';
import { sealSeason, seasonIndexText } from '../../../src/data/seal.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import {
  at,
  daily,
  importLog,
  makeConfig,
  manager,
  teamSteps,
} from '../../support/builders.ts';

const input: EngineInput = {
  config: makeConfig({ managers: [manager('a', 't1'), manager('b', 't2')] }),
  records: [daily('a', '2026-10-06', { pay: 1 }), daily('b', '2026-10-07', { inv6: 4 })],
  adjustments: [teamSteps('s1', 't1', 2, at('2026-10-07'))],
  imports: [importLog('i1', at('2026-10-07', '09:00')), importLog('i2', at('2026-10-08', '09:00'))],
};

let sealed: Map<string, string>;
beforeAll(async () => {
  sealed = await sealSeason(input, 'фраза', { updatedAt: at('2026-10-08'), iterations: 1000 });
});

const envelopeOf = (file: (typeof SEASON_FILES)[number]) =>
  EnvelopeSchema.parse(JSON.parse(sealed.get(dataPath.season('test-season', file)) ?? ''));

describe('sealSeason (D-33)', () => {
  it('writes four encrypted files and version.json', () => {
    expect([...sealed.keys()].sort()).toEqual([
      'seasons/test-season/adjustments.enc.json',
      'seasons/test-season/config.enc.json',
      'seasons/test-season/imports.enc.json',
      'seasons/test-season/records.enc.json',
      'version.json',
    ]);
  });

  it('round-trips every file through the file schemas', async () => {
    const back = {
      config: parseSeasonFile('config', await decryptJson(envelopeOf('config'), 'фраза')),
      records: parseSeasonFile('records', await decryptJson(envelopeOf('records'), 'фраза')),
      adjustments: parseSeasonFile(
        'adjustments',
        await decryptJson(envelopeOf('adjustments'), 'фраза'),
      ),
      imports: parseSeasonFile('imports', await decryptJson(envelopeOf('imports'), 'фраза')),
    };
    expect(back).toEqual(input);
  });

  it('shares one salt between the files of a write (D-12)', () => {
    expect(new Set(SEASON_FILES.map((f) => envelopeOf(f).salt)).size).toBe(1);
  });

  it('fingerprints the files in version.json', async () => {
    const version = parseVersion(sealed.get('version.json') ?? '');
    for (const file of SEASON_FILES)
      expect(version.files[file]).toBe(
        await fingerprint(sealed.get(dataPath.season('test-season', file)) ?? ''),
      );
    expect(version.rev).toBe(await revOf(version.files));
    expect([version.seasonId, version.updatedAt, version.lastImportAt]).toEqual([
      'test-season',
      at('2026-10-08'),
      at('2026-10-08', '09:00'),
    ]);
  });
});

describe('file schemas (DATA-15)', () => {
  it('refuses data newer than this site, with a clear message', () => {
    expect(() => parseSeasonFile('records', { schemaVersion: 2, records: [] })).toThrow(
      DataVersionError,
    );
    const version = JSON.parse(sealed.get('version.json') ?? '') as Record<string, unknown>;
    expect(() => parseVersion(JSON.stringify({ ...version, schemaVersion: 3 }))).toThrow(
      'данные новее этой версии сайта',
    );
  });

  it('does not take plain JSON for an envelope', () => {
    expect(EnvelopeSchema.safeParse({ schemaVersion: 1, records: [] }).success).toBe(false);
    const envelope: Envelope = envelopeOf('records');
    expect(EnvelopeSchema.safeParse({ ...envelope, ciphertext: 'не base64!' }).success).toBe(false);
  });

  it('reads the season index', () => {
    const text = seasonIndexText([
      {
        id: 'demo',
        title: 'Демо',
        status: 'active',
        period: { start: '2026-10-05', end: '2026-10-18' },
      },
    ]);
    expect(parseIndex(text).seasons[0]?.id).toBe('demo');
  });

  it('fingerprints text as SHA-256 hex', async () => {
    expect(await fingerprint('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
