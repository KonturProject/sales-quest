import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseIndex } from '../src/data/files.ts';
import {
  funnelGrid,
  paymentsGrid,
  type FunnelGroup,
  type PaymentLine,
} from '../tests/support/grids.ts';
import { DEMO_DATA } from './lib/dataDirs.ts';
import { demoSeason } from './lib/demo.ts';

// npm run make-fixtures — synthetic exports for the tests (QA-2, plan 2a): the funnel and the paid
// invoices of the demo's fictional operators (tests/fixtures/demo-data), plus two unknown people,
// «ё», double spaces, an «Академия» line, an invoice on three lines and the final sum row.
// Real exports never go into the repository (SEC-10).

const OUT = join('tests', 'fixtures', 'import');
const demoIndex = parseIndex(readFileSync(join(DEMO_DATA, 'seasons', 'index.json'), 'utf8'));
const start = demoIndex.seasons[0]?.period.start;
if (!start) throw new Error('make-fixtures: в демо нет игры — сначала npm run seed-demo');
const demo = demoSeason({ start });

const day = (n: number) => {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// The first six working days of the demo game.
const dates = [0, 1, 2, 3, 4, 7].map(day);

/** A small number of a name and a day, the same on every run. */
function amount(key: string, max: number): number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % (max + 1);
}

const teamOf = (managerId: string) =>
  demo.config.managers.find((m) => m.id === managerId)?.memberships[0]?.teamId;
const groups: FunnelGroup[] = demo.config.teams.map((team, i) => {
  const people = demo.config.managers
    .filter((m) => teamOf(m.id) === team.id)
    .map((m, k) => {
      // As the exports write people: «ё» where the roster has «е», a double space.
      let name = m.fullName;
      if (i === 0 && k === 0) name = name.replace(' ', '  ');
      if (i === 1 && k === 0) name = name.replace('е', 'ё');
      const days: Record<string, [number, number]> = {};
      for (const d of dates) days[d] = [amount(`${m.id}${d}6`, 5), amount(`${m.id}${d}20`, 2)];
      return { name, days };
    });
  return { code: `СР${i + 1}`, name: `Пл_НП_СР_Город_СР${i + 1}_Отдел`, people };
});
// Two people the roster does not know: one to link, one to ignore.
groups[0]?.people.push(
  { name: 'Новикова Фёкла', days: { [dates[0] as string]: [2, 1] } },
  { name: 'Тестов Тест', days: {} },
);

function save(name: string, sheets: [string, unknown[][]][]) {
  const wb = XLSX.utils.book_new();
  for (const [sheet, grid] of sheets)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), sheet);
  // The ESM build of SheetJS has no file system: write its bytes ourselves.
  writeFileSync(join(OUT, name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

save('funnel.xlsx', [
  ['ВОРОНКА ПНС', [['Трафик'], ['Сотрудник', 'Минуты']]],
  ['ВОРОНКА Первичная кампания', funnelGrid({ dates, groups })],
  ['Лист1', []],
]);

const operators = demo.config.managers.slice(0, 8);
const lines: PaymentLine[] = operators.map((m, k) => ({
  invoice: `TEST-${100 + k}`,
  date: dates[k % 3] as string,
  author: m.fullName,
  group: `СР${demo.config.teams.findIndex((t) => t.id === teamOf(m.id)) + 1}`,
}));
const first = lines[0] as PaymentLine;
lines.push(
  { ...first, invoice: 'TEST-200' },
  { ...first, invoice: 'TEST-200' },
  { ...first, invoice: 'TEST-200' },
  { ...first, invoice: 'TEST-201', product: 'Академия' },
);
save('payments.xlsx', [['Sheet1', paymentsGrid(lines)]]);

console.log(
  `make-fixtures: ${groups.length} групп, ${groups.reduce((n, g) => n + g.people.length, 0)} человек, ` +
    `${dates.length} дней; ${lines.length} строк оплат → ${OUT}/`,
);
