export type StagedFile = { path: string; addedLines: string[] };

/**
 * Splits `git diff --cached -U0` output into files with their added lines.
 * `+++` counts as a file header only between `diff --git` and the first `@@`,
 * so content lines that start with `++` are not mistaken for headers.
 * Deleted files (`+++ /dev/null`) are skipped.
 */
export function parseStagedDiff(diff: string): StagedFile[] {
  const files: StagedFile[] = [];
  let current: StagedFile | null = null;
  let inHeader = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      current = null;
      continue;
    }
    if (inHeader) {
      if (line.startsWith('+++ ')) {
        const target = unquote(line.slice(4).replace(/\t$/, ''));
        current =
          target === '/dev/null' ? null : { path: target.replace(/^b\//, ''), addedLines: [] };
        if (current) files.push(current);
      } else if (line.startsWith('@@')) {
        inHeader = false;
      }
      continue;
    }
    if (current && line.startsWith('+')) current.addedLines.push(line.slice(1));
  }
  return files;
}

function unquote(path: string): string {
  return path.length >= 2 && path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

/** Splits `git diff --name-only -z` output (NUL-separated paths). */
export function parseNameList(output: string): string[] {
  return output.split('\0').filter((path) => path !== '');
}

// Classic (ghp_), OAuth (gho_), user-to-server (ghu_), server-to-server (ghs_), refresh (ghr_)
// and fine-grained (github_pat_) tokens. The patterns are written so they do not match their own
// source text — this file passes through the hook too.
const TOKEN_PATTERNS = [/gh[pousr]_[A-Za-z0-9]{36}/, /github_pat_[A-Za-z0-9_]{40,}/];

// data/ is published on a public site: only encrypted files and the two PII-free indexes (SEC-6).
const PUBLIC_DATA_JSON = [/\.enc\.json$/, /^data\/version\.json$/, /^data\/seasons\/index\.json$/];

// Source exports carry names and sales figures (SEC-10); only synthetic test fixtures may be committed.
const SPREADSHEET = /\.(xlsx|xlsm|xls|csv|ods)$/i;
const FIXTURES = /^tests\/fixtures\//;

/**
 * Path rules run on every added, copied, modified or renamed path (from `--name-only`, which
 * also lists renames and binary files); token rules run on the added lines of text files.
 */
export function findViolations(stagedPaths: string[], files: StagedFile[]): string[] {
  const problems: string[] = [];
  for (const path of stagedPaths) {
    if (/^data\/.*\.json$/.test(path) && !PUBLIC_DATA_JSON.some((re) => re.test(path))) {
      problems.push(
        `${path}: в data/ коммитятся только зашифрованные *.enc.json, version.json и seasons/index.json (SEC-6)`,
      );
    }
    if (SPREADSHEET.test(path) && !FIXTURES.test(path)) {
      problems.push(
        `${path}: исходные таблицы не коммитятся, только синтетические фикстуры в tests/fixtures/ (SEC-10)`,
      );
    }
  }
  for (const file of files) {
    if (file.addedLines.some((line) => TOKEN_PATTERNS.some((re) => re.test(line)))) {
      problems.push(`${file.path}: похоже на GitHub-токен — токены не коммитятся (SEC-2)`);
    }
  }
  return problems;
}
