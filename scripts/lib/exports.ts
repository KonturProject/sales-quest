import { basename } from 'node:path';

/** An export's file name for the output of check-exports: the surname at its end masked (plan 2a). */
export function maskedFileName(path: string): string {
  return basename(path).replace(/[А-Яа-яЁё]+(?=\.xlsx$)/, '<фамилия>');
}
