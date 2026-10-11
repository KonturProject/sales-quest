import { describe, expect, it } from 'vitest';
import { plateName } from '../../src/text.ts';

describe('the nameplate over a hero (author, 11.10.2026)', () => {
  it('shows the group before the leader: «СР6 • Мария Патяева»', () => {
    expect(plateName('Мария Патяева', 'СР6')).toBe('СР6 • Мария Патяева');
  });

  it('a team without a group code shows the name alone (the demo)', () => {
    expect(plateName('Алина Смирнова')).toBe('Алина Смирнова');
    expect(plateName('Алина Смирнова', '')).toBe('Алина Смирнова');
  });
});
