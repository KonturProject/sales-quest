# Stage 1b — Achievements Implementation Plan

> **For agentic workers:** executed inline in the authoring session (stage 1 process, 06.10.2026); an
> independent review subagent checks the result. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The achievement engine of §6 (ACH-1…ACH-4) with the 21 starter achievements recalibrated for a
two-week game (D-27), tie rules (D-28) and evaluation rules (D-29, D-30); plus the timeline speed-up and
the `computeGameState(prepared, today)` variant queued in `docs/BACKLOG.md` by the plan 1a review.

**Architecture:** `src/data/schemas/achievements.ts` validates achievement definitions; the season
schema checks them against its metrics and weeks. `src/data/defaults/achievements.ts` is the starter
set as data. `src/engine/plans.ts` computes each team's target, headcount and pace line once per game.
`src/engine/achievements/` holds one handler per rule type (`rules/*.ts`, §6.1: a new rule type = a new
handler) and `evaluate.ts`, which runs manager rules → bonuses → timeline → team rules, merges manual
grants and revokes, and returns unlocks, bonuses, the timeline and warnings. `computeGameStateFrom`
composes everything from a `Prepared`.

**Tech Stack:** TypeScript ~6.0.3 (strict), zod ^4.6.5, Vitest ^5.0.3 + coverage-v8.

**Spec:** `docs/SPEC.md` §6, FR-SCORE-5, R-5, ARCH-2; `docs/DECISIONS.md` D-15, D-24…D-30 (override the spec).

## Global Constraints

Same as plan 1a (`2026-10-06-stage-1a-engine-core.md`): pure engine (ARCH-3, D-11), dates as
`YYYY-MM-DD`, game numbers only from the config, Russian messages for admins, English code comments,
relative imports with `.ts`, coverage of `src/engine` ≥ 90 % (QA-1), state + timeline for 70 managers
< 50 ms (ARCH-2), local commits approved for stage 1, push only after the author's "yes" (D-3), never
`--no-verify`. Real exports stay local; numbers from them go to docs only as shares (D-27).

## File map

| File | Responsibility |
|---|---|
| `src/engine/plans.ts` | `TeamPlan`, `buildTeamPlans`, `paceOn`, `teamPacePosition` — once per game |
| `src/engine/pace.ts` | removed: the common line is a case of the team line in `plans.ts` |
| `src/engine/targets.ts` | per-manager daily target, team target and headcount (reference functions) |
| `src/engine/roster.ts` | + `memberOn`, `workingDaysInGame` |
| `src/engine/adjustments.ts` | + `PointEntry`, `pointEntries` (corrections and bonuses alike) |
| `src/engine/progress.ts` | uses plans; adds point entries (bonuses) when given |
| `src/engine/leaderboard.ts` | adds achievement bonuses, row field `achievementPoints` |
| `src/engine/timeline.ts` | uses plans; bonuses when they move teams |
| `src/data/schemas/achievements.ts` | `AchievementRuleSchema`, `AchievementDefSchema`, types |
| `src/data/schemas/season.ts` | `achievements` validated; config-level checks |
| `src/data/defaults/achievements.ts` | starter set (D-27) |
| `src/engine/achievements/types.ts` | `Unlock`, `Candidate`, `RuleContext`, `ManagerDay` |
| `src/engine/achievements/context.ts` | manager days, windows, eligibility, rank boards |
| `src/engine/achievements/rules/*.ts` | one handler per rule type + registry |
| `src/engine/achievements/manual.ts` | grants and revokes (ACH-2, ACH-3) |
| `src/engine/achievements/evaluate.ts` | `evaluateAchievements(prepared, today, plans?)` |
| `src/engine/gameState.ts` | `computeGameStateFrom(prepared, today)`; unlocks, timeline in the state |

---

### Task 1: Team plans once per game (BACKLOG «Скорость таймлайна»)

- [ ] `buildTeamPlans(config, calendar, track)` → `Map<teamId, { teamId, targetPoints, headcount, paceAfter }>`,
  `paceAfter[k]` — pace position after k completed working days (k = 0…n). Target: absolute →
  `pointsPerStep × trackLength` (throws without it); per_capita → headcount × default × days;
  plan_percent → `teamTargetPoints`. Pace: absolute or explicit target → common line; otherwise the
  prefix sums of per-day plan (`dailyTargetPoints`, per_capita — default) over working days.
- [ ] `paceOn(plan, calendar, today)` = `paceAfter[completedWorkingDays]`; `teamPacePosition` moves
  from `pace.ts` to `plans.ts` (wrapper over `buildTeamPlans`); `planOverDays` loses `before`.
