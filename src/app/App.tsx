import { MapScene } from '../scene/MapScene.tsx';
import { useHashRoute } from './useHashRoute.ts';

export function App() {
  const route = useHashRoute();
  if (route.path !== '/') return <NotFound />;
  return (
    <main className="relative h-full w-full">
      <MapScene />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-white/85 px-3 py-2 text-sm text-slate-800 shadow">
        Sales Quest · каркас (этап 0)
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-800">
      <p>Такой страницы нет.</p>
      <a className="text-blue-700 underline" href="#/">
        На карту
      </a>
    </main>
  );
}
