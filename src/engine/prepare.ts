import type { Adjustment, ImportLog, MetricRecord } from '../data/schemas/records.ts';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { buildCalendar, type Calendar } from './calendar.ts';
import { buildDailySeries, type DailySeries } from './scoring.ts';
import { buildTrack, type Track } from './track.ts';

/** Stored inputs of the engine (ARCH-2): everything else is derived. */
export type EngineInput = {
  config: SeasonConfig;
  records: MetricRecord[];
  adjustments: Adjustment[];
  imports: ImportLog[];
};

export type Prepared = EngineInput & {
  calendar: Calendar;
  track: Track;
  series: DailySeries;
  warnings: string[];
};

/** Derived inputs shared by the state, the timeline and the achievements of plan 1b. */
export function prepare(input: EngineInput): Prepared {
  const calendar = buildCalendar(input.config);
  const track = buildTrack(input.config, calendar.workingDays.length);
  const { series, warnings } = buildDailySeries(input.records, input.config.period);
  const known = new Set(input.config.managers.map((m) => m.id));
  for (const id of series.keys())
    if (!known.has(id)) warnings.push(`данные оператора ${id} не учтены: его нет в составе`);
  return { ...input, calendar, track, series, warnings };
}
