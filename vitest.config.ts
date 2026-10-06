import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      reporter: ['text-summary', 'text'],
      // QA-1: the engine is covered at least to 90 %.
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
