import { defineConfig } from '@playwright/test';
import authentication from './playwright.auth.config';
export default defineConfig({
  ...authentication,
  testMatch: 'documents.files.spec.ts',
  outputDir: './test-results/files',
  workers: 1,
});
