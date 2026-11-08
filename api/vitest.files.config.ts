import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['acceptance/files.test.ts'], testTimeout: 60000, hookTimeout: 60000 },
});
