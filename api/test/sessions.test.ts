import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  authSession: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  auditEvent: { create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}));
vi.mock('../src/db.js', () => ({ prisma: db }));
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost/test');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters');
vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-at-least-32-characters');
vi.stubEnv('LOG_LEVEL', 'silent');
vi.stubEnv('ACCESS_TOKEN_TTL', '15m');

describe('revocable session routes', () => {
  let app: FastifyInstance;
  let hash: string;
  const password = 'ExamplePassword123!';
  const future = new Date(Date.now() + 3600000);
  beforeAll(async () => {
    hash = await (await import('../src/auth.js')).hashPassword(password);
    app = await (await import('../src/app.js')).buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((callback) => callback(db));
    db.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      passwordHash: hash,
    });
    db.authSession.findFirst.mockResolvedValue({ id: 'session-1' });
    db.authSession.create.mockResolvedValue({ id: 'session-1', expiresAt: future });
    db.auditEvent.create.mockResolvedValue({});
    db.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });
  });
  function send(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method,
      url: '/api/v1/auth' + path,
      payload,
      headers: {
        'x-leaseflow-session': '1',
        authorization:
          'Bearer ' + app.jwt.sign({ sub: 'user-1', role: 'LEASING_MANAGER', sid: 'session-1' }),
        ...headers,
      },
    });
  }
  it('issues an opaque HttpOnly cookie and stores only its hash', async () => {
    const response = await send('POST', '/login', { email: 'manager@example.test', password });
    expect(response.statusCode).toBe(200);
    expect(response.json().refreshToken).toBeUndefined();
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.headers['cache-control']).toBe('no-store');
    const raw = response.cookies[0]!.value;
    expect(raw).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(db.refreshToken.create.mock.calls[0]?.[0].data.tokenHash).not.toBe(raw);
    expect(db.refreshToken.create.mock.calls[0]?.[0].data.tokenHash).toHaveLength(64);
    const claims = app.jwt.decode<{ sid: string; exp: number; iat: number }>(
      response.json().accessToken,
    )!;
    expect(claims.sid).toBe('session-1');
    expect(claims.exp - claims.iat).toBe(900);
  });
  it('requires the custom header and rejects cross-site cookie operations', async () => {
    expect(
      (
        await send(
          'POST',
          '/login',
          { email: 'manager@example.test', password },
          { 'x-leaseflow-session': '' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await send('POST', '/refresh', undefined, { 'sec-fetch-site': 'cross-site' })).statusCode,
    ).toBe(403);
    expect(db.authSession.create).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout-all',
          headers: { cookie: 'leaseflow_refresh=' + 'a'.repeat(64), 'x-leaseflow-session': '1' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password',
          headers: { cookie: 'leaseflow_refresh=' + 'a'.repeat(64), 'x-leaseflow-session': '1' },
          payload: { currentPassword: password, newPassword: 'ReplacementPassword123!' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects inactive and incorrect-password logins without a session', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'LEASING_MANAGER',
      status: 'SUSPENDED',
      passwordHash: hash,
    });
    expect(
      (await send('POST', '/login', { email: 'manager@example.test', password })).statusCode,
    ).toBe(401);
    expect(db.authSession.create).not.toHaveBeenCalled();
  });
  it('rejects legacy access tokens and revoked sessions', async () => {
    const legacy = app.jwt.sign({ sub: 'user-1', role: 'LEASING_MANAGER' });
    expect(
      (await send('GET', '/me', undefined, { authorization: 'Bearer ' + legacy })).statusCode,
    ).toBe(401);
    db.authSession.findFirst.mockResolvedValue(null);
    expect((await send('GET', '/sessions')).statusCode).toBe(401);
  });
  it('revokes the complete token family after refresh replay', async () => {
    db.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      sessionId: 'session-1',
      revokedAt: new Date(),
      expiresAt: future,
      user: { id: 'user-1', role: 'LEASING_MANAGER', status: 'ACTIVE' },
      session: { id: 'session-1', expiresAt: future },
    });
    const response = await send('POST', '/refresh', undefined, {
      cookie: 'leaseflow_refresh=' + 'a'.repeat(64),
    });
    expect(response.statusCode).toBe(401);
    expect(db.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', id: 'session-1', revokedAt: null } }),
    );
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SESSION_REPLAY_REVOKE' }),
      }),
    );
  });
  it('does not return another account session list or token hashes', async () => {
    db.authSession.findMany.mockResolvedValue([{ id: 'session-1', expiresAt: future }]);
    const response = await send('GET', '/sessions');
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].current).toBe(true);
    expect(db.authSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
        select: expect.not.objectContaining({ refreshTokens: true }),
      }),
    );
  });
  it('does not revoke another account session', async () => {
    db.authSession.findFirst.mockResolvedValueOnce({ id: 'session-1' }).mockResolvedValueOnce(null);
    expect((await send('DELETE', '/sessions/foreign')).statusCode).toBe(404);
    expect(db.authSession.updateMany).not.toHaveBeenCalled();
  });
  it('requires the current password before password replacement', async () => {
    expect(
      (
        await send('POST', '/password', {
          currentPassword: 'IncorrectPassword123!',
          newPassword: 'ReplacementPassword123!',
        })
      ).statusCode,
    ).toBe(422);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.authSession.updateMany).not.toHaveBeenCalled();
  });
  it('does not accept refresh tokens through the request body', async () => {
    expect((await send('POST', '/refresh', { refreshToken: 'a'.repeat(64) })).statusCode).toBe(401);
    expect(db.refreshToken.findUnique).not.toHaveBeenCalled();
  });
  it('supports idempotent logout without a live access token', async () => {
    expect((await send('POST', '/logout', undefined, { authorization: '' })).statusCode).toBe(204);
  });
});
