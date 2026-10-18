import { useEffect, useState } from 'react';
import type { SeasonConfig } from '../data/schemas/season.ts';
import { CEREMONY_MS, phaseAt, type Step } from '../finale/ceremony.ts';
import type { DepartmentTotals, Finale, PodiumPlace, Significant } from '../finale/results.ts';
import { readFinaleSeen, writeFinaleSeen } from '../finale/seen.ts';
import { dayMonth } from '../import/grid.ts';
import { requestCamera, requestCelebration } from '../scene/commands.ts';
import { plural } from '../text.ts';
import { RARITY_TEXT, type Fresh } from './badges.ts';
import { Gems } from './Badges.tsx';
import { countAt } from './cards.ts';
import { reducedMotion, useRunClock } from './clock.ts';
import { Crest } from './Crest.tsx';

/**
 * The finale of the game (D-59): a ceremony of about a minute, once per closing in this browser — the
 * department's result, the best in each team, significant achievements, the best of the best, the podium with
 * fireworks over the winner — then the results screen over the map until the next game. Plain DOM; the
 * ceremony's clock is a run clock (D-56): it waits for a visible tab, redraws only when a step or a reveal
 * changes (and while the first numbers run up).
 */

/** The department's numbers run up this long at the ceremony's start. */
const COUNT_MS = 2400;
const NO_FRESH: Fresh = { held: new Set(), glint: new Set(), batch: null };
/** Fireworks fired per run, outside the components: a remounted HUD does not fire them again. */
const fired = new Set<string>();
/** Replays asked for on this page: each is a new run of the clock. */
let replays = 0;

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const pct = (share: number) => `${fmt(share * 100)} %`;

/** What the ceremony shows now, as a string the run clock compares: a redraw only when it changes. */
function keyOf(ms: number | null, counts: Record<Step, number>): string {
  if (ms === null) return 'wait';
  const phase = phaseAt(ms, counts);
  if (!phase) return 'done';
  if (phase.step === 'end') return `end:${String(Math.min(COUNT_MS, Math.floor(ms / 100) * 100))}`;
  return `${phase.step}:${String(phase.shown)}`;
}

export function FinaleLayer({
  finale,
  config,
  tv,
}: {
  finale: Finale;
  config: SeasonConfig;
  tv: boolean;
}) {
  const { closedAt } = finale;
  const seasonId = config.id;
  const pending = () => (readFinaleSeen(seasonId) === closedAt ? null : { closedAt, n: 0 });
  const [run, setRun] = useState<{ closedAt: string; n: number } | null>(pending);
  // A new closing while the page is open (after «Вернуть игру» and a second «Подвести итоги»): play it.
  const [known, setKnown] = useState(closedAt);
  if (known !== closedAt) {
    setKnown(closedAt);
    setRun(pending());
  }
  const counts: Record<Step, number> = {
    end: 1,
    best: finale.best.length,
    achievements: finale.significant.length,
    top: finale.top.length,
    podium: finale.podium.length,
  };
  const id = run ? `${run.closedAt}:${String(run.n)}` : null;
  const at = useRunClock(id === null ? null : `finale:${id}`, CEREMONY_MS, (ms) =>
    keyOf(ms, counts),
  );
  const [step, value] = at.split(':') as [string, string | undefined];
  const shown = Number(value ?? 0);
  const winners = finale.podium.filter((p) => p.place === 1).map((p) => p.teamId);

  useEffect(() => {
    if (id === null || at === 'wait' || at === 'done') return;
    if (!fired.has(`${id}:start`)) {
      fired.add(`${id}:start`);
      requestCamera('overview');
      requestCelebration(
        config.teams.map((t) => t.id),
        'gate',
      );
    }
    if (step === 'podium' && shown >= counts.podium && !fired.has(`${id}:win`)) {
      fired.add(`${id}:win`);
      requestCelebration(winners, 'finish');
      const [only] = winners;
      if (winners.length === 1 && only !== undefined) requestCamera({ team: only });
    }
  });
  // Played to its end: remembered, so the next visit shows the results at once.
  useEffect(() => {
    if (at === 'done' && run) writeFinaleSeen(seasonId, run.closedAt);
  }, [at, run, seasonId]);

  const playing = run !== null && at !== 'done';
  return (
    // The ceremony stands at the bottom: the camera puts the winner in the middle of the screen, and the
    // fireworks there must be seen (review D-59); the results screen sits in the middle.
    <div
      className={`flex min-h-0 flex-1 justify-center py-2 ${playing ? 'items-end' : 'items-center'}`}
    >
      {playing ? (
        <Ceremony
          finale={finale}
          config={config}
          step={(step === 'wait' ? 'end' : step) as Step}
          shown={step === 'wait' ? 0 : shown}
          countMs={step === 'end' ? shown : step === 'wait' ? null : COUNT_MS}
        />
      ) : (
        <Results
          finale={finale}
          config={config}
          tv={tv}
          onReplay={() => setRun({ closedAt, n: (replays += 1) })}
        />
      )}
    </div>
  );
}

