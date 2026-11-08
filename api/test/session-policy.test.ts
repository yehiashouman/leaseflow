import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';

vi.stubEnv('NODE_ENV', 'production');
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost/test');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters');
vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-at-least-32-characters');
vi.stubEnv('DEMO_MODE', 'false');
beforeEach(() => {
  vi.stubEnv('ACCESS_TOKEN_TTL', '15m');
  vi.stubEnv('REFRESH_TOKEN_TTL', '30d');
  vi.resetModules();
});
describe('production session policy', () => {
  it('uses a host-only Secure HttpOnly Strict refresh cookie and no refresh JSON field', async () => {
    const { sendSession, refreshCookieName } = await import('../src/sessions.js');
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as FastifyReply;
    const result = sendSession(reply, {
      accessToken: 'access',
      refreshToken: 'secret',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 100000),
    });
    expect(refreshCookieName).toBe('__Host-leaseflow_refresh');
    expect(setCookie).toHaveBeenCalledWith(
      refreshCookieName,
      'secret',
      expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'strict', path: '/' }),
    );
    expect(setCookie.mock.calls[0]?.[2].domain).toBeUndefined();
    expect(result).toEqual({ accessToken: 'access', userId: 'user-1' });
  });
  it('parses explicit durations without silently ignoring configured TTL values', async () => {
    const { durationSeconds } = await import('../src/config.js');
    expect(durationSeconds('15m')).toBe(900);
    expect(durationSeconds('30d')).toBe(2592000);
    expect(durationSeconds('1h')).toBe(3600);
    expect(durationSeconds('0s')).toBeNaN();
  });
  it('rejects unbounded access-token lifetimes at startup', async () => {
    vi.stubEnv('ACCESS_TOKEN_TTL', '2h');
    await expect(import('../src/config.js')).rejects.toThrow();
  });
  it('rejects malformed refresh-token lifetimes at startup', async () => {
    vi.stubEnv('REFRESH_TOKEN_TTL', 'forever');
    await expect(import('../src/config.js')).rejects.toThrow();
  });
});
