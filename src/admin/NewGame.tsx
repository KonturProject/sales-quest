import { useState } from 'react';
import { seasonDefaults } from '../data/defaults/season.ts';
import { localDate, localTimestamp } from '../data/time.ts';
import { buildCalendar } from '../engine/calendar.ts';
import { addDays, isoWeekday } from '../engine/dates.ts';
import type { EngineInput } from '../engine/prepare.ts';
import { buildTrack, type Track } from '../engine/track.ts';
import { dayMonth } from '../import/grid.ts';
import type { Person } from '../import/parsed.ts';
import { parseFile } from '../import/parseFile.ts';
import { DEFAULT_PROFILES } from '../import/profiles.ts';
import { VARIANTS } from '../scene/heroCatalog.ts';
import { ConflictError } from './github.ts';
import {
  DEFAULT_NORMS,
  weeklyNorms,
  buildSeason,
  draftFromFunnel,
  generatePhrase,
  phraseProblem,
  viewerLinks,
  type TeamDraft,
} from './newGame.ts';
import { launchChange, loadRepoState, type RepoState } from './pipeline.ts';
import { adminMessage, type Session } from './session.ts';

const HERO_TITLES: Record<string, string> = {
  knight: 'Рыцарь с мечом и щитом',
  mage: 'Маг с посохом',
  barbarian: 'Варвар с секирой',
  rogue: 'Следопыт с арбалетом',
  'rogue-hooded': 'Разбойник с ножами',
  'knight-2h': 'Рыцарь с двуручным мечом',
  'mage-book': 'Маг с книгой',
  'barbarian-shield': 'Варвар со щитом',
  'rogue-knives': 'Следопыт с ножами',
  'rogue-hooded-crossbow': 'Разбойник с арбалетом',
};
const COLORS = [
  '#E4572E',
  '#29335C',
  '#F3A712',
  '#669BBC',
  '#4C956C',
  '#8E5572',
  '#D1495B',
  '#00798C',
];

type TeamRow = TeamDraft & { plays: boolean };
type PersonRow = Person & { on: boolean; quiet: boolean };

const nextMonday = (today: string) => addDays(today, 8 - isoWeekday(today));
const titleOf = (start: string, end: string) => `Игра ${dayMonth(start)}–${dayMonth(end)}`;

/**
 * «Новая игра» (§10, plan 2a): dates → the funnel → teams → operators → norms → the phrase →
 * «Создать игру»: one commit writes the season and replaces the demo. The file stays in this browser.
 */
