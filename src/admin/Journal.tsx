import { useEffect, useRef, useState } from 'react';
import type { Adjustment } from '../data/schemas/records.ts';
import { localTimestamp } from '../data/time.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { manualCount } from '../finale/results.ts';
import { dayMonth } from '../import/grid.ts';
import { BatchDraft } from './BatchDraft.tsx';
import { ChangesTable } from './ChangesTable.tsx';
import {
  commitOf,
  entryDetails,
  journalOf,
  pastDoubles,
  prepareCancels,
  whoAndDay,
  type Cancel,
  type EntryDetails,
  type JournalEntry,
  type JournalKind,
  type PastDouble,
} from './journal.ts';
import { loadRepoState, type RepoState } from './pipeline.ts';
import { adminMessage, type Session } from './session.ts';

/** The commits read for the list: a whole game fits many times over (~40 by its middle). */
const HISTORY_MAX = 300;

const KIND_WORD: Record<JournalKind, string> = {
  import: 'Загрузка',
  corrections: 'Корректировки',
  cancels: 'Отмена',
  roster: 'Состав',
  finale: 'Итоги',
  launch: 'Новая игра',
  other: 'Другое',
};

type Filter = 'all' | 'import' | 'corrections' | 'cancels' | 'roster' | 'finale';
const FILTERS: { id: Filter; title: string; kinds: JournalKind[] }[] = [
  { id: 'all', title: 'Все', kinds: [] },
  { id: 'import', title: 'Загрузки', kinds: ['import'] },
  { id: 'corrections', title: 'Корректировки', kinds: ['corrections'] },
  { id: 'cancels', title: 'Отмены', kinds: ['cancels'] },
  { id: 'roster', title: 'Состав', kinds: ['roster'] },
  { id: 'finale', title: 'Итоги', kinds: ['finale', 'launch'] },
];

/** Kinds whose commit has details to open: what the season was before and after it. */
const DETAILED: JournalKind[] = ['import', 'corrections', 'cancels'];

/** `20.10 13:33` of a GitHub moment, in this browser's time. */
function when(iso: string): string {
  const local = localTimestamp(new Date(iso));
  return `${dayMonth(local.slice(0, 10))} ${local.slice(11, 16)}`;
}

/**
 * «Журнал» (ADM-LOG, ADM-UNDO, 2b-3): the season's actions from the repository's history, a filter by kind; an
 * action opened shows what it changed, read and decrypted then (its commit and the one before, cached for the
 * visit); past double counts flagged; corrections cancelled as a batch — one commit «отмена корректировок: N».
 */
