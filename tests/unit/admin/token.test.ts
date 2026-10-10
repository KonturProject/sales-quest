import { describe, expect, it } from 'vitest';
import { expiryWarning, forgetToken, readToken, writeToken } from '../../../src/admin/token.ts';

describe("the admin's GitHub token (SEC-2, SEC-3)", () => {
  it('lives in this browser only, and goes on «Выйти»', () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    try {
      expect(readToken()).toBeNull();
      writeToken('github_pat_test');
      expect(readToken()).toBe('github_pat_test');
      forgetToken();
      expect(readToken()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });

  it('works without storage', () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(readToken()).toBeNull();
      expect(() => {
        writeToken('x');
        forgetToken();
      }).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });

  it('warns 14 days before the token expires', () => {
    expect(expiryWarning('2026-10-20 10:00:00 +0300', '2026-10-10')).toBe(
      'ключ GitHub истекает через 10 дн. — создайте новый',
    );
    expect(expiryWarning('2026-10-10 10:00:00 UTC', '2026-10-10')).toBe(
      'ключ GitHub истекает сегодня — создайте новый',
    );
    expect(expiryWarning('2026-10-01 10:00:00 UTC', '2026-10-10')).toBe(
      'ключ GitHub истёк — создайте новый',
    );
    expect(expiryWarning('2026-11-30 10:00:00 UTC', '2026-10-10')).toBeNull();
    expect(expiryWarning(null, '2026-10-10')).toBeNull();
  });
});