function Ceremony({
  finale,
  config,
  step,
  shown,
  countMs,
}: {
  finale: Finale;
  config: SeasonConfig;
  step: Step;
  shown: number;
  /** Milliseconds of the numbers' run (null — not started). */
  countMs: number | null;
}) {
  const still = reducedMotion();
  const upTo = (i: number) => i < shown;
  const fromLast = (i: number, n: number) => i >= n - shown;
  return (
    <section
      aria-label="Церемония"
      className="sq-panel pointer-events-none w-full max-w-3xl px-6 py-5 text-center"
    >
      <div key={step} className="sq-moment-in space-y-3">
        {step === 'end' && (
          <>
            <h2 className="sq-name text-2xl">Игра завершена</h2>
            <div className="sq-note">{periodText(config)}</div>
            <Totals totals={finale.totals} ms={still ? COUNT_MS : countMs} big />
          </>
        )}
        {step === 'best' && (
          <>
            <h2 className="sq-name text-xl">Лучшие в командах</h2>
            <BestCards finale={finale} visible={upTo} wide={false} />
          </>
        )}
        {step === 'achievements' && (
          <>
            <h2 className="sq-name text-xl">Значимые достижения</h2>
            <SignificantList rows={finale.significant} visible={upTo} />
          </>
        )}
        {step === 'top' && (
          <>
            <h2 className="sq-name text-xl">Лучшие из лучших</h2>
            <TopList finale={finale} visible={(i) => fromLast(i, finale.top.length)} />
          </>
        )}
        {step === 'podium' && (
          <>
            <h2 className="sq-name text-xl">Пьедестал</h2>
            <Podium places={finale.podium} visible={(i) => fromLast(i, finale.podium.length)} />
          </>
        )}
      </div>
    </section>
  );
}

function Results({
  finale,
  config,
  tv,
  onReplay,
}: {
  finale: Finale;
  config: SeasonConfig;
  tv: boolean;
  onReplay: () => void;
}) {
  const teams = config.teams.length;
  return (
    <section
      aria-label="Итоги игры"
      className="sq-panel pointer-events-auto max-h-full w-full max-w-5xl overflow-auto px-5 py-3"
    >
      <div className="sq-title sq-caps">
        <span className="sq-gem" aria-hidden="true" />
        Игра завершена
        <span className="sq-gem" aria-hidden="true" />
      </div>
      <div className="sq-note text-center">
        {periodText(config)} · {teams} {plural(teams, 'команда', 'команды', 'команд')}, один отдел
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <h3 className="sq-caps sq-bright text-center">Пьедестал</h3>
          <Podium places={finale.podium} visible={() => true} />
          <div className="sq-plate px-3 py-1.5 text-center">
            <div className="sq-note">вместе за игру</div>
            <Totals totals={finale.totals} ms={COUNT_MS} />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="sq-caps sq-bright">Лучшие из лучших</h3>
          <TopList finale={finale} visible={() => true} />
          <h3 className="sq-caps sq-bright">Значимые достижения</h3>
          <SignificantList rows={finale.significant} visible={() => true} />
        </div>
      </div>
      <div className="mt-2">
        <BestCards finale={finale} visible={() => true} />
      </div>
      {!tv && (
        <div className="mt-2 text-center">
          <button className="sq-button" onClick={onReplay}>
            Посмотреть церемонию ещё раз
          </button>
        </div>
      )}
    </section>
  );
}

function periodText(config: SeasonConfig): string {
  return `${dayMonth(config.period.start)}–${dayMonth(config.period.end)}`;
}

