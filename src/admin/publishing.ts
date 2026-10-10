import type { Version } from '../data/files.ts';

/** How often the admin looks whether the site already gives the new data (SYNC-4). */
export const PUBLISH_POLL_MS = 10_000;
/** Past this the publication is late: a word about where to look. */
const LATE_MS = 5 * 60_000;

/** The site gives the revision the admin committed. */
export function isPublished(expectedRev: string, version: Version): boolean {
  return version.rev === expectedRev;
}

/** The banner while the site rebuilds (§15: ~1–2 minutes). */
export function publishingText(elapsedMs: number): string {
  return elapsedMs < LATE_MS
    ? 'Публикуется… обычно 1–2 минуты'
    : 'Публикуется дольше обычного — данные уже записаны, сайт пересобирается на GitHub (вкладка Actions)';
}
