import { describe, expect, it } from 'vitest';
import { DEMO_DATA, SITE_DATA, dataDirFor, dataDirs } from '../../scripts/lib/dataDirs.ts';

describe('which folder the site serves as data/ (D-32, plan 2a)', () => {
  it('a build publishes the game, the dev server shows the demo', () => {
    expect(dataDirFor('build', {})).toBe(SITE_DATA);
    expect(dataDirFor('serve', {})).toBe(DEMO_DATA);
    expect([SITE_DATA, DEMO_DATA]).toEqual(['data', 'tests/fixtures/demo-data']);
  });

  it('SQ_DATA_DIR overrides both — the e2e build reads the demo', () => {
    expect(dataDirFor('build', { SQ_DATA_DIR: DEMO_DATA })).toBe(DEMO_DATA);
    expect(dataDirFor('serve', { SQ_DATA_DIR: 'data' })).toBe('data');
    expect(dataDirFor('build', { SQ_DATA_DIR: '  ' })).toBe(SITE_DATA);
  });

  it('check:data looks at both folders', () => {
    expect(dataDirs).toEqual([SITE_DATA, DEMO_DATA]);
  });
});
