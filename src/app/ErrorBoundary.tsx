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
      <main className="sq-screen sq-ui flex h-full flex-col items-center justify-center gap-3">
        <p className="sq-title sq-caps w-72 text-[13px]">Что-то пошло не так</p>
        <button
          className="sq-button"
          onClick={() => window.location.replace(`${window.location.pathname}#/`)}
        >
          Открыть карту заново
        </button>
      </main>
    );
  }
}
