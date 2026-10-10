import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { dataDirFor } from './scripts/lib/dataDirs.ts';
import { dataPlugin } from './scripts/lib/dataPlugin.ts';
import { BASE_PATH } from './scripts/lib/site.ts';

// The published game for a build, the demo for the dev server; SQ_DATA_DIR overrides (plan 2a).
export default defineConfig(({ command }) => ({
  base: BASE_PATH,
  plugins: [react(), tailwindcss(), dataPlugin(dataDirFor(command, process.env))],
  server: { port: 5173, strictPort: true },
}));
