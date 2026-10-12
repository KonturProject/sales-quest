import { defineConfig } from '@playwright/test';
import { BASE_PATH } from './scripts/lib/site.ts';

const PORT = 4173;
// 127.0.0.1, not localhost: on the author's PC the IPv6 loopback ([::1], where localhost resolves first)
// stopped taking connections between processes on 12.10.2026 — the server never answered the tests.
const url = `http://127.0.0.1:${PORT}${BASE_PATH}`;

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
  // QA-4 runs alone after the rest: other tests would take its CPU (review 3a).
  projects: [
    { name: 'e2e', testIgnore: /perf\.spec\.ts/ },
    { name: 'perf', testMatch: /perf\.spec\.ts/, dependencies: ['e2e'] },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    // The tests run on the demo (fictional people, a public phrase), never on the real game (plan 2a).
    env: { SQ_DATA_DIR: 'tests/fixtures/demo-data' },
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
