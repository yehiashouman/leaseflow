import { defineConfig } from '@playwright/test';
import authentication from './playwright.auth.config';

export default defineConfig({
  ...authentication,
  testMatch: '*.live.spec.ts',
  outputDir: './test-results/live',
  workers: 2,
  projects: authentication.projects?.map((project, index) => ({
    ...project,
    use: { ...project.use, extraHTTPHeaders: { 'X-Forwarded-For': '198.51.100.' + (10 + index) } },
  })),
});
