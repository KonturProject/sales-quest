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
    <main className="flex h-full items-center justify-center bg-slate-100 p-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-lg bg-white p-6 shadow"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <h1 className="text-lg font-semibold text-slate-800">Введите код доступа</h1>
        <p className="text-sm text-slate-600">
          Код есть в ссылке на игру. Если ссылки нет — спросите у координатора.
        </p>
        <input
          aria-label="Код доступа"
          autoFocus
          className="w-full rounded border border-slate-300 px-3 py-2"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {wrong && (
          <p role="alert" className="text-sm text-red-700">
            Код не подходит
          </p>
        )}
        <button className="w-full rounded bg-slate-800 px-3 py-2 text-white" type="submit">
          Открыть
        </button>
      </form>
    </main>
  );
}
