import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Suites share one schema; serialize fixture cleanup while explicit concurrency tests remain intact.
  test: {
    fileParallelism: false,
    include: ['integration/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
