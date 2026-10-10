/** What every parser of an export gives (plan 2a): people with their numbers per day. */

/** A person as written in the export, with the group's code (`СР1`), if the export has it. */
export type Person = { name: string; group: string | null };

/** One person's numbers of the file's metrics on one day. */
export type ParsedRow = Person & { date: string; values: Record<string, number> };

export type Parsed = {
  profileId: string;
  /** The metrics this file supplies (D-20): an import changes only these. */
  metrics: string[];
  rows: ParsedRow[];
  /** The first and the last day the file covers. */
  period: [string, string];
  /**
   * The days the file is complete for (OQ-12): the funnel's date columns; for the paid invoices every
   * day from the first payment to the last — a day without payments is 0, not unknown.
   */
  days: string[];
  /** Group codes found in the file, in order. */
  groups: string[];
  /** Everyone listed, in order (also those with no numbers). */
  people: Person[];
  warnings: string[];
};
