import type { SeasonConfig } from '../data/schemas/season.ts';
import type { Resolution } from '../import/apply.ts';
import type { Unknown } from '../import/match.ts';

const encode = (r: Resolution | undefined) =>
  !r
    ? ''
    : r.kind === 'ignore'
      ? 'ignore'
      : r.kind === 'new'
        ? `new:${r.teamId}`
        : `link:${r.managerId}`;

const decode = (v: string): Resolution | null => {
  if (v === 'ignore') return { kind: 'ignore' };
  if (v.startsWith('new:')) return { kind: 'new', teamId: v.slice(4) };
  if (v.startsWith('link:')) return { kind: 'link', managerId: v.slice(5) };
  return null;
};

/** People the roster does not know (DATA-10): an existing operator, a new one, or ignore always. */
export function Resolve({
  unknown,
  config,
  resolutions,
  onChange,
}: {
  unknown: Unknown[];
  config: SeasonConfig;
  resolutions: Map<string, Resolution>;
  onChange: (next: Map<string, Resolution>) => void;
}) {
  const managers = [...config.managers].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  const teams = [...config.teams].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-2 text-sm" data-testid="resolve-list">
      <p className="sq-muted">
        Этих людей нет в составе. Выберите для каждого — выбор запомнится, второй раз не спросим.
      </p>
      <ul className="space-y-1.5">
        {unknown.map((u) => (
          <li key={u.norm} className="flex flex-wrap items-center gap-2">
            <span className="sq-name min-w-48">{u.name}</span>
            {u.group && <span className="sq-dim">{u.group}</span>}
            <select
              aria-label={`Кто это: ${u.name}`}
              className="sq-input max-w-md flex-1"
              value={encode(resolutions.get(u.norm))}
              onChange={(e) => {
                const next = new Map(resolutions);
                const r = decode(e.target.value);
                if (r) next.set(u.norm, r);
                else next.delete(u.norm);
                onChange(next);
              }}
            >
              <option value="">— выберите —</option>
              <optgroup label="Новый оператор в команде">
                {teams.map((t) => (
                  <option key={t.id} value={`new:${t.id}`}>
                    новый — команда {t.leaderName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Это оператор из состава">
                {managers.map((m) => (
                  <option key={m.id} value={`link:${m.id}`}>
                    это {m.fullName}
                  </option>
                ))}
              </optgroup>
              <option value="ignore">игнорировать всегда</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
