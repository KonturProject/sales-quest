import { ImportError } from './grid.ts';
import { sha256 } from './hash.ts';
import type { ParseReply, ParseRequest } from './parse.worker.ts';
import type { Parsed } from './parsed.ts';
import type { ImportProfile } from './profiles.ts';

export type ParsedFile = {
  profile: ImportProfile;
  parsed: Parsed;
  sha256: string;
  fileName: string;
};

/**
 * An export chosen by the admin, read in a worker (plan 2a): the file never leaves the browser
 * (DATA-2) — only its fingerprint and the numbers of its people come back.
 */
export async function parseFile(file: File, profiles: ImportProfile[]): Promise<ParsedFile> {
  const bytes = await file.arrayBuffer();
  const hash = await sha256(bytes);
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  try {
    const reply = await new Promise<ParseReply>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<ParseReply>) => resolve(e.data);
      worker.onerror = (e) => reject(new ImportError(`не получилось прочитать файл: ${e.message}`));
      const request: ParseRequest = { bytes, profiles };
      worker.postMessage(request, [bytes]);
    });
    if (!reply.ok) throw new ImportError(reply.message);
    return { profile: reply.profile, parsed: reply.parsed, sha256: hash, fileName: file.name };
  } finally {
    worker.terminate();
  }
}