export function NewGame({
  session,
  onState,
  onCancel,
  onLaunched,
}: {
  session: Session;
  onState: (state: RepoState) => void;
  onCancel: () => void;
  onLaunched: (launch: { rev: string; phrase: string }) => void;
}) {
  const metrics = seasonDefaults().metrics;
  const [start, setStart] = useState(() => nextMonday(localDate(new Date())));
  const [end, setEnd] = useState(() => addDays(nextMonday(localDate(new Date())), 13));
  const [title, setTitle] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holiday, setHoliday] = useState('');
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [norms, setNorms] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(DEFAULT_NORMS).map(([k, v]) => [k, String(v)])),
  );
  const [phrase, setPhrase] = useState(() => generatePhrase());
  const [saved, setSaved] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gameTitle = title ?? titleOf(start, end);
  const playing = teams.filter((t) => t.plays);
  const codes = new Set(playing.map((t) => t.code));
  const operators = people.filter((p) => p.on && p.group !== null && codes.has(p.group));
  // Left out though they had numbers: imports will not ask about them (review 2a).
  const excluded = people.filter((p) => !p.quiet && !operators.includes(p));
  const site = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const links = viewerLinks(site, phrase.trim());
  const problem = phraseProblem(phrase);

  // A few milliseconds for a department: built on every render, no memo to keep in step.
  const built = ((): { error: string } | { input: EngineInput; days: number; track: Track } => {
    if (teams.length === 0) return { error: 'загрузите воронку по дням — из неё берутся команды' };
    try {
      const input = buildSeason({
        start,
        end,
        holidays,
        title: gameTitle,
        teams: playing.map((t, i) => ({ ...t, order: i + 1 })),
        operators,
        excluded,
        norms: Object.fromEntries(Object.entries(norms).map(([k, v]) => [k, Number(v) || 0])),
      });
      const days = buildCalendar(input.config).workingDays.length;
      return { input, days, track: buildTrack(input.config, days) };
    } catch (e) {
      return { error: adminMessage(e) };
    }
  })();

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setFileNote(null);
    try {
      const file = await parseFile(f, DEFAULT_PROFILES);
      if (file.profile.kind !== 'matrix')
        throw new Error('это не воронка по дням: команды и состав берутся из неё');
      const { groups, active, check } = draftFromFunnel(file.parsed);
      setTeams(
        groups.map((code, i) => ({
          code,
          leaderName: '',
          color: COLORS[i % COLORS.length] as string,
          characterId: (VARIANTS[i % VARIANTS.length] as (typeof VARIANTS)[number]).id,
          order: i + 1,
          plays: true,
        })),
      );
      setPeople([
        ...active.map((p) => ({ ...p, on: true, quiet: false })),
        ...check.map((p) => ({ ...p, on: false, quiet: true })),
      ]);
      setFileNote(
        `${file.fileName}: групп ${groups.length}, с показателями ${active.length}, без показателей ${check.length}`,
      );
    } catch (e) {
      setFileNote(adminMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setTeam = (code: string, patch: Partial<TeamRow>) =>
    setTeams((list) => list.map((t) => (t.code === code ? { ...t, ...patch } : t)));
  const moveUp = (i: number) =>
    setTeams((list) => {
      const next = [...list];
      [next[i - 1], next[i]] = [next[i] as TeamRow, next[i - 1] as TeamRow];
      return next;
    });
  const toggle = (name: string) =>
    setPeople((list) => list.map((p) => (p.name === name ? { ...p, on: !p.on } : p)));

  const create = async () => {
    if (!('input' in built)) return;
    setBusy(true);
    setError(null);
    try {
      const launch = await launchChange(session.repo, session.state, built.input, {
        phrase: phrase.trim(),
        by: session.login,
        now: localTimestamp(new Date()),
      });
      onLaunched({ rev: launch.rev, phrase: phrase.trim() });
    } catch (e) {
      if (e instanceof ConflictError) {
        try {
          onState(await loadRepoState(session.repo, session.phrase, session.keys));
          setError(`${e.message} Нажмите «Создать игру» ещё раз.`);
        } catch (again) {
          setError(adminMessage(again));
        }
      } else setError(adminMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => void navigator.clipboard?.writeText(text);
  const groupsOf = (quiet: boolean) => people.filter((p) => p.quiet === quiet);

  return (
    <section className="sq-panel space-y-4 px-4 py-3" data-testid="new-game">
      <div className="sq-title sq-caps">Новая игра</div>

      <fieldset className="space-y-2">
        <legend className="sq-caps sq-muted">1. Даты</legend>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label>
            Начало{' '}
            <input
              type="date"
              className="sq-input w-auto"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Конец{' '}
            <input
              type="date"
              className="sq-input w-auto"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="min-w-64 flex-1">
            Название (видно всем — без имён){' '}
            <input
              className="sq-input"
              value={gameTitle}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Праздники:</span>
          {holidays.map((h) => (
            <button
              key={h}
              className="sq-button"
              title="Убрать"
              onClick={() => setHolidays(holidays.filter((x) => x !== h))}
            >
              {dayMonth(h)} ×
            </button>
          ))}
          <input
            type="date"
            aria-label="Праздничный день"
            className="sq-input w-auto"
            value={holiday}
            onChange={(e) => setHoliday(e.target.value)}
          />
          <button
            className="sq-button"
            disabled={!holiday || holidays.includes(holiday)}
            onClick={() => {
              setHolidays([...holidays, holiday].sort());
              setHoliday('');
            }}
          >
            Добавить
          </button>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="sq-caps sq-muted">2. Воронка по дням — из неё команды и состав</legend>
        <input
          type="file"
          accept=".xlsx"
          data-testid="new-game-file"
          disabled={busy}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {busy && teams.length === 0 && <p className="sq-muted">Разбираю файл…</p>}
        {fileNote && <p className="text-sm">{fileNote}</p>}
      </fieldset>

      {teams.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="sq-caps sq-muted">
            3. Команды — порядок, руководитель, цвет, герой
          </legend>
          <ul className="space-y-1">
            {teams.map((t, i) => (
              <li key={t.code} className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  className="sq-button"
                  aria-label={`Выше: ${t.code}`}
                  disabled={i === 0}
                  onClick={() => moveUp(i)}
                >
                  ↑
                </button>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={t.plays}
                    onChange={() => setTeam(t.code, { plays: !t.plays })}
                  />
                  {t.code}
                </label>
                <input
                  className="sq-input w-56"
                  aria-label={`Руководитель ${t.code}`}
                  placeholder="Имя руководителя"
                  value={t.leaderName}
                  onChange={(e) => setTeam(t.code, { leaderName: e.target.value })}
                />
                <input
                  type="color"
                  aria-label={`Цвет ${t.code}`}
                  value={t.color}
                  onChange={(e) => setTeam(t.code, { color: e.target.value.toUpperCase() })}
                />
                <select
                  className="sq-input w-auto"
                  aria-label={`Герой ${t.code}`}
                  value={t.characterId}
                  onChange={(e) => setTeam(t.code, { characterId: e.target.value })}
                >
                  {VARIANTS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {HERO_TITLES[v.id] ?? v.id}
                    </option>
                  ))}
                </select>
                <span className="sq-dim">
                  {people.filter((p) => p.on && p.group === t.code).length} чел.
                </span>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {people.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="sq-caps sq-muted">4. Операторы — кто играет</legend>
          {[false, true].map((quiet) =>
            groupsOf(quiet).length === 0 ? null : (
              <div key={String(quiet)} className="text-sm">
                <p className={quiet ? 'sq-pace-down' : 'sq-muted'}>
                  {quiet
                    ? 'Без показателей в файле — проверьте (отпуск, уволен, тестовый); их загрузка спросит, когда появятся числа:'
                    : 'С показателями в файле; снятых с галочки загрузки выгрузок будут пропускать:'}
                </p>
                <ul className="sq-parchment grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupsOf(quiet).map((p) => (
                    <li key={p.name}>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={p.on} onChange={() => toggle(p.name)} />
                        {p.name} <span className="sq-dim">· {p.group ?? 'без группы'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="sq-caps sq-muted">5. Норматив в рабочий день — на каждого</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {metrics.map((m) => (
            <label key={m.id}>
              {m.title}{' '}
              <input
                type="number"
                min="0"
                step="0.1"
                className="sq-input w-20"
                value={norms[m.id] ?? ''}
                onChange={(e) => setNorms({ ...norms, [m.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="sq-dim text-sm" data-testid="weekly-norms">
          В неделю (5 рабочих дней):{' '}
          {metrics
            .map((m) => {
              const week = weeklyNorms({ [m.id]: Number(norms[m.id]) || 0 })[m.id] ?? 0;
              return `${m.title.toLowerCase()} — ${week.toLocaleString('ru-RU')}`;
            })
            .join(' · ')}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="sq-caps sq-muted">6. Фраза доступа — ключ к данным игры</legend>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            className="sq-input flex-1"
            aria-label="Фраза доступа новой игры"
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value);
              setSaved(false);
            }}
          />
          <button
            className="sq-button"
            onClick={() => {
              setPhrase(generatePhrase());
              setSaved(false);
            }}
          >
            Другая
          </button>
        </div>
        {problem ? (
          <p className="sq-pace-down text-sm">{problem}</p>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="sq-plate sq-plate-alarm px-3 py-1">
              Сохраните фразу: без неё данные не открыть, восстановить её нельзя. Ссылки ниже уже
              содержат её — отправляйте их только отделу.
            </p>
            {(
              [
                ['Ссылка для отдела', links.viewers],
                ['Для экрана в офисе', links.tv],
              ] as const
            ).map(([label, url]) => (
              <p key={label} className="flex flex-wrap items-center gap-2">
                <span className="sq-muted">{label}:</span>
                <code className="sq-parchment break-all">{url}</code>
                <button className="sq-button" onClick={() => copy(url)}>
                  Копировать
                </button>
              </p>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={saved} onChange={() => setSaved(!saved)} />
              Фраза сохранена в надёжном месте
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="sq-caps sq-muted">7. Проверка</legend>
        {'input' in built ? (
          <div className="space-y-1 text-sm" data-testid="new-game-summary">
            <p>
              {built.input.config.title}: рабочих дней {built.days}, клеток до финиша{' '}
              {built.track.trackLength} (по {built.track.cellsPerLocation} в локации), операторов{' '}
              {built.input.config.managers.length}.
            </p>
            <ul className="sq-parchment">
              {built.input.config.teams.map((t) => (
                <li key={t.id}>
                  {t.order}. {t.sourceCode} · {t.leaderName} ·{' '}
                  {
                    built.input.config.managers.filter((m) => m.memberships[0]?.teamId === t.id)
                      .length
                  }{' '}
                  чел.
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="sq-pace-down text-sm">{built.error}</p>
        )}
        {session.state.input.config.id === 'demo' && (
          <p className="sq-dim text-sm">Демо-игра будет удалена — сайт покажет новую игру.</p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="sq-pace-down text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="sq-button"
          data-testid="launch-button"
          disabled={busy || !('input' in built) || problem !== null || !saved}
          onClick={() => void create()}
        >
          {busy ? 'Создаю…' : 'Создать игру'}
        </button>
        <button className="sq-button" onClick={onCancel}>
          Назад
        </button>
      </div>
    </section>
  );
}