- [ ] `computeTeamProgress` takes optional `plans`; `buildTimeline(prepared, today, { plans, bonuses })`;
  `computeGameState` builds plans once.
- [ ] Tests: existing pace / track / targets / progress / timeline tests stay green (imports updated);
  plans test: `paceAfter` with a newcomer equals the old per-day results; perf test shows the gain.

### Task 2: Achievement schema and starter set

- [ ] `AchievementRuleSchema` — discriminated union of the 11 rule types of §6.1 with D-30 changes;
  `AchievementDefSchema` (defaults: `description ''`, `repeatable false`, `bonusPoints 0`,
  `enabled true`) with checks: rule type ↔ scope (team rules need `team`, manual — any), `target`
  needs `week` or `date`, `reach: 'location'` needs `locationIndex`, `everyWeek` only with `week`,
  bonus only for managers.
- [ ] Season schema: `achievements: z.array(AchievementDefSchema).default([])`; checks: unique ids,
  metric ids exist (`points` allowed in `threshold` and `growth`), metric id `points` reserved,
  `target.week` ≤ weeks of the game.
- [ ] `src/data/defaults/achievements.ts` — the D-27 table (icons are placeholder ids until the icon
  manifest of stage 4).
- [ ] Tests: starter set parses inside a config; each check fails with its Russian message.

### Task 3: Engine core and manager rules

- [ ] Types: `Unlock { achievementId, managerId?, teamId?, unlockedAt, week?, source }`;
  `Candidate { managerId?, teamId?, date }`; `RuleContext` (config, calendar, track, today, manager
  days, timeline, `board(week | 'season')`, `eligible`).
- [ ] Context: manager days = series + point corrections inside the period up to today, points by
  weights + corrections (no bonuses, D-29).
- [ ] Handlers: `threshold` (day / week / season, cumulative), `streak` (consecutive working days,
  emit when the run reaches N), `ratio` (cumulative per window), `growth` (week k vs k − 1),
  `target` (personal plan by week end / date), `first` (D-28 tie), `rank` (finished weeks, points > 0,
  `everyWeek`).
- [ ] Evaluator: enabled defs; ACH-4 switch-off with a warning; candidates → eligibility (not fired,
  inside the period, up to today) → keys by `repeatable` (once / per week / per day) → earliest wins;
  manual grants and revokes (D-29); warnings for unknown achievements / subjects / scope mismatch.
- [ ] Tests per rule type and for the evaluator (repeatable keys, fired managers, ACH-2/ACH-3, disabled).

### Task 4: Team rules, bonuses, game state

- [ ] Handlers: `team_position` (location / finish / overflow / overflow_end; `firstOnly` with the
  D-28 tie), `team_pace` (N consecutive timeline days ahead of the own pace), `team_all_members`
  (D-29 membership rule).
- [ ] Bonuses: manager unlocks with `bonusPoints` → point entries on the unlock day (clamped into the
  period) → leaderboard always, team points only with `achievementBonusAffectsSteps`; timeline built
  after manager achievements.
- [ ] `computeGameStateFrom(prepared, today)`; `computeGameState(input, now)` delegates; `GameState`
  gains `unlocks` and `timeline`; achievement warnings join the state's warnings.
- [ ] Tests: each team rule; bonus to the leaderboard and (flag on) to steps; game state carries
  unlocks; the starter set fires every automatic achievement on a crafted two-week scenario.

### Task 5: Performance, docs, review

- [ ] Perf test includes the starter achievements; record the numbers in BACKLOG / commit message.
- [ ] `CLAUDE.md` architecture, `.claude/skills/engine-rules` (achievement invariants), BACKLOG
  (close 1b items, add the roster hint for stage 2 from the calibration).
- [ ] `npm run typecheck && npm run lint && npm test && npm run test:engine && npm run build`.
- [ ] Independent review subagent; fix findings; report to the author; push only after "yes".

## Review fixes (07.10.2026)

The review found: team achievements blind to weekends and to the end of the game; `ratio` judged at
its first good moment; manual grants and revokes without a target week; grants to fired managers;
ACH-4 triggered by foreign metrics and managers; schema gaps; ties at the rank edge decided by name.
Fixed per D-28…D-30 as updated on 07.10.2026: the timeline covers every day of the game (days off
flagged) and its last day takes later adjustments after the game; `ratio` judges finished windows;
grants and revokes carry an optional `date` and act on one instance; `team_all_members` reads
membership once per day.
