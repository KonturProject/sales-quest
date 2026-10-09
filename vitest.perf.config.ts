import { defineConfig } from 'vitest/config';

// Wall-clock budgets (ARCH-2): one file at a time, no coverage, nothing else running alongside.
export default defineConfig({
  test: {
    include: ['tests/perf/**/*.test.ts'],
    fileParallelism: false,
  },
});
