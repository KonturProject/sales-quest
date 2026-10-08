import { describe, expect, it } from 'vitest';
import { PagesSource, StorageError } from '../../../src/data/storage.ts';

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(answer: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe('PagesSource (SYNC-1, DEP-4)', () => {
  it('asks for version.json past every cache and for season files by fingerprint', async () => {
    const { calls, fetchFn } = fakeFetch(() => Promise.resolve(new Response('{}')));
    const source = new PagesSource('/sales-quest/data/', fetchFn, () => 1234);
    await source.read('version.json', { fresh: true });
    await source.read('seasons/demo/records.enc.json', { fingerprint: 'ab12' });
    await source.read('seasons/demo/records.enc.json', { fingerprint: 'ab12', reload: true });
    expect(calls.map((c) => [c.url, c.init?.cache])).toEqual([
      ['/sales-quest/data/version.json?t=1234', 'no-store'],
      ['/sales-quest/data/seasons/demo/records.enc.json?v=ab12', undefined],
      ['/sales-quest/data/seasons/demo/records.enc.json?v=ab12', 'reload'],
    ]);
    expect(calls.every((c) => c.init?.signal instanceof AbortSignal)).toBe(true);
  });

  it('turns network errors, HTTP errors and broken bodies into StorageError', async () => {
    const offline = new PagesSource('/d/', fakeFetch(() => Promise.reject(new TypeError('down'))).fetchFn);
    await expect(offline.read('version.json', { fresh: true })).rejects.toEqual(
      new StorageError('version.json', null),
    );
    const missing = new PagesSource(
      '/d/',
      fakeFetch(() => Promise.resolve(new Response('', { status: 404 }))).fetchFn,
    );
    await expect(missing.read('version.json', { fresh: true })).rejects.toMatchObject({
      status: 404,
    });
    const broken = new Response('{}');
    broken.text = () => Promise.reject(new TypeError('cut'));
    const cut = new PagesSource('/d/', fakeFetch(() => Promise.resolve(broken)).fetchFn);
    await expect(cut.read('version.json', { fresh: true })).rejects.toBeInstanceOf(StorageError);
  });
});
