import type { SeasonConfig } from '../data/schemas/season.ts';
import { computeGameState } from '../engine/gameState.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { finaleOrNull, type Finale } from '../finale/results.ts';
import { dayMonth } from '../import/grid.ts';

/**
 * «Подвести итоги» and «Вернуть игру» (D-59): the author closes the game after the last upload — every screen
 * then plays the finale — or undoes a closing pressed by mistake. Only the config changes: the status and the
 * moment of closing (a browser plays the ceremony once per closing).
 */

/** From the game's last day on, while it runs: on the last morning the data are still coming. */
export function canClose(config: SeasonConfig, today: string): boolean {
  return config.status === 'active' && today >= config.period.end;
}

export function closeGame(input: EngineInput, now: string): EngineInput {
  return { ...input, config: { ...input.config, status: 'closed', closedAt: now } };
}

export function reopenGame(input: EngineInput): EngineInput {
  const config: SeasonConfig = { ...input.config, status: 'active' };
  delete config.closedAt;
  return { ...input, config };
}

/**
 * «Посмотреть финал» (D-60): the finale as a closing now would show it, on the data as they stand — computed in
 * memory, nothing written; null when it cannot be computed.
 */
export function previewFinale(input: EngineInput, now: string): Finale | null {
  const closed = closeGame(input, now);
  try {
    // The engine refuses a broken config (no working days, a bad date): a message, not the error page.
    return finaleOrNull(computeGameState(closed, now), closed.config, closed.adjustments);
  } catch {
    return null;
  }
}

/** The public commit message: dates only (D-51). */
export function finaleMessage(config: SeasonConfig, closing: boolean): string {
  const period = `${dayMonth(config.period.start)}–${dayMonth(config.period.end)}`;
  return closing ? `итоги игры ${period}` : `игра снова идёт: ${period}`;
}
