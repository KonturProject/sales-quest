import { describe, expect, it } from 'vitest';
import { findViolations, parseStagedDiff } from '../../scripts/lib/precommit.ts';

const classicToken = 'gh' + 'p_' + 'a1B2'.repeat(9);
const oauthToken = 'gh' + 'o_' + 'Z9y8'.repeat(9);
const fineGrainedToken = 'github' + '_pat_' + 'A'.repeat(22) + '_' + 'b'.repeat(59);

describe('parseStagedDiff', () => {
  it('collects added lines per file and skips deleted files', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,0 +2,2 @@',
      '+const x = 1;',
      '+++ content that starts with two pluses',
      'diff --git a/old.txt b/old.txt',
      'deleted file mode 100644',
      '--- a/old.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
      'diff --git a/data/x.json b/data/x.json',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/data/x.json',
      '@@ -0,0 +1 @@',
      '+{}',
    ].join('\n');

    expect(parseStagedDiff(diff)).toEqual([
      { path: 'src/a.ts', addedLines: ['const x = 1;', '++ content that starts with two pluses'] },
      { path: 'data/x.json', addedLines: ['{}'] },
    ]);
  });

  it('unquotes paths that git quotes and drops a trailing tab', () => {
    const diff = [
      'diff --git "a/x y.ts" "b/x y.ts"',
      '--- "a/x y.ts"',
      '+++ "b/x y.ts"\t',
      '@@ -0,0 +1 @@',
      '+1',
    ].join('\n');
    expect(parseStagedDiff(diff)).toEqual([{ path: 'x y.ts', addedLines: ['1'] }]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseStagedDiff('')).toEqual([]);
  });
});

describe('findViolations', () => {
  it('flags classic, OAuth and fine-grained GitHub tokens, once per file', () => {
    const problems = findViolations([
      { path: 'a.ts', addedLines: [`const t = '${classicToken}';`, `// ${classicToken}`] },
      { path: 'b.ts', addedLines: [oauthToken] },
      { path: 'c.env', addedLines: [`TOKEN=${fineGrainedToken}`] },
    ]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('a.ts');
    expect(problems[0]).toContain('токен');
  });

  it('does not flag ordinary code or the detection patterns themselves', () => {
    expect(
      findViolations([
        {
          path: 'scripts/lib/precommit.ts',
          addedLines: [
            'const x = 1;',
            '/gh[pousr]_[A-Za-z0-9]{36}/',
            '/github_pat_[A-Za-z0-9_]{40,}/',
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('blocks unencrypted JSON in data/ and allows the public files', () => {
    const files = [
      'data/seasons/2026-10/records.json',
      'data/seasons/2026-10/records.enc.json',
      'data/version.json',
      'data/seasons/index.json',
      'package.json',
    ].map((path) => ({ path, addedLines: ['{}'] }));

    const problems = findViolations(files);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('data/seasons/2026-10/records.json');
  });
});
