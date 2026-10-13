import { useState } from 'react';
import { localDate, localTimestamp } from '../data/time.ts';
import type { Resolution } from '../import/apply.ts';
import { dayMonth } from '../import/grid.ts';
import { matchPeople } from '../import/match.ts';
import { parseFile, type ParsedFile } from '../import/parseFile.ts';
import { DEFAULT_PROFILES } from '../import/profiles.ts';
import { ConflictError } from './github.ts';
import { prepareImport, toAsk } from './importStep.ts';
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
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [step, setStep] = useState<ReturnType<typeof prepareImport> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const config = session.state.input.config;
  const profiles = config.importProfiles.length > 0 ? config.importProfiles : DEFAULT_PROFILES;
  const match = file ? matchPeople(file.parsed.people, config, file.parsed.period[0]) : null;
  const asked = file && match ? toAsk(match.unknown, file.parsed) : [];
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
    if (!file) return;
    setError(null);
    try {
      setStep(
        prepareImport(state, file, resolutions, {
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
        Файл выгрузки (воронка по дням или оплаченные счета, .xlsx) — он не покидает этот браузер
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
      {file && match && (
        <div className="space-y-3">
          <p className="text-sm">
            {file.profile.title}: {dayMonth(file.parsed.period[0])}–
            {dayMonth(file.parsed.period[1])}, людей {file.parsed.people.length}, узнано{' '}
            {match.managerOf.size}.
          </p>
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
            disabled={open > 0 || busy}
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
