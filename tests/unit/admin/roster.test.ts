import { describe, expect, it } from 'vitest';
import { applyRosterEdits, type RosterEdit } from '../../../src/admin/roster.ts';
import type { SeasonConfig } from '../../../src/data/schemas/season.ts';
import { makeConfig, manager, team } from '../../support/builders.ts';

const NORMS = { inv6: 3, inv20: 1.5, pay: 0.2 };
// A two-week game 05.10–18.10; СР1, СР5, СР9.
const config = makeConfig({
  teams: [
    team('t1', 1, { sourceCode: 'СР1' }),
    team('t2', 2, { sourceCode: 'СР5', color: '#29335C' }),
    team('t3', 3, { sourceCode: 'СР9', color: '#4C956C' }),
  ],
  managers: [
    manager('op001', 't1', { fullName: 'Ершова Мария', dailyNorms: NORMS }),
    manager('op002', 't1', { fullName: 'Федоров Иван', aliases: ['Федоров Иван Петрович'] }),
    manager('op003', 't2', { fullName: 'Белова Анна', firedAt: '2026-10-07' }),
  ],
  defaultDailyNorms: NORMS,
});
const apply = (edits: RosterEdit[], c: SeasonConfig = config) => applyRosterEdits(c, edits);
const mgr = (c: SeasonConfig, id: string) => c.managers.find((m) => m.id === id);

