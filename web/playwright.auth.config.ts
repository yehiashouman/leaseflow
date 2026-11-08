import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'auth.live.spec.ts',
  outputDir: './test-results/auth',
  timeout: 60000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run start -w api',
      cwd: new URL('../', import.meta.url).pathname,
      url: 'http://127.0.0.1:3000/health/ready',
      reuseExistingServer: false,
      env: {
        PORT: '3000',
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        CORS_ORIGINS: 'http://127.0.0.1:5176',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort',
      url: 'http://127.0.0.1:5176',
      reuseExistingServer: false,
    },
  ],
});
