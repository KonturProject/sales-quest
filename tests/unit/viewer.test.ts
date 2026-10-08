import { describe, expect, it } from 'vitest';
import { takePhrase } from '../../src/app/access.ts';
import { parseHash } from '../../src/app/router.ts';
import { createStore } from '../../src/app/store.ts';

describe('takePhrase (SEC-7)', () => {
  it('takes the phrase out of the link and keeps the rest', () => {
    expect(takePhrase(parseHash('#/debug?k=%D0%BA%D0%BE%D0%B4%201&date=2026-10-07'))).toEqual({
      phrase: 'код 1',
      route: { path: '/debug', query: { date: '2026-10-07' } },
    });
  });

  it('has no phrase without k or with an empty one', () => {
    expect(takePhrase(parseHash('#/')).phrase).toBeNull();
    expect(takePhrase(parseHash('#/?k=%20')).phrase).toBeNull();
  });
});

describe('createStore (D-31)', () => {
  it('notifies subscribers of changes only, until they leave', () => {
    const store = createStore({ n: 1 });
    let calls = 0;
    const leave = store.subscribe(() => (calls += 1));
    store.set({ n: 2 });
    store.set(store.get());
    expect([store.get().n, calls]).toEqual([2, 1]);
    leave();
    store.set({ n: 3 });
    expect(calls).toBe(1);
  });
});
