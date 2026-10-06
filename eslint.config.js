import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023 },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    // ARCH-3, D-11: the engine is pure — no UI, no runtime dependencies, no clock.
    files: ['src/engine/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'three', '@react-three/*', 'zod'],
              message: 'src/engine — чистые функции без UI и рантайм-зависимостей (ARCH-3).',
            },
            {
              // Any depth: src/engine/achievements/rules/x.ts imports '../../../data/…'.
              regex: '(^|/)data/',
              allowTypeImports: true,
              message: 'Из src/data в движок — только типы: import type (ARCH-3).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'fetch',
        'localStorage',
        'sessionStorage',
        'navigator',
        'location',
        'self',
        'globalThis',
        'performance',
        'crypto',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: '«Сейчас» — параметр движка (D-11).' },
        { object: 'Math', property: 'random', message: 'Движок детерминирован (FR-STEP-5).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: '«Сейчас» — параметр движка (D-11).',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: '«Сейчас» — параметр движка (D-11).',
        },
      ],
    },
  },
]);
