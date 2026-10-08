import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { sealSeason, seasonIndexText } from '../src/data/seal.ts';
import { localDate, localTimestamp } from '../src/data/time.ts';
import { demoSeason, mondayOf } from './lib/demo.ts';

// npm run seed-demo -- --phrase <phrase> [--start YYYY-MM-DD] [--seed N]
// Writes the demo game into data/ (DATA-16, D-32). The phrase is passed in, never stored in a file.

const { values } = parseArgs({
  options: {
    phrase: { type: 'string' },
    start: { type: 'string' },
    seed: { type: 'string' },
  },
});
const phrase = values.phrase ?? process.env.SQ_DEMO_PHRASE;
if (!phrase) {
  console.error('seed-demo: нужен код доступа — --phrase <код> или SQ_DEMO_PHRASE');
  process.exit(1);
}
const start = values.start ?? mondayOf(localDate(new Date()));
const input = demoSeason({ start, ...(values.seed ? { seed: Number(values.seed) } : {}) });

const files = await sealSeason(input, phrase, { updatedAt: localTimestamp(new Date()) });
files.set(
  'seasons/index.json',
  seasonIndexText([
    {
      id: input.config.id,
      title: input.config.title,
      status: input.config.status,
      period: input.config.period,
    },
  ]),
);
for (const [path, text] of files) {
  const target = join('data', path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
console.log(
  `seed-demo: игра ${input.config.id} ${input.config.period.start}…${input.config.period.end}, ` +
    `${input.config.managers.length} операторов, ${input.records.length} записей → data/`,
);
