import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Runs the real hook body against a throwaway git repository, so the cases that slip past a
// diff-header parser (renames, custom diff prefixes, binary files) are exercised end to end.
const CHECK = resolve('scripts/precommit-check.ts');

let repo = '';

function git(...args: string[]) {
  execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
}

function write(path: string, content: string | Buffer) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function check() {
  const result = spawnSync(process.execPath, [CHECK], { cwd: repo, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sq-hook-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('precommit-check (real git)', () => {
  it('lets an ordinary change through', () => {
    write('src/a.ts', 'export const a = 1;\n');
    git('add', '.');
    expect(check().status).toBe(0);
  });

  it('blocks a JSON file renamed into data/', () => {
    write('seed.json', '{"name": "Иванов Иван"}\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    mkdirSync(join(repo, 'data')); // git mv does not create the target directory
    git('mv', 'seed.json', 'data/seed.json');
    const { status, stderr } = check();
    expect(status).toBe(1);
    expect(stderr).toContain('data/seed.json');
  });

  it('blocks data JSON when diff.mnemonicPrefix is set', () => {
    git('config', 'diff.mnemonicPrefix', 'true');
    write('data/x.json', '{}\n');
    git('add', '.');
    expect(check().status).toBe(1);
  });

  it('blocks a data JSON that git treats as binary', () => {
    write('data/b.json', Buffer.from([0x7b, 0x00, 0x7d]));
    git('add', '.');
    expect(check().status).toBe(1);
  });

  it('blocks a force-added spreadsheet', () => {
    write('Выгрузка.xlsx', 'not really a workbook');
    git('add', '-f', 'Выгрузка.xlsx');
    const { status, stderr } = check();
    expect(status).toBe(1);
    expect(stderr).toContain('Выгрузка.xlsx'); // readable, not octal-escaped
  });

  it('blocks a GitHub token', () => {
    write('leak.txt', `token=${'gh' + 'p_' + 'x'.repeat(36)}\n`);
    git('add', '.');
    const { status, stderr } = check();
    expect(status).toBe(1);
    expect(stderr).toContain('токен');
  });
});
