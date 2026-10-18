import { describe, expect, it } from 'vitest';
import { canClose, closeGame, finaleMessage, reopenGame } from '../../../src/admin/finale.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { makeConfig } from '../../support/builders.ts';

// makeConfig: a game of 05.10–18.10.
const config = makeConfig();
const input: EngineInput = { config, records: [], adjustments: [], imports: [] };
const NOW = '2026-10-19T13:00:00+03:00';

describe('«Подвести итоги» (D-59)', () => {
  it('closing is possible from the game’s last day', () => {
    expect(canClose(config, '2026-10-17')).toBe(false);
    expect(canClose(config, '2026-10-18')).toBe(true);
    expect(canClose(config, '2026-10-19')).toBe(true);
    expect(canClose(closeGame(input, NOW).config, '2026-10-19')).toBe(false);
  });

  it('close writes the status and the moment; reopen restores active', () => {
    const closed = closeGame(input, NOW);
    expect(closed.config.status).toBe('closed');
    expect(closed.config.closedAt).toBe(NOW);
    expect(closed.records).toBe(input.records);
    expect(reopenGame(closed).config).toEqual(input.config);
    expect('closedAt' in reopenGame(closed).config).toBe(false);
  });

  it('the message is public: dates only', () => {
    expect(finaleMessage(config, true)).toBe('итоги игры 05.10–18.10');
    expect(finaleMessage(config, false)).toBe('игра снова идёт: 05.10–18.10');
  });
});
