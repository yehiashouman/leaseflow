import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { hashPassword, hashToken } from '../src/auth.js';
import { refreshCookieName } from '../src/sessions.js';

describe('MySQL authentication sessions', () => {
  let app: FastifyInstance;
  let userId: string;
  let email: string;
  const password = 'IntegrationPassword123!';
  const users: string[] = [];
  let address = 1;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Integration tests require a dedicated _test database');
    app = await buildApp();
    await app.ready();
  });
  beforeEach(async () => {
    email = randomUUID() + '@sessions.invalid';
    const user = await prisma.user.create({
      data: {
        email,
        role: 'LEASING_MANAGER',
        status: 'ACTIVE',
        passwordHash: await hashPassword(password),
        leasingManager: { create: { fullName: 'Session Test Manager' } },
      },
    });
    userId = user.id;
    users.push(userId);
  });
  afterAll(async () => {
    if (users.length) {
      const where = { userId: { in: users } };
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
      await prisma.refreshToken.deleteMany({ where });
      await prisma.authSession.deleteMany({ where });
      await prisma.leasingManagerProfile.deleteMany({ where });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  const headers = (access?: string, cookie?: string) => ({
    'x-leaseflow-session': '1',
    ...(access ? { authorization: 'Bearer ' + access } : {}),
    ...(cookie ? { cookie } : {}),
  });
  async function login(value = password) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '198.51.100.' + address++,
      headers: headers(),
      payload: { email, password: value },
    });
    const cookie = response.cookies.find((item) => item.name === refreshCookieName);
    return {
      response,
      access: response.json().accessToken as string,
      cookie: cookie ? cookie.name + '=' + cookie.value : '',
    };
  }
  const me = (access: string) =>
    app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: headers(access) });
  const refresh = (cookie: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: headers(undefined, cookie),
    });

  it('stores hashes and session metadata without disclosure of the refresh token', async () => {
    const result = await login();
    expect(result.response.statusCode).toBe(200);
    expect(result.response.json().refreshToken).toBeUndefined();
    expect(result.response.headers['set-cookie']).toContain('HttpOnly');
    expect(result.response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(result.response.headers['cache-control']).toBe('no-store');
    const raw = result.cookie.split('=')[1]!;
    const record = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(raw) },
    });
    expect(record.sessionId).toBeTruthy();
    expect(record.tokenHash).not.toBe(raw);
    expect((await me(result.access)).statusCode).toBe(200);
  });
  it('rotates refresh tokens within the same session and preserves the absolute expiry', async () => {
    const original = await login();
    const record = await prisma.refreshToken.findFirstOrThrow({ where: { userId } });
    const response = await refresh(original.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.cookies[0]!.value).not.toBe(original.cookie.split('=')[1]);
    expect(
      (await prisma.refreshToken.findUniqueOrThrow({ where: { id: record.id } })).revokedAt,
    ).not.toBeNull();
    const active = await prisma.refreshToken.findFirstOrThrow({
      where: { userId, revokedAt: null },
    });
    expect(active.sessionId).toBe(record.sessionId);
    expect(active.expiresAt).toEqual(record.expiresAt);
  });
  it('revokes only the compromised session after a consumed token reappears', async () => {
    const original = await login();
    const other = await login();
    const rotated = await refresh(original.cookie);
    expect(rotated.statusCode).toBe(200);
    expect((await refresh(original.cookie)).statusCode).toBe(401);
    expect((await me(rotated.json().accessToken)).statusCode).toBe(401);
    expect((await me(original.access)).statusCode).toBe(401);
    expect((await me(other.access)).statusCode).toBe(200);
    expect(
      await prisma.auditEvent.count({
        where: { actorUserId: userId, action: 'SESSION_REPLAY_REVOKE' },
      }),
    ).toBe(1);
  });
  it('serializes simultaneous refresh requests and fails closed after replay', async () => {
    const original = await login();
    const results = await Promise.all([refresh(original.cookie), refresh(original.cookie)]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 401]);
    const accepted = results.find((result) => result.statusCode === 200)!;
    expect((await me(accepted.json().accessToken)).statusCode).toBe(401);
    expect(await prisma.authSession.count({ where: { userId, revokedAt: null } })).toBe(0);
  });
  it('logs out through the refresh cookie and rejects the existing access token immediately', async () => {
    const original = await login();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: headers(undefined, original.cookie),
    });
    expect(response.statusCode).toBe(204);
    expect((await me(original.access)).statusCode).toBe(401);
    expect((await refresh(original.cookie)).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: headers(undefined, original.cookie),
        })
      ).statusCode,
    ).toBe(204);
  });
  it('scopes session review and revocation to the authenticated account', async () => {
    const original = await login();
    const other = await login();
    const foreignUser = await prisma.user.create({
      data: {
        email: randomUUID() + '@sessions.invalid',
        role: 'TENANT',
        status: 'ACTIVE',
        passwordHash: 'not-a-login-hash',
      },
    });
    users.push(foreignUser.id);
    const foreign = await prisma.authSession.create({
      data: { userId: foreignUser.id, expiresAt: new Date(Date.now() + 3600000) },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: headers(original.access),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(response.json().some((session: { id: string }) => session.id === foreign.id)).toBe(
      false,
    );
    expect(JSON.stringify(response.json())).not.toContain('tokenHash');
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/auth/sessions/' + foreign.id,
          headers: headers(original.access),
        })
      ).statusCode,
    ).toBe(404);
    const otherId = response.json().find((session: { current: boolean }) => !session.current).id;
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/auth/sessions/' + otherId,
          headers: headers(original.access),
        })
      ).statusCode,
    ).toBe(204);
    expect((await me(other.access)).statusCode).toBe(401);
    expect((await me(original.access)).statusCode).toBe(200);
  });
  it('changes the password only after proof and revokes every existing session', async () => {
    const original = await login();
    const other = await login();
    const replacement = 'ReplacementPassword123!';
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      headers: headers(original.access),
      payload: { currentPassword: 'WrongPassword123!', newPassword: replacement },
    });
    expect(wrong.statusCode).toBe(422);
    expect((await me(original.access)).statusCode).toBe(200);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      headers: headers(original.access),
      payload: { currentPassword: password, newPassword: replacement },
    });
    expect(response.statusCode).toBe(204);
    expect((await me(original.access)).statusCode).toBe(401);
    expect((await me(other.access)).statusCode).toBe(401);
    expect((await refresh(other.cookie)).statusCode).toBe(401);
    expect((await login()).response.statusCode).toBe(401);
    expect((await login(replacement)).response.statusCode).toBe(200);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { actorUserId: userId, action: 'PASSWORD_CHANGE' },
    });
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(replacement);
  });
  it('revokes all sessions without deletion of security history', async () => {
    const original = await login();
    const other = await login();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout-all',
          headers: headers(original.access),
        })
      ).statusCode,
    ).toBe(204);
    expect((await me(other.access)).statusCode).toBe(401);
    expect(await prisma.authSession.count({ where: { userId } })).toBe(2);
    expect(await prisma.authSession.count({ where: { userId, revokedAt: null } })).toBe(0);
  });
  it('rejects expired and suspended sessions with a valid signed access token', async () => {
    const original = await login();
    await prisma.authSession.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await me(original.access)).statusCode).toBe(401);
    expect((await refresh(original.cookie)).statusCode).toBe(401);
    const next = await login();
    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    expect((await me(next.access)).statusCode).toBe(401);
    expect((await refresh(next.cookie)).statusCode).toBe(401);
  });
  it('serializes a password change against refresh without a surviving session', async () => {
    const original = await login();
    const [changed, rotated] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/password',
        headers: headers(original.access),
        payload: { currentPassword: password, newPassword: 'ConcurrentPassword123!' },
      }),
      refresh(original.cookie),
    ]);
    expect(changed.statusCode).toBe(204);
    expect([200, 401]).toContain(rotated.statusCode);
    if (rotated.statusCode === 200)
      expect((await me(rotated.json().accessToken)).statusCode).toBe(401);
    expect(await prisma.authSession.count({ where: { userId, revokedAt: null } })).toBe(0);
  });
});
