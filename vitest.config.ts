import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'golden',
          include: ['tests/golden/**/*.test.ts'],
          environment: 'node',
          testTimeout: 600_000,
        },
      },
    ],
  },
});
