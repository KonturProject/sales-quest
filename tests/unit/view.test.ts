import { describe, expect, it } from 'vitest';
import { chooseView, parseView, readView, storeView } from '../../src/app/view.ts';

describe('3D or the 2D scheme (GFX-6, D-45)', () => {
  it('takes the forced view, then the chosen one, else 3D; without WebGL always 2D', () => {
    expect(chooseView({ forced: null, chosen: null, webgl: true })).toBe('3d');
    expect(chooseView({ forced: null, chosen: '2d', webgl: true })).toBe('2d');
    expect(chooseView({ forced: '3d', chosen: '2d', webgl: true })).toBe('3d');
    expect(chooseView({ forced: '3d', chosen: '3d', webgl: false })).toBe('2d');
    expect([parseView('2d'), parseView('3d'), parseView('tv'), parseView(undefined)]).toEqual([
      '2d',
      '3d',
      null,
      null,
    ]);
  });

  it('remembers the choice when storage works, and lives without it', () => {
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    try {
      expect(readView()).toBeNull();
      storeView('2d');
      expect(readView()).toBe('2d');
      store.set('sq.view', 'nonsense');
      expect(readView()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(readView()).toBeNull();
      expect(() => storeView('3d')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
