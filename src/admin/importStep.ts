import { applyImport, type ImportResult, type Resolution } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import type { Unknown } from '../import/match.ts';
import type { ParsedFile } from '../import/parseFile.ts';
import { plural } from '../text.ts';
import { previewChange, type Preview, type RepoState } from './pipeline.ts';

/**
 * One import as the admin's screen runs it (plan 2a), pure: the file applied to the season read from
 * GitHub, the preview «было → станет» and the public commit message — counts, never names. After a
 * conflict the screen calls it again on the season read anew, with the same resolutions.
 */
export function prepareImport(
  state: RepoState,
  file: ParsedFile,
  resolutions: Map<string, Resolution>,
  opts: { by: string; at: string; now: string; period?: [string, string] },
): { result: ImportResult; preview: Preview; message: string } {
  const result = applyImport(state.input, file.parsed, resolutions, {
    fileName: file.fileName,
    sha256: file.sha256,
    by: opts.by,
    at: opts.at,
    ...(opts.period ? { period: opts.period } : {}),
  });
  return {
    result,
    preview: previewChange(state.input, result.input, opts.now),
    message: importCommitMessage(
      file.profile.title,
      result.summary.period,
      result.summary.matched,
      result.summary.added,
    ),
  };
}

/** `импорт: воронка по дням 05.10–12.10, 49 операторов, 1 новый` — public, so counts only. */
export function importCommitMessage(
  title: string,
  period: [string, string],
  matched: number,
  added: number,
): string {
  const people = `${matched} ${plural(matched, 'оператор', 'оператора', 'операторов')}`;
  const fresh = added > 0 ? `, ${added} ${plural(added, 'новый', 'новых', 'новых')}` : '';
  return `импорт: ${title.toLowerCase()} ${dayMonth(period[0])}–${dayMonth(period[1])}, ${people}${fresh}`;
}

/** The screen's first answers: a new operator in the team of their group, where the group is known. */
export function defaultResolutions(unknown: Unknown[]): Map<string, Resolution> {
  return new Map(
    unknown.flatMap((u) =>
      u.suggestedTeamId
        ? [[u.norm, { kind: 'new' as const, teamId: u.suggestedTeamId }] as const]
        : [],
    ),
  );
}
