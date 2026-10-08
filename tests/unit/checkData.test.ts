import { beforeAll, describe, expect, it } from 'vitest';
import { serialize } from '../../src/data/files.ts';
import { sealSeason, seasonIndexText } from '../../src/data/seal.ts';
import { checkDataTree, scanTrackedFiles } from '../../scripts/lib/checkData.ts';
import { at, daily, makeConfig, manager } from '../support/builders.ts';

const index = seasonIndexText([
  {
    id: 'test-season',
    title: 'Тест',
    status: 'active',
    period: { start: '2026-10-05', end: '2026-10-18' },
  },
]);

let good: Map<string, string>;
beforeAll(async () => {
  const input = {
    config: makeConfig({ managers: [manager('a', 't1')] }),
    records: [daily('a', '2026-10-06', { pay: 1 })],
    adjustments: [],
    imports: [],
  };
  good = await sealSeason(input, 'p', { updatedAt: at('2026-10-08'), iterations: 100_000 });
  good.set('seasons/index.json', index);
});

const records = 'seasons/test-season/records.enc.json';
const withFile = (path: string, text: string) => new Map([...good, [path, text]]);

describe('checkDataTree (D-34)', () => {
  it('accepts a sealed tree and an empty one', async () => {
    expect(await checkDataTree(good)).toEqual([]);
    expect(await checkDataTree(new Map())).toEqual([]);
  });

  it('refuses open JSON under an .enc.json name', async () => {
    const plain = serialize({ schemaVersion: 1, records: [] });
    const problems = await checkDataTree(withFile(records, plain));
    expect(problems).toContain(
      `data/${records}: не шифр-конверт {v, alg, kdf, iter, salt, iv, ciphertext} (SEC-6)`,
    );
    expect(problems.some((p) => p.includes('отпечаток не совпадает'))).toBe(true);
  });

  it('refuses a weak key derivation', async () => {
    const envelope = JSON.parse(good.get(records) ?? '') as Record<string, unknown>;
    const problems = await checkDataTree(withFile(records, serialize({ ...envelope, iter: 1000 })));
    expect(problems).toContain(
      `data/${records}: ключ выводится за 1000 итераций, нужно не меньше 100000`,
    );
  });

  it('refuses stray files and missing pieces', async () => {
    expect(await checkDataTree(withFile('seasons/test-season/names.json', '{}'))).toEqual([
      'data/seasons/test-season/names.json: лишний файл: в data/ лежат только version.json, seasons/index.json и *.enc.json игр',
    ]);
    const noVersion = new Map(good);
    noVersion.delete('version.json');
    expect(await checkDataTree(noVersion)).toEqual(['data/version.json: нет файла, а данные есть']);
    const noConfig = new Map(good);
    noConfig.delete('seasons/test-season/config.enc.json');
    expect(await checkDataTree(noConfig)).toEqual([
      'data/seasons/test-season/config.enc.json: нет файла игры test-season, на которую указывает version.json',
      'data/seasons/index.json: игра test-season в списке, но её файлов нет',
    ]);
  });
});

describe('scanTrackedFiles (D-34)', () => {
  it('applies the hook rules to every tracked file', () => {
    const token = ['ghp', '_', 'a'.repeat(36)].join('');
    expect(
      scanTrackedFiles([
        { path: 'src/ok.ts', text: 'export {};' },
        { path: 'notes.txt', text: `token ${token}` },
        { path: 'export.xlsx', text: null },
        { path: 'tests/fixtures/funnel.xlsx', text: null },
      ]),
    ).toEqual([
      'export.xlsx: исходные таблицы не коммитятся, только синтетические фикстуры в tests/fixtures/ (SEC-10)',
      'notes.txt: похоже на GitHub-токен — токены не коммитятся (SEC-2)',
    ]);
  });
});