/** «Оплаты: 312 · Качественные счета: 2 140 · …», the achievements and the plan; numbers run up from 0. */
function Totals({
  totals,
  ms,
  big = false,
}: {
  totals: DepartmentTotals;
  ms: number | null;
  big?: boolean;
}) {
  const n = (to: number) => fmt(countAt(0, to, ms, COUNT_MS));
  return (
    <div className={`sq-bright ${big ? 'text-lg' : 'text-sm'}`}>
      <div className="flex flex-wrap justify-center gap-x-3">
        {totals.metrics.map((m) => (
          <span key={m.id}>
            {m.title}: {n(m.total)}
          </span>
        ))}
        <span>Ачивки: {n(totals.achievements)}</span>
      </div>
      <div className="sq-note">
        отдел выполнил {pct(countAt(0, totals.planShare, ms, COUNT_MS))} общего плана
      </div>
    </div>
  );
}

/** Second places left, the first in the middle, third places right (ties share a column). */
function Podium({
  places,
  visible,
}: {
  places: PodiumPlace[];
  /** By the index in `places` (sorted by place). */
  visible: (i: number) => boolean;
}) {
  const column = (place: number) => (place === 1 ? 1 : place === 2 ? 0 : 2);
  const indexed = places.map((p, i) => ({ p, i }));
  return (
    <div role="list" aria-label="Пьедестал" className="grid grid-cols-3 items-end gap-2">
      {[0, 1, 2].map((c) => (
        <div key={c} className="flex flex-col items-center justify-end gap-1">
          {indexed
            .filter(({ p }) => column(p.place) === c)
            .map(({ p, i }) => (
              <div
                key={p.teamId}
                role="listitem"
                className={`w-full text-center ${visible(i) ? 'sq-moment-in' : 'invisible'}`}
              >
                <Crest color={p.color} size={c === 1 ? 34 : 28} className="mx-auto" />
                <div className="sq-name truncate text-sm">{p.title}</div>
                <div className="sq-note">
                  клетка {p.position} · {pct(p.progress)} плана
                </div>
                <div className={`sq-step sq-step-${String(Math.min(3, p.place))}`}>{p.place}</div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function TopList({ finale, visible }: { finale: Finale; visible: (i: number) => boolean }) {
  return (
    <ol aria-label="Лучшие из лучших" className="sq-parchment text-left">
      {finale.top.map((t, i) => (
        <li
          key={t.managerId}
          className={`flex items-center gap-2 py-px ${visible(i) ? 'sq-moment-in' : 'invisible'}`}
        >
          <span className="w-5 text-right font-bold">{t.rank}</span>
          <span className="flex-1 truncate">{t.name}</span>
          <Gems badges={t.badges} subject={t.managerId} fresh={NO_FRESH} />
          <span className="font-bold">{fmt(t.points)}</span>
        </li>
      ))}
    </ol>
  );
}

function SignificantList({
  rows,
  visible,
}: {
  rows: Significant[];
  visible: (i: number) => boolean;
}) {
  if (rows.length === 0)
    return <p className="sq-note">легендарных и эпических ачивок в этой игре не было</p>;
  return (
    <ul aria-label="Значимые достижения" className="sq-parchment text-left">
      {rows.map((r, i) => (
        <li
          key={r.achievementId}
          className={`flex items-center gap-1.5 py-px ${visible(i) ? 'sq-moment-in' : 'invisible'}`}
        >
          <span className={`sq-badge sq-rarity-${r.rarity}`} aria-hidden="true" />
          <span className="font-bold">{r.title}</span>
          <span className="sr-only">, {RARITY_TEXT[r.rarity]}</span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-(--sq-ink-soft)">
            {r.holders.join(', ')}
          </span>
          {r.more > 0 && (
            <span className="shrink-0 text-xs text-(--sq-ink-soft)">и ещё {r.more}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function BestCards({
  finale,
  visible,
  wide = true,
}: {
  finale: Finale;
  visible: (i: number) => boolean;
  /** Six in a row on the results screen; three in the ceremony's narrower panel. */
  wide?: boolean;
}) {
  return (
    <ul
      aria-label="Лучшие в командах"
      className={`grid grid-cols-3 gap-1.5 ${wide ? 'lg:grid-cols-6' : ''}`}
    >
      {finale.best.map((b, i) => (
        <li
          key={b.teamId}
          className={`sq-plate px-2 py-1 text-left ${visible(i) ? 'sq-moment-in' : 'invisible'}`}
        >
          <div className="sq-note truncate">лучший в {b.teamTitle}</div>
          <div className="sq-name truncate text-sm">{b.name}</div>
          <div className="sq-muted text-xs">{fmt(b.points)}</div>
        </li>
      ))}
    </ul>
  );
}
