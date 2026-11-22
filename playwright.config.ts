import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: true,
  webServer: {
    command: 'pnpm dev --port 5180 --strictPort',
    port: 5180,
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:5180', viewport: { width: 1024, height: 768 } },
  projects: [
    { name: 'smoke', testIgnore: /perf\.spec/ },
    {
      name: 'perf',
      testMatch: /perf\.spec/,
      // a real GPU (the headless shell renders WebGL in software)
      use: { channel: 'chromium', launchOptions: { args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] } },
    },
  ],
});