export function Journal({
  session,
  onState,
  onCancel,
  onCommitted,
}: {
  session: Session;
  onState: (state: RepoState) => void;
  onCancel: () => void;
  onCommitted: (rev: string) => void;
}) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [doubles, setDoubles] = useState<PastDouble[] | null>(null);
  const [doublesError, setDoublesError] = useState<string | null>(null);
  const [cancels, setCancels] = useState<Cancel[]>([]);
  /** The batch's moment (the cancels' `revoked.at`): a new cancel, a new moment. */
  const [at, setAt] = useState(() => localTimestamp(new Date()));
  const [busy, setBusy] = useState(false);
  const states = useRef(new Map<string, Promise<EngineInput>>());
  const now = session.state.input;
  const { repo, phrase, keys } = session;
  const seasonId = session.state.version.seasonId;

  /** The season at a commit, read once per visit. */
  const stateAt = (sha: string): Promise<EngineInput> => {
    let found = states.current.get(sha);
    if (!found) {
      found = loadRepoState(repo, phrase, keys, sha).then((s) => s.input);
      // A failed read is not cached: «Подробнее» again tries again.
      found.catch(() => states.current.delete(sha));
      states.current.set(sha, found);
    }
    return found;
  };

  useEffect(() => {
    let live = true;
    repo
      .history('data', HISTORY_MAX)
      .then((commits) => {
        if (live) setEntries(journalOf(commits, seasonId));
      })
      .catch((e: unknown) => {
        if (live) setError(`Историю прочитать не удалось: ${adminMessage(e)}`);
      });
    return () => {
      live = false;
    };
  }, [repo, seasonId]);

  // The past double counts: each active hand-added count against the records at its own commit.
  useEffect(() => {
    if (!entries) return;
    let live = true;
    const positive = now.adjustments.filter((a) => (manualCount(a, now.config)?.count ?? 0) > 0);
    const at = new Map<string, Promise<EngineInput | undefined>>();
    for (const a of positive) {
      const entry = commitOf(entries, a);
      at.set(a.id, entry ? stateAt(entry.sha) : Promise.resolve(undefined));
    }
    Promise.all([...at].map(async ([id, p]) => [id, await p] as const))
      .then((pairs) => {
        const then = new Map(pairs);
        if (live) setDoubles(pastDoubles(now, (id) => then.get(id)));
      })
      .catch((e: unknown) => {
        if (live) setDoublesError(`Проверить прошлые корректировки не удалось: ${adminMessage(e)}`);
      });
    return () => {
      live = false;
    };
    // `stateAt` reads through the visit's cache; the check runs once per list and season read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, now]);

  const addCancel = (id: string, reason: string) => {
    if (cancels.some((c) => c.id === id)) return;
    setCancels([...cancels, { id, reason }]);
    setAt(localTimestamp(new Date()));
  };
  const view = prepareCancels(session.state, cancels, { by: session.login, now: at });
  const shown = entries?.filter((e) => {
    const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? [];
    return kinds.length === 0 || kinds.includes(e.kind);
  });

  return (
    <div className="space-y-3" data-testid="journal">
      <BatchDraft
        session={session}
        name="cancels"
        title="Отмены"
        batch={cancels}
        view={view}
        onRemove={(index) => setCancels(cancels.filter((_, i) => i !== index))}
        onWritten={() => setCancels([])}
        onState={onState}
        onCommitted={onCommitted}
        busy={busy}
        setBusy={setBusy}
      />
      <section className="sq-panel space-y-3 px-4 py-3">
        <div className="sq-title sq-caps">Журнал</div>
        <DoublesPanel
          doubles={doubles}
          error={doublesError}
          input={now}
          disabled={busy}
          onCancel={addCancel}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Что показать">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              // The chosen filter reads brighter and underlined: `aria-pressed` alone is not seen.
              className="sq-button aria-pressed:text-(--sq-gold-hi) aria-pressed:underline aria-pressed:underline-offset-4"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.title}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="sq-plate sq-plate-alarm px-3 py-1.5">
            {error}
          </p>
        )}
        {!entries && !error && <p className="sq-muted">Читаю историю…</p>}
        {shown && (
          <ul aria-label="Журнал" className="space-y-1 text-sm">
            {shown.map((e) => (
              <Entry
                key={e.sha}
                entry={e}
                now={now}
                stateAt={stateAt}
                disabled={busy}
                onCancel={addCancel}
              />
            ))}
          </ul>
        )}
      </section>
      <button className="sq-button" disabled={busy} onClick={onCancel}>
        Назад
      </button>
    </div>
  );
}

function Entry({
  entry,
  now,
  stateAt,
  disabled,
  onCancel,
}: {
  entry: JournalEntry;
  now: EngineInput;
  stateAt: (sha: string) => Promise<EngineInput>;
  disabled: boolean;
  onCancel: (id: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<EntryDetails | null>(null);
  const [before, setBefore] = useState<EngineInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const can = DETAILED.includes(entry.kind) && entry.parent !== null;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || details || entry.parent === null) return;
    setError(null);
    Promise.all([stateAt(entry.parent), stateAt(entry.sha)])
      .then(([b, a]) => {
        setBefore(b);
        setDetails(entryDetails(b, a));
      })
      .catch((e: unknown) => setError(`Подробности прочитать не удалось: ${adminMessage(e)}`));
  };
  return (
    <li className="sq-parchment space-y-1 px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3">
        <span className="font-bold">{when(entry.at)}</span>
        <span className="sq-caps text-xs">{KIND_WORD[entry.kind]}</span>
        <span className="flex-1">{entry.line}</span>
        <span className="text-xs">{entry.by}</span>
        {can && (
          <button className="sq-button" aria-expanded={open} onClick={toggle}>
            Подробнее
          </button>
        )}
      </div>
      {open && error && (
        <p role="alert" className="sq-pace-down">
          {error}
        </p>
      )}
      {open && !details && !error && <p className="italic">Читаю версию данных…</p>}
      {open && details && before && (
        <Details
          details={details}
          before={before}
          now={now}
          disabled={disabled}
          onCancel={onCancel}
        />
      )}
    </li>
  );
}

