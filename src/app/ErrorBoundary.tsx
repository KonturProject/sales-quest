import { Component, type ReactNode } from 'react';

/** The last line of defence: a broken render shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-800">
        <p>Что-то пошло не так.</p>
        <button
          className="rounded bg-slate-800 px-3 py-2 text-white"
          onClick={() => window.location.replace(`${window.location.pathname}#/`)}
        >
          Открыть карту заново
        </button>
      </main>
    );
  }
}
