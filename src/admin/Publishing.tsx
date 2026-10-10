import { useEffect, useRef, useState } from 'react';
import { dataPath, parseVersion } from '../data/files.ts';
import { PagesSource } from '../data/storage.ts';
import { PUBLISH_POLL_MS, isPublished, publishingText } from './publishing.ts';

/** The banner after a commit (SYNC-4): until the site gives the new revision, then «Опубликовано». */
export function Publishing({
  rev,
  started,
  onDone,
}: {
  rev: string;
  started: number;
  onDone?: () => void;
}) {
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // The latest callback, without restarting the polling when the parent renders.
  const done_ = useRef(onDone);
  useEffect(() => {
    done_.current = onDone;
  });
  useEffect(() => {
    const source = new PagesSource(`${import.meta.env.BASE_URL}data/`);
    let timer: number | undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const version = parseVersion(await source.read(dataPath.version, { fresh: true }));
        if (isPublished(rev, version)) {
          if (!stopped) {
            setDone(true);
            done_.current?.();
          }
          return;
        }
      } catch {
        // No answer this time: the next look.
      }
      if (stopped) return;
      setElapsed(Date.now() - started);
      timer = window.setTimeout(() => void tick(), PUBLISH_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [rev, started]);
  return (
    <p role="status" className="sq-plate px-3 py-1.5" data-testid="publishing">
      {done ? 'Опубликовано: отдел видит новые данные' : publishingText(elapsed)}
    </p>
  );
}