function Details({
  details,
  before,
  now,
  disabled,
  onCancel,
}: {
  details: EntryDetails;
  before: EngineInput;
  now: EngineInput;
  disabled: boolean;
  onCancel: (id: string, reason: string) => void;
}) {
  const current = new Map(now.adjustments.map((a) => [a.id, a]));
  return (
    <div className="space-y-2">
      {details.imports.map((i) => (
        <p key={i.id}>
          Файл «{i.fileName}», дни {dayMonth(i.dateRange[0])}–{dayMonth(i.dateRange[1])}
        </p>
      ))}
      {details.imports.length > 0 &&
        (details.changes.length > 0 ? (
          <ChangesTable changes={details.changes} config={now.config} />
        ) : (
          <p className="italic">Файл ничего не поменял в показателях операторов.</p>
        ))}
      {details.added.length > 0 && (
        <ul aria-label="Корректировки этой записи" className="space-y-1">
          {details.added.map((a) => (
            <Correction
              key={a.id}
              adjustment={current.get(a.id) ?? a}
              input={now}
              gone={!current.has(a.id)}
              disabled={disabled}
              onCancel={onCancel}
            />
          ))}
        </ul>
      )}
      {details.revoked.length > 0 && (
        <ul aria-label="Отменены этой записью" className="space-y-1">
          {details.revoked.map((a) => (
            <li key={a.id} className="line-through">
              «{a.reason}» — {whoAndDay(before, a)}: {a.revoked?.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A correction with its state now: active — «Отменить»; cancelled — struck through with when and why. */
function Correction({
  adjustment: a,
  input,
  gone,
  disabled,
  onCancel,
}: {
  adjustment: Adjustment;
  input: EngineInput;
  gone: boolean;
  disabled: boolean;
  onCancel: (id: string, reason: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className={a.revoked ? 'flex-1 line-through' : 'flex-1'}>
        «{a.reason}» — {whoAndDay(input, a)}
      </span>
      {a.revoked ? (
        <span className="text-xs">
          отменена {dayMonth(a.revoked.at.slice(0, 10))}: {a.revoked.reason}
        </span>
      ) : gone ? (
        <span className="text-xs">её больше нет в данных</span>
      ) : (
        <CancelButton id={a.id} disabled={disabled} onCancel={onCancel} />
      )}
    </li>
  );
}

/** «Отменить» → «Причина отмены» → «В отмены»: the cancel joins the batch at the top. */
function CancelButton({
  id,
  disabled,
  onCancel,
}: {
  id: string;
  disabled: boolean;
  onCancel: (id: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open)
    return (
      <button className="sq-button" disabled={disabled} onClick={() => setOpen(true)}>
        Отменить
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onCancel(id, reason);
        setOpen(false);
      }}
    >
      <input
        className="sq-input"
        aria-label="Причина отмены"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button className="sq-button" type="submit" disabled={disabled}>
        В отмены
      </button>
      <button className="sq-button" type="button" onClick={() => setOpen(false)}>
        Отмена
      </button>
    </form>
  );
}

/** «Похоже на двойной счёт»: hand-added counts the exports have brought since. */
function DoublesPanel({
  doubles,
  error,
  input,
  disabled,
  onCancel,
}: {
  doubles: PastDouble[] | null;
  error: string | null;
  input: EngineInput;
  disabled: boolean;
  onCancel: (id: string, reason: string) => void;
}) {
  if (error)
    return (
      <p role="alert" className="sq-pace-down text-sm">
        {error}
      </p>
    );
  if (!doubles) return <p className="sq-muted text-sm">Проверяю прошлые корректировки…</p>;
  if (doubles.length === 0)
    return (
      <p className="sq-dim text-sm">Прошлые корректировки проверены — двойного счёта не видно.</p>
    );
  const byId = new Map(input.adjustments.map((a) => [a.id, a]));
  return (
    <section
      aria-label="Похоже на двойной счёт"
      className="sq-plate sq-plate-alarm space-y-2 px-3 py-2 text-sm"
    >
      <h3 className="sq-caps">Похоже на двойной счёт</h3>
      {doubles.map((d) => {
        const metric = input.config.metrics.find((m) => m.id === d.metricId)?.title ?? d.metricId;
        const name =
          input.config.managers.find((m) => m.id === d.managerId)?.fullName ?? d.managerId;
        return (
          <div key={`${d.managerId}|${d.date}|${d.metricId}`} className="space-y-1">
            <p>
              {name}, {dayMonth(d.date)}, {metric}: по выгрузкам было {d.then}, стало {d.now};
              вручную добавлено +{d.manual}.
            </p>
            <ul className="space-y-1">
              {d.adjustmentIds.map((id) => (
                <li key={id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">«{byId.get(id)?.reason ?? id}»</span>
                  <CancelButton id={id} disabled={disabled} onCancel={onCancel} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
