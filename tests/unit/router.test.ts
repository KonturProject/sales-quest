import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '../../src/app/router.ts';

describe('parseHash', () => {
  it('treats an empty hash as the map route', () => {
    expect(parseHash('')).toEqual({ path: '/', query: {} });
    expect(parseHash('#')).toEqual({ path: '/', query: {} });
    expect(parseHash('#/')).toEqual({ path: '/', query: {} });
  });

  it('reads the path', () => {
    expect(parseHash('#/leaderboard')).toEqual({ path: '/leaderboard', query: {} });
  });

  it('normalises missing and trailing slashes', () => {
    expect(parseHash('#admin/')).toEqual({ path: '/admin', query: {} });
  });

  it('reads the query, including a Cyrillic access phrase (SEC-7)', () => {
    expect(parseHash('#/?k=%D0%BA%D0%BE%D0%B4-42')).toEqual({ path: '/', query: { k: 'код-42' } });
  });

  it('decodes + as a space, as URLSearchParams does', () => {
    expect(parseHash('#/?k=a+b').query.k).toBe('a b');
  });
});

describe('formatHash', () => {
  it('round-trips through parseHash', () => {
    const route = { path: '/leaderboard', query: { week: '2', k: 'код 42' } };
    expect(parseHash(formatHash(route))).toEqual(route);
  });

  it('omits an empty query', () => {
    expect(formatHash({ path: '/' })).toBe('#/');
    expect(formatHash({ path: 'admin', query: {} })).toBe('#/admin');
  });
});
