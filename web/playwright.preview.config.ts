import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'preview.spec.ts',
  outputDir: './test-results/preview',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175/leaseflow/',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5175 --mode github-preview --strictPort',
    url: 'http://127.0.0.1:5175/leaseflow/',
    reuseExistingServer: !process.env.CI,
  },
});
