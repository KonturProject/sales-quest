import { ImportError } from './grid.ts';
import type { Parsed } from './parsed.ts';
import type { ImportProfile } from './profiles.ts';
import { parseWorkbook } from './xlsx.ts';

/**
 * Reads an export off the page's thread (plan 2a): the 16 MB funnel must not freeze the admin.
 * SheetJS lives here and in Node scripts only (D-7a).
 */

export type ParseRequest = { bytes: ArrayBuffer; profiles: ImportProfile[] };
export type ParseReply =
  { ok: true; profile: ImportProfile; parsed: Parsed } | { ok: false; message: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ParseRequest>) => void) | null;
  postMessage(reply: ParseReply): void;
};

scope.onmessage = (e) => {
  try {
    const { profile, parsed } = parseWorkbook(e.data.bytes, e.data.profiles);
    scope.postMessage({ ok: true, profile, parsed });
  } catch (error) {
    scope.postMessage({
      ok: false,
      message:
        error instanceof ImportError
          ? error.message
          : `не получилось прочитать файл: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};
