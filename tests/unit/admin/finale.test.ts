import { describe, expect, it } from 'vitest';
import {
  canClose,
  closeGame,
  finaleMessage,
  previewFinale,
  reopenGame,
} from '../../../src/admin/finale.ts';
import type { EngineInput } from '../../../src/engine/prepare.ts';
import { daily, makeConfig, manager, team } from '../../support/builders.ts';

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

describe('«Посмотреть финал» (D-60)', () => {
  it('the finale as a closing now would show it; the data are not changed', () => {
    const running: EngineInput = {
      config: makeConfig({
        teams: [team('t1', 1), team('t2', 2)],
        managers: [manager('a', 't1'), manager('b', 't2')],
      }),
      records: [daily('a', '2026-10-06', { pay: 2 }), daily('b', '2026-10-06', { pay: 1 })],
      adjustments: [],
      imports: [],
    };
    const finale = previewFinale(running, '2026-10-14T10:00:00+03:00');
    expect(finale?.closedAt).toBe('2026-10-14T10:00:00+03:00');
    expect(finale?.podium.map((p) => p.teamId)).toEqual(['t1', 't2']);
    expect(running.config.status).toBe('active');
    expect('closedAt' in running.config).toBe(false);
  });
});
