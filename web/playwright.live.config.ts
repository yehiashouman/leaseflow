import { defineConfig } from '@playwright/test';
import authentication from './playwright.auth.config';

export default defineConfig({
  ...authentication,
  testMatch: '*.live.spec.ts',
  outputDir: './test-results/live',
  workers: 2,
});
