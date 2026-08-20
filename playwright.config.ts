import { defineConfig, devices } from '@playwright/test';

const e2ePort = 1421;
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: e2eOrigin,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    trace: 'off',
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_E2E: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: e2eOrigin,
      },
    },
  ],
});
