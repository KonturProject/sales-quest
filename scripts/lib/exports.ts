import { basename } from 'node:path';

/** An export's file name for the output of check-exports: the surname at its end masked (plan 2a). */
export function maskedFileName(path: string): string {
  // «… Петрова.xlsx» and a copy saved twice, «… Петрова (1).xlsx».
  return basename(path).replace(/[А-Яа-яЁё]+(?=(?:\s*\(\d+\))?\.xlsx$)/, '<фамилия>');
}
