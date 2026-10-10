import { useState } from 'react';

/** «Введите код доступа» (SEC-7): shown without a phrase or with one that does not decrypt. */
export function AccessGate({
  wrong,
  onSubmit,
}: {
  wrong: boolean;
  onSubmit: (phrase: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <main className="sq-screen sq-ui flex h-full items-center justify-center p-4">
      <form
        className="sq-panel w-full max-w-sm space-y-3 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <h1 className="sq-title sq-caps text-[13px]">Введите код доступа</h1>
        <p className="sq-muted text-sm">
          Код есть в ссылке на игру. Если ссылки нет — спросите у координатора.
        </p>
        <input
          aria-label="Код доступа"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="sq-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {wrong && (
          <p role="alert" className="sq-pace-down text-sm">
            Код не подходит
          </p>
        )}
        <button className="sq-button w-full" type="submit">
          Открыть
        </button>
      </form>
    </main>
  );
}
