import { describe, expect, it } from 'vitest';
import { collectInitialJs, toDistPath } from '../../scripts/lib/size.ts';

describe('collectInitialJs', () => {
  it('finds module scripts and modulepreload links in any attribute order', () => {
    const html = `
      <script type="module" crossorigin src="/sales-quest/assets/index-a1.js"></script>
      <link crossorigin href="/sales-quest/assets/vendor-b2.js" rel="modulepreload">
      <script src="/sales-quest/assets/late-c3.js" type="module"></script>`;
    expect(collectInitialJs(html)).toEqual([
      '/sales-quest/assets/index-a1.js',
      '/sales-quest/assets/vendor-b2.js',
      '/sales-quest/assets/late-c3.js',
    ]);
  });

  it('ignores stylesheets, classic scripts and duplicates', () => {
    const html = `
      <link rel="stylesheet" href="/sales-quest/assets/index.css">
      <script src="/sales-quest/legacy.js"></script>
      <script type="module" src="/sales-quest/assets/index-a1.js"></script>
      <link rel="modulepreload" href="/sales-quest/assets/index-a1.js">`;
    expect(collectInitialJs(html)).toEqual(['/sales-quest/assets/index-a1.js']);
  });
});

describe('toDistPath', () => {
  it('strips the site base', () => {
    expect(toDistPath('/sales-quest/assets/index-a1.js', '/sales-quest/')).toBe(
      'assets/index-a1.js',
    );
  });

  it('rejects a URL outside the base', () => {
    expect(() => toDistPath('/other/x.js', '/sales-quest/')).toThrow('outside the site base');
  });
});
