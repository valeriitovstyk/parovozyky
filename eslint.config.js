import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '.build/**', '.tools/**', 'reference/**', 'node_modules/**', 'tests/golden/**/*.gz', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/app/**/*.ts', 'packages/render/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // The simulator must stay deterministic: no DOM, wall clock or platform randomness.
    files: ['packages/sim/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'sim: use the virtual clock' },
        { name: 'performance', message: 'sim: use the virtual clock' },
        { name: 'window', message: 'sim: no DOM' },
        { name: 'document', message: 'sim: no DOM' },
        { name: 'navigator', message: 'sim: no DOM' },
        { name: 'setTimeout', message: 'sim: use the scheduler' },
        { name: 'setInterval', message: 'sim: use the scheduler' },
        { name: 'requestAnimationFrame', message: 'sim: no DOM' },
        { name: 'crypto', message: 'sim: use the Turbo C RNG' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'sim: use the Turbo C RNG' },
      ],
      'no-restricted-imports': ['error', { patterns: ['three', 'node:*', 'fs', 'path'] }],
    },
  },
);
