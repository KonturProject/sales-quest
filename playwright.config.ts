import { defineConfig } from '@playwright/test';
import { BASE_PATH } from './scripts/lib/site.ts';

const PORT = 4173;
const url = `http://localhost:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  use: {
    baseURL: url,
    // The installed Chrome: no Playwright browser download. Software WebGL (SwiftShader) works
    // without a GPU and is a pessimistic stand-in for Intel HD graphics (D-7).
    channel: 'chrome',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
