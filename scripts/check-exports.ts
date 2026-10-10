import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { DEFAULT_PROFILES } from '../src/import/profiles.ts';
import { parseWorkbook } from '../src/import/xlsx.ts';

// npm run check-exports -- <file.xlsx> [<file.xlsx> …] — the parsers against real exports on this PC
// (plan 2a, OQ-13). Prints only counts and the self-check: no names, no numbers of sales — the output
// may be pasted into a report.

for (const path of process.argv.slice(2)) {
  const started = performance.now();
  const bytes = readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    const { profile, parsed } = parseWorkbook(buffer, DEFAULT_PROFILES);
    const ms = Math.round(performance.now() - started);
    const people = new Set(parsed.people.map((p) => p.name)).size;
    const active = new Set(
      parsed.rows.filter((r) => Object.values(r.values).some((v) => v > 0)).map((r) => r.name),
    ).size;
    const days = new Set(parsed.rows.map((r) => r.date)).size;
    console.log(
      `${basename(path).replace(/[А-Яа-яЁё]+(?=\.xlsx$)/, '<фамилия>')}: ${profile.title}; ` +
        `групп ${parsed.groups.length}, людей ${people} (с показателями ${active}), ` +
        `дней с данными ${days}, период ${parsed.period.join(' … ')}; ` +
        `предупреждений ${parsed.warnings.length}; ${ms} мс`,
    );
    for (const w of parsed.warnings)
      // Self-check lines name a group and a day, never a person.
      if (/^(СР\d+|весь отдел|и ещё|\d+ сч)/.test(w)) console.log(`  · ${w}`);
  } catch (error) {
    console.log(
      `${basename(path)}: ошибка — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
