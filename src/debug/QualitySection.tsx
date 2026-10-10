import { useState } from 'react';
import {
  LAST_LEVEL,
  qualityAt,
  readMeasures,
  readStoredQuality,
  resetQuality,
  type Quality,
} from '../scene/runtime/quality.ts';

const time = (ms: number) => {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
const fps = (n: number) => n.toFixed(1).replace('.', ',');

function keeps(q: Quality): string {
  return [
    `DPR ${String(q.dpr).replace('.', ',')}`,
    q.anisotropy ? 'анизотропия' : 'без анизотропии',
    q.ambient ? '«жизнь»' : 'без «жизни»',
    q.scenery ? 'вещи и модели' : 'без вещей и моделей',
    ...(q.offerScheme ? ['предложить 2D-схему'] : []),
  ].join(' · ');
}

/**
 * The quality ladder of this browser (D-45, OQ-24): the level the scene stepped down to and the
 * frame rate of the last windows of moves — the figures to take from a real office laptop.
 */
export function QualitySection() {
  const [, setCleared] = useState(0);
  const stored = readStoredQuality();
  const level = stored?.level ?? 0;
  const measures = readMeasures();
  const rates = measures.map((m) => m.fps);
  const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  return (
    <section aria-label="Качество сцены">
      <h2 className="mt-4 font-semibold">Качество сцены</h2>
      <p>
        Ступень {level} из {LAST_LEVEL}: {keeps(qualityAt(level, window.devicePixelRatio))}
        {stored ? `, с ${time(stored.at)} (на неделю)` : ' — с начала, ничего не запомнено'}
      </p>
      <p data-testid="moves-fps">
        {mean === null
          ? 'Ходов ещё не было: откройте карту и дождитесь ходов.'
          : `Ходы, последние окна по 2,5 с: ${rates.map(fps).join(' · ')} к/с — в среднем ${fps(mean)}, хуже всего ${fps(Math.min(...rates))} (последнее — ${time(measures.at(-1)?.at ?? 0)})`}
      </p>
      <button
        className="mt-1 rounded border px-2"
        onClick={() => {
          resetQuality();
          setCleared((n) => n + 1);
        }}
      >
        Сбросить качество
      </button>
    </section>
  );
}
