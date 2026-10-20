import { localDate } from '../data/time.ts';
import { dayMonth } from '../import/grid.ts';
import { canClose } from './finale.ts';
import { DEMO_SEASON_ID } from './newGame.ts';
import type { Session } from './session.ts';

const when = (at: string) => `${dayMonth(at.slice(0, 10))} ${at.slice(11, 16)}`;

function Check({ done, text }: { done: boolean; text: string }) {
  return (
    <li className={done ? 'sq-pace-up' : 'sq-muted'}>
      {done ? '✓' : '○'} {text}
    </li>
  );
}

/** The start screen: the launch checklist, the last imports, the actions. */
export function Home({
  session,
  onImport,
  onNewGame,
  onRoster,
  onCorrections,
  onFinale,
  onPreview,
  onJournal,
}: {
  session: Session;
  onImport: () => void;
  onNewGame: () => void;
  onRoster: () => void;
  onCorrections: () => void;
  /** «Подвести итоги» or «Вернуть игру» (D-59). */
  onFinale: () => void;
  /** «Посмотреть финал»: the finale on the data now, for the author alone (D-60). */
  onPreview: () => void;
  /** «Журнал»: the game's actions, cancel a correction (ADM-LOG, ADM-UNDO). */
  onJournal: () => void;
}) {
  const { config, imports } = session.state.input;
  const demo = config.id === DEMO_SEASON_ID;
  // A new game replaces the demo, or follows a real one that has ended (plan 2a).
  const canStart = demo || localDate(new Date()) > config.period.end;
  const closed = config.status === 'closed';
  const closable = canClose(config, localDate(new Date()));
  const loaded = (profileId: string) => imports.some((i) => i.profileId === profileId);
  return (
    <section className="sq-panel space-y-3 px-4 py-3" data-testid="admin-home">
      {session.expiry && (
        <p role="status" className="sq-plate sq-plate-alarm px-3 py-1">
          {session.expiry}
        </p>
      )}
      <h2 className="sq-name text-lg">
        {config.title} · {dayMonth(config.period.start)}–{dayMonth(config.period.end)}
      </h2>
      <ul className="space-y-1 text-sm">
        <Check done text={`ключ GitHub — вход как ${session.login}`} />
        <Check done={!demo} text={demo ? 'настоящая игра ещё не создана' : 'игра создана'} />
        <Check done={loaded('funnel')} text="воронка загружена" />
        <Check done={loaded('payments')} text="оплаченные счета загружены" />
      </ul>
      <div className="flex flex-wrap gap-2">
        <button className="sq-button" onClick={onImport}>
          Загрузить выгрузку
        </button>
        <button className="sq-button" onClick={onRoster}>
          Состав и команды
        </button>
        <button className="sq-button" onClick={onCorrections}>
          Корректировки
        </button>
        <button className="sq-button" onClick={onJournal}>
          Журнал
        </button>
        <button className="sq-button" disabled={!closed && !closable} onClick={onFinale}>
          {closed ? 'Вернуть игру' : 'Подвести итоги'}
        </button>
        {!closed && (
          <button className="sq-button" onClick={onPreview}>
            Посмотреть финал
          </button>
        )}
        <button className="sq-button" disabled={!canStart} onClick={onNewGame}>
          Новая игра
        </button>
      </div>
      {!closed && !closable && (
        <p className="sq-dim text-sm">
          Итоги можно подвести с последнего дня игры ({dayMonth(config.period.end)}) — после
          последней загрузки. Заранее — «Посмотреть финал»: его видите только вы.
        </p>
      )}
      {!canStart && (
        <p className="sq-dim text-sm">
          Новую игру можно создать после конца текущей ({dayMonth(config.period.end)}).
        </p>
      )}
      {imports.length > 0 && (
        <div className="text-sm">
          <h3 className="sq-caps sq-muted mb-1">Последние загрузки</h3>
          <ul className="sq-parchment space-y-0.5">
            {[...imports]
              .reverse()
              .slice(0, 6)
              .map((i) => (
                <li key={i.id} className="flex flex-wrap gap-x-2">
                  <span>{when(i.at)}</span>
                  <span className="flex-1">{i.fileName}</span>
                  <span>
                    {dayMonth(i.dateRange[0])}–{dayMonth(i.dateRange[1])}
                  </span>
                  {i.warnings.length > 0 && <span>предупреждений: {i.warnings.length}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
