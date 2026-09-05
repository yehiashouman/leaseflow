import { describe, expect, it, vi } from 'vitest';

// Exercises the pure origin-matching logic in isolation with NODE_ENV=production,
// verifying Codespaces wildcards and loopback hosts are rejected outside of
// development/test, and that only exact CORS_ORIGINS entries are honored.
describe('isOriginAllowed in production', () => {
  it('rejects Codespaces and loopback origins, allows only exact CORS_ORIGINS', async () => {
    vi.resetModules();
    const originalEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://app.leaseflow.example';
    process.env.DEMO_MODE = 'false';
    try {
      const { isOriginAllowed } = await import('../src/config.js');
      expect(isOriginAllowed(undefined)).toBe(true);
      expect(isOriginAllowed('https://app.leaseflow.example')).toBe(true);
      expect(isOriginAllowed('https://app.leaseflow.example/')).toBe(true);
      expect(isOriginAllowed('http://localhost:8080')).toBe(false);
      expect(isOriginAllowed('https://random-name-8080.app.github.dev')).toBe(false);
      expect(isOriginAllowed('https://random-name.github.dev')).toBe(false);
      expect(isOriginAllowed('https://evil.example.com')).toBe(false);
    } finally {
      process.env = originalEnv;
      vi.resetModules();
    }
  });

  it('refuses to start when DEMO_MODE=true and NODE_ENV=production', async () => {
    vi.resetModules();
    const originalEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    try {
      await expect(import('../src/config.js')).rejects.toThrow(/DEMO_MODE/);
    } finally {
      process.env = originalEnv;
      vi.resetModules();
    }
  });
});
