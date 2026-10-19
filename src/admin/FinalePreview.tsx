import { useEffect, useState } from 'react';
import { localTimestamp } from '../data/time.ts';
import { FinaleLayer } from '../hud/Finale.tsx';
import { publishMoving } from '../scene/moving.ts';
import { previewFinale } from './finale.ts';
import type { Session } from './session.ts';

/**
 * «Посмотреть финал» (D-60): the author rehearses the finale alone — the results screen and the ceremony as a
 * closing now would show them, over the whole admin window. Nothing is written: not the game, not the browser's
 * memory of the ceremony; no map here, so no fireworks.
 */
export function FinalePreview({ session, onClose }: { session: Session; onClose: () => void }) {
  const [finale] = useState(() => previewFinale(session.state.input, localTimestamp(new Date())));
  // No map here, so nothing walks: the ceremony's clock waits for the figures to stand (D-56), and a page
  // opened at #/admin never had a map to say so — the ceremony would stand at its first step.
  useEffect(() => publishMoving(false), []);
  return (
    <div
      className="sq-screen sq-ui fixed inset-0 z-30 flex flex-col gap-2 p-4"
      data-testid="finale-preview-screen"
    >
      <div className="sq-plate flex flex-wrap items-center gap-3 px-3 py-1.5">
        <span>
          Предпросмотр финала — видите только вы, ничего не записано. Цифры — на сейчас; итоговые —
          после последней загрузки.
        </span>
        <button className="sq-button ml-auto" onClick={onClose}>
          Закрыть
        </button>
      </div>
      {finale ? (
        <FinaleLayer finale={finale} config={session.state.input.config} tv={false} preview />
      ) : (
        <p role="alert" className="sq-plate sq-plate-alarm px-3 py-1.5">
          Финал сейчас не посчитать — проверьте данные игры.
        </p>
      )}
    </div>
  );
}
