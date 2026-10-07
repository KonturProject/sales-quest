---
name: engine-rules
description: Use when changing anything in src/engine or src/data/schemas of Sales Quest — scoring, targets, track geometry, progress, pace, leaderboard, timeline, achievements, or the season config schema. Lists the invariants the engine must keep and the checks to run.
---

# Engine rules (Sales Quest)

The engine turns stored inputs (season config, records, adjustments, import log) into the game
state. It is the only place where game numbers are computed. Source of truth: `docs/SPEC.md`,
overridden by `docs/DECISIONS.md`.

## Invariants

1. **Pure.** No DOM, network, storage, React, three.js or zod at runtime in `src/engine`; schema
   types arrive with `import type` only. ESLint enforces this (`eslint.config.js`, engine block).
2. **No clock.** Never `Date.now()` or `new Date()` without arguments. "Now" is a parameter — a local
   timestamp — and the engine uses only its calendar date (`dateOf`, D-11). Dates are `YYYY-MM-DD`.
3. **Deterministic and idempotent.** Same input → same output; re-importing the same data changes
   nothing (FR-STEP-5): daily records merge with "the later value of a metric wins".
4. **No magic numbers.** Weights, cells per working day, overflow %, default daily target — only
   from the season config.
5. **Track geometry (D-24).** `cellsPerLocation = ceil(N × working days / 4)`,
   `trackLength = 4 × cellsPerLocation`, overflow `= ceil(trackLength × overflowPct / 100)`.
   Position 0 is the start; `trackLength` is the finish = 100 % of plan; 4 equal locations.
6. **Roster (R-1…R-5).** Points go to the team of the membership covering the date, else the
   nearest; targets count only working days in the team; fired managers keep their points but
   leave the ranking.
7. **Adjustments** apply on top of the computed result in time order; revoked ones are ignored;
   a reset stores the position it removes (D-17).
8. **Once per game, not per day.** Team targets, headcounts and pace lines come from
   `buildTeamPlans` (`plans.ts`); the timeline gathers day points once (`teamProgressByDay`) and must
   equal `computeTeamProgress` for every day.
9. **Achievements are derived** (D-29): recomputed from the data up to today, never stored. Order:
   manager rules → their bonuses → team positions and the timeline → team rules. Rules read points
   without achievement bonuses. A new rule type = a handler in `src/engine/achievements/rules/`, a
   branch in `runRule`, the schema in `src/data/schemas/achievements.ts`, tests, a line in DECISIONS.
   Thresholds of the starter set are data (`src/data/defaults/achievements.ts`, D-27), not code.

## Workflow

- Failing test first: `tests/unit/engine/*.test.ts`, builders in `tests/support/builders.ts`.
- `npm run test:engine` — engine and schema tests with coverage; `src/engine` stays ≥ 90 % (QA-1).
- `tests/unit/engine/perf.test.ts` stays green: the state with the timeline and the starter
  achievements for 70 managers over a month < 50 ms (ARCH-2).
- A change of game behaviour is a decision: record it in `docs/DECISIONS.md`, and open or close
  the matching line in `docs/OPEN_QUESTIONS.md`.
