import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BASE_PATH } from './scripts/lib/site.ts';

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
});
