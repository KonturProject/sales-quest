import { describe, expect, it } from 'vitest';
import { matchPeople, normalizeName } from '../../../src/import/match.ts';
import { makeConfig, manager, team } from '../../support/builders.ts';

const config = makeConfig({
  teams: [team('t1', 1, { sourceCode: 'СР1' }), team('t2', 2, { sourceCode: 'СР5' })],
  managers: [
    manager('m01', 't1', { fullName: 'Ершова Мария' }),
    manager('m02', 't1', { fullName: 'Федоров Иван' }),
    manager('m03', 't2', { fullName: 'Белова Анна', aliases: ['Белова Анна Сергеевна'] }),
  ],
  importIgnore: ['тестов тест'],
});

describe('operators of an export against the roster (DATA-9, DATA-10)', () => {
  it('matches through ё, spaces and case, and through aliases', () => {
    expect(normalizeName('  Фёдоров   ИВАН ')).toBe('федоров иван');
    const m = matchPeople(
      [
        { name: 'Фёдоров  иван', group: 'СР1' },
        { name: 'Белова Анна  Сергеевна', group: 'СР5' },
      ],
      config,
      '2026-10-05',
    );
    expect(m.managerOf.get('федоров иван')).toBe('m02');
    expect(m.managerOf.get('белова анна сергеевна')).toBe('m03');
    expect(m.unknown).toEqual([]);
  });

  it('suggests the team by the group code; an ignored name is not asked again', () => {
    const m = matchPeople(
      [
        { name: 'Новикова Фёкла', group: 'СР5' },
        { name: 'Новикова  Фекла', group: 'СР5' },
        { name: 'Кто-то Новый', group: 'СР9' },
        { name: 'Тестов Тест', group: 'СР1' },
      ],
      config,
      '2026-10-05',
    );
    expect(m.unknown).toEqual([
      { name: 'Новикова Фёкла', norm: 'новикова фекла', group: 'СР5', suggestedTeamId: 't2' },
      { name: 'Кто-то Новый', norm: 'кто-то новый', group: 'СР9', suggestedTeamId: null },
    ]);
    expect(m.ignored).toEqual(['Тестов Тест']);
  });

  it('warns when the export lists an operator in another group than the roster', () => {
    const m = matchPeople([{ name: 'Ершова Мария', group: 'СР5' }], config, '2026-10-05');
    expect(m.managerOf.get('ершова мария')).toBe('m01');
    expect(m.moved).toEqual([
      'Ершова Мария: в выгрузке в группе СР5, в составе — в СР1 (возможно, перевод)',
    ]);
  });
});
