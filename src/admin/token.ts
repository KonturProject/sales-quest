import { daysBetween } from '../engine/dates.ts';

/**
 * The admin's GitHub token (SEC-2): in this browser's storage only — never in the repository, a log
 * or a link. «Выйти» removes it.
 */

const KEY = 'sq.admin.token';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  try {
    return storage()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  try {
    storage()?.setItem(KEY, token);
  } catch {
    // Without storage the token lasts for this page.
  }
}

export function forgetToken(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing kept, nothing to remove.
  }
}

/** Days before the expiry when the admin is warned (SEC-3). */
export const EXPIRY_WARNING_DAYS = 14;

/**
 * A warning from GitHub's `github-authentication-token-expiration` (`2026-10-20 10:00:00 +0300` or
 * `… UTC`) on `today` (`YYYY-MM-DD`); null when it is far or unknown.
 */
export function expiryWarning(expiresAt: string | null, today: string): string | null {
  const date = expiresAt?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const left = daysBetween(today, date);
  if (left > EXPIRY_WARNING_DAYS) return null;
  if (left < 0) return 'ключ GitHub истёк — создайте новый';
  if (left === 0) return 'ключ GitHub истекает сегодня — создайте новый';
  return `ключ GitHub истекает через ${left} дн. — создайте новый`;
}