describe('operator edits (ADM-ROSTER-2, ADM-ROSTER-3)', () => {
  it('adds an operator with the next id, a clean name, the norms and a team from a day', () => {
    const r = apply([
      {
        kind: 'add',
        ref: 'new-1',
        name: '  Новикова   Фёкла ',
        teamId: 't2',
        from: '2026-10-12',
        norms: NORMS,
      },
    ]);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op004')).toEqual({
      id: 'op004',
      fullName: 'Новикова Фёкла',
      aliases: [],
      dailyNorms: NORMS,
      memberships: [{ teamId: 't2', from: '2026-10-12' }],
    });
    expect(r.lines).toEqual(['Новый: Новикова Фёкла → СР5 с 12.10']);
  });

  it('a date before the start means the start; after the end is refused', () => {
    const r = apply([
      {
        kind: 'add',
        ref: 'new-1',
        name: 'Новикова Фёкла',
        teamId: 't2',
        from: '2026-10-01',
        norms: NORMS,
      },
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-20' },
    ]);
    expect(mgr(r.config, 'op004')?.memberships).toEqual([{ teamId: 't2', from: '2026-10-05' }]);
    expect(r.problems).toEqual([
      { index: 1, message: expect.stringMatching(/после конца игры \(18\.10\)/) as string },
    ]);
  });

  it('a transfer closes the old team the day before; earned points stay there (R-1)', () => {
    const r = apply([{ kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' }]);
    expect(mgr(r.config, 'op001')?.memberships).toEqual([
      { teamId: 't1', from: '2026-10-05', to: '2026-10-11' },
      { teamId: 't2', from: '2026-10-12' },
    ]);
    expect(r.lines).toEqual(['Перевод: Ершова Мария → СР5 с 12.10']);
  });

  it('a transfer on the first day replaces the team; to the same team is a problem', () => {
    const r = apply([
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-05' },
      { kind: 'transfer', managerId: 'op002', teamId: 't1', from: '2026-10-12' },
    ]);
    expect(mgr(r.config, 'op001')?.memberships).toEqual([{ teamId: 't2', from: '2026-10-05' }]);
    expect(r.problems).toEqual([{ index: 1, message: 'Федоров Иван уже в этой команде' }]);
  });

  it('a transfer drops the memberships after its day', () => {
    const moved = makeConfig({
      ...config,
      managers: [
        manager('op001', 't1', {
          fullName: 'Ершова Мария',
          memberships: [
            { teamId: 't1', from: '2026-10-05', to: '2026-10-09' },
            { teamId: 't2', from: '2026-10-10' },
          ],
        }),
      ],
    });
    const r = apply(
      [{ kind: 'transfer', managerId: 'op001', teamId: 't3', from: '2026-10-08' }],
      moved,
    );
    expect(mgr(r.config, 'op001')?.memberships).toEqual([
      { teamId: 't1', from: '2026-10-05', to: '2026-10-07' },
      { teamId: 't3', from: '2026-10-08' },
    ]);
  });

  it('a rename keeps the old name as an alias; a name of someone else, an alias of theirs too, is refused', () => {
    const r = apply([
      { kind: 'rename', managerId: 'op001', name: 'Ершова Мария Ивановна' },
      { kind: 'rename', managerId: 'op001', name: 'федоров  иван петрович' },
      {
        kind: 'add',
        ref: 'new-1',
        name: 'Фёдоров Иван',
        teamId: 't1',
        from: '2026-10-12',
        norms: NORMS,
      },
    ]);
    expect(mgr(r.config, 'op001')).toMatchObject({
      fullName: 'Ершова Мария Ивановна',
      aliases: ['Ершова Мария'],
    });
    expect(r.problems).toEqual([
      { index: 1, message: 'такой оператор уже есть: Федоров Иван (СР1)' },
      { index: 2, message: 'такой оператор уже есть: Федоров Иван (СР1)' },
    ]);
  });

  it('a rename that only fixes the spelling (ё, case) adds no alias and is no duplicate', () => {
    const r = apply([{ kind: 'rename', managerId: 'op002', name: 'Фёдоров Иван' }]);
    expect(r.problems).toEqual([]);
    expect(mgr(r.config, 'op002')).toMatchObject({
      fullName: 'Фёдоров Иван',
      aliases: ['Федоров Иван Петрович'],
    });
  });

  it('norms: every metric, numbers from 0, fractions allowed', () => {
    const r = apply([
      { kind: 'norms', managerId: 'op002', norms: { inv6: 2.5, inv20: 0, pay: 0.2 } },
      { kind: 'norms', managerId: 'op001', norms: { inv6: -1, inv20: 1, pay: 0.2 } },
      { kind: 'norms', managerId: 'op001', norms: { inv6: 1, inv20: 1 } },
    ]);
    expect(mgr(r.config, 'op002')?.dailyNorms).toEqual({ inv6: 2.5, inv20: 0, pay: 0.2 });
    expect(r.problems.map((p) => p.message)).toEqual([
      'норматив «Качественные счета» — число от 0',
      'норматив «Оплаты» — число от 0',
    ]);
    expect(r.lines[0]).toBe('Нормативы: Федоров Иван — 2,5 / 0 / 0,2');
  });

  it('fires on a day with a reason; already fired, or before the person came, is refused', () => {
    const r = apply([
      { kind: 'fire', managerId: 'op001', date: '2026-10-12', reason: ' ушла ' },
      { kind: 'fire', managerId: 'op003', date: '2026-10-12' },
      {
        kind: 'add',
        ref: 'new-1',
        name: 'Новикова Фёкла',
        teamId: 't2',
        from: '2026-10-12',
        norms: NORMS,
      },
      { kind: 'fire', managerId: 'new-1', date: '2026-10-09' },
    ]);
    expect(mgr(r.config, 'op001')).toMatchObject({ firedAt: '2026-10-12', firedReason: 'ушла' });
    expect(r.problems).toEqual([
      { index: 1, message: 'Белова Анна: увольнение уже записано — с 07.10' },
      { index: 3, message: 'Новикова Фёкла: увольнение 09.10 раньше прихода в команду (12.10)' },
    ]);
    expect(r.lines[0]).toBe('Увольнение: Ершова Мария с 12.10 (ушла)');
  });

  it('a return removes the firing; without a firing it is a problem', () => {
    const r = apply([
      { kind: 'unfire', managerId: 'op003' },
      { kind: 'unfire', managerId: 'op001' },
    ]);
    expect(mgr(r.config, 'op003')).not.toHaveProperty('firedAt');
    expect(r.problems).toEqual([
      { index: 1, message: 'Ершова Мария: увольнения нет — возвращать нечего' },
    ]);
    expect(r.lines[0]).toBe('Возврат: Белова Анна');
  });

  it('a transfer after the firing in the same batch is refused; the firing applies', () => {
    const r = apply([
      { kind: 'fire', managerId: 'op001', date: '2026-10-09' },
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' },
    ]);
    expect(mgr(r.config, 'op001')?.firedAt).toBe('2026-10-09');
    expect(r.problems).toEqual([
      { index: 1, message: 'Ершова Мария: увольнение с 09.10 — перевод после него не нужен' },
    ]);
  });

  it('edits of a new person follow its ref; without its «Новый» they are problems, never someone else', () => {
    const add = (ref: string, name: string): RosterEdit => ({
      kind: 'add',
      ref,
      name,
      teamId: 't2',
      from: '2026-10-12',
      norms: NORMS,
    });
    const fireB: RosterEdit = { kind: 'fire', managerId: 'new-2', date: '2026-10-14' };
    const both = apply([add('new-1', 'Аа Аа'), add('new-2', 'Бб Бб'), fireB]);
    expect(mgr(both.config, 'op005')).toMatchObject({ fullName: 'Бб Бб', firedAt: '2026-10-14' });
    const withoutB = apply([add('new-1', 'Аа Аа'), fireB]);
    expect(mgr(withoutB.config, 'op004')).not.toHaveProperty('firedAt');
    expect(withoutB.problems).toEqual([
      { index: 1, message: 'этого оператора нет в составе — возможно, его уже убрали' },
    ]);
  });

  it('a batch applied again to a changed season: what no longer fits is a problem, the rest applies', () => {
    const edits: RosterEdit[] = [
      { kind: 'transfer', managerId: 'op001', teamId: 't2', from: '2026-10-12' },
      { kind: 'rename', managerId: 'op002', name: 'Федоров Иван Сергеевич' },
    ];
    // Another admin fired op001 on 09.10 meanwhile.
    const changed = apply([{ kind: 'fire', managerId: 'op001', date: '2026-10-09' }]).config;
    const r = apply(edits, changed);
    expect(r.problems.map((p) => p.index)).toEqual([0]);
    expect(mgr(r.config, 'op002')?.fullName).toBe('Федоров Иван Сергеевич');
  });
});
