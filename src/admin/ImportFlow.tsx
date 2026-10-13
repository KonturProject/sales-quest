import { useState } from 'react';
import { localDate, localTimestamp } from '../data/time.ts';
import type { Resolution } from '../import/apply.ts';
import { onDay } from '../import/intraday.ts';
import { matchPeople } from '../import/match.ts';
import { parseFile, type ParsedFile } from '../import/parseFile.ts';
import { profilesFor } from '../import/profiles.ts';
import { ConflictError } from './github.ts';
import { periodText, prepareImport, toAsk } from './importStep.ts';
import { commitChange, loadRepoState, type RepoState } from './pipeline.ts';
import { PreviewTable } from './PreviewTable.tsx';
import { Resolve } from './Resolve.tsx';
import { gameDay } from './rosterStep.ts';
import { adminMessage, type Session } from './session.ts';

/**
 * An export from a file to a commit (§9, plan 2a): read in a worker → the people the roster does not
 * know → «было → станет» → «Записать». The file never leaves this browser (DATA-2).
 */
export function ImportFlow({
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
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [period, setPeriod] = useState<[string, string] | null>(null);
  /** The intraday file's day as typed (D-55). */
  const [day, setDay] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [step, setStep] = useState<ReturnType<typeof prepareImport> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const config = session.state.input.config;
  const profiles = profilesFor(config.importProfiles);
  const { start, end } = config.period;
  // The intraday file has no dates: its rows take the chosen day. A cleared or half-typed day, or one
  // outside the game, gives no file to preview — never an exception (review 2b-2).
  const dated = (f: ParsedFile): ParsedFile | null => {
    if (f.profile.kind !== 'list') return f;
    return day !== null && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= start && day <= end
      ? { ...f, parsed: onDay(f.parsed, day) }
      : null;
  };
  const current = file ? dated(file) : null;
  const match = current
    ? matchPeople(current.parsed.people, config, current.parsed.period[0])
    : null;
  const asked = current && match ? toAsk(match.unknown, current.parsed) : [];
  const open = asked.filter((u) => !resolutions.has(u.norm)).length;
  // Any change of the answers makes the preview stale: «Записать» only after a new one (review 2a).
  const choose = (next: Map<string, Resolution>) => {
    setResolutions(next);
    setStep(null);
    setNote(null);
  };
  const choosePeriod = (next: [string, string]) => {
    setPeriod(next);
    setStep(null);
    setNote(null);
  };
  const chooseDay = (next: string) => {
    setDay(next);
    setStep(null);
    setNote(null);
  };
  const now = () => localTimestamp(new Date());

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setStep(null);
    setNote(null);
    try {
      const parsed = await parseFile(f, profiles, gameDay(config, localDate(new Date())));
      setFile(parsed);
      setDay(parsed.profile.kind === 'list' ? parsed.parsed.period[0] : null);
      setPeriod(parsed.profile.kind === 'events' ? parsed.parsed.period : null);
      setResolutions(new Map());
    } catch (e) {
      setFile(null);
      setError(adminMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = (state: RepoState) => {
    if (!current) return;
    setError(null);
    try {
      setStep(
        prepareImport(state, current, resolutions, {
          by: session.login,
          at: now(),
          now: now(),
          ...(period ? { period } : {}),
        }),
      );
    } catch (e) {
      setError(adminMessage(e));
    }
  };

  const save = async () => {
    if (!step) return;
    setBusy(true);
    setError(null);
    try {
      // On the read the preview was made of: a newer head is a conflict, not a silent revert.
      const result = await commitChange(session.repo, step.state, step.result.input, {
        phrase: session.phrase,
        keys: session.keys,
        message: step.message,
        by: session.login,
        now: now(),
      });
      if (result === 'unchanged') setNote('Нечего записывать: эти данные уже есть в игре');
      else onCommitted(result.rev);
    } catch (e) {
      if (e instanceof ConflictError) {
        // Another tab or admin wrote meanwhile: the same file on the fresh data, a new preview.
        try {
          const fresh = await loadRepoState(session.repo, session.phrase, session.keys);
          onState(fresh);
          preview(fresh);
          setNote(e.message);
        } catch (again) {
          setError(adminMessage(again));
        }
      } else setError(adminMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sq-panel space-y-3 px-4 py-3">
      <div className="sq-title sq-caps">Загрузка выгрузки</div>
      <label className="block text-sm">
        Файл выгрузки (воронка по дням, оплаченные счета или промежуточные итоги, .xlsx) — он не
        покидает этот браузер
        <input
          className="mt-1 block"
          type="file"
          accept=".xlsx"
          data-testid="import-file"
          disabled={busy}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </label>
      {busy && !step && <p className="sq-muted">Разбираю файл…</p>}
      {file && (
        <div className="space-y-3">
          {current && match && (
            <p className="text-sm">
              {current.profile.title}: {periodText(current.parsed.period)}, людей{' '}
              {current.parsed.people.length}, узнано {match.managerOf.size}.
            </p>
          )}
          {file.profile.kind === 'list' && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              В файле нет дат — записать за день
              <input
                type="date"
                aria-label="День"
                className="sq-input w-auto"
                min={start}
                max={end}
                value={day ?? ''}
                onChange={(e) => chooseDay(e.target.value)}
              />
              {current ? (
                <span className="italic">
                  {current.parsed.metrics
                    .map((id) => config.metrics.find((m) => m.id === id)?.title ?? id)
                    .join(' и ')}{' '}
                  за этот день заменятся числами файла
                </span>
              ) : (
                <span className="sq-pace-down">укажите день игры</span>
              )}
            </p>
          )}
          {period && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Файл полный за период
              <input
                type="date"
                aria-label="Начало периода"
                className="sq-input w-auto"
                value={period[0]}
                onChange={(e) => choosePeriod([e.target.value, period[1]])}
              />
              —
              <input
                type="date"
                aria-label="Конец периода"
                className="sq-input w-auto"
                value={period[1]}
                onChange={(e) => choosePeriod([period[0], e.target.value])}
              />
              <span className="sq-dim">(дни без оплат в нём станут нулями)</span>
            </p>
          )}
          {asked.length > 0 && (
            <Resolve unknown={asked} config={config} resolutions={resolutions} onChange={choose} />
          )}
          <button
            className="sq-button"
            disabled={!current || open > 0 || busy}
            onClick={() => preview(session.state)}
          >
            {open > 0 ? `Осталось решить: ${open}` : 'Показать превью'}
          </button>
        </div>
      )}
      {note && (
        <p role="status" className="sq-plate sq-plate-alarm px-3 py-1.5">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="sq-pace-down text-sm">
          {error}
        </p>
      )}
      {step && (
        <div className="space-y-3">
          <PreviewTable preview={step.preview} summary={step.result.summary} />
          <p className="sq-dim text-sm">Подпись в истории: {step.message}</p>
          <button
            className="sq-button"
            data-testid="commit-button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Записываю…' : 'Записать'}
          </button>
        </div>
      )}
      <button className="sq-button" disabled={busy} onClick={onCancel}>
        Назад
      </button>
    </section>
  );
}
