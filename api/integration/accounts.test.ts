import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db.js';
import { accountRoutes } from '../src/routes/accounts.js';
import { invitationRoutes } from '../src/routes/invitations.js';
import {
  accountConfig,
  declarationHash,
  declarationVersion,
  decryptMail,
} from '../src/account-policy.js';
import { runEmailWorkerOnce } from '../src/email-worker.js';
import { hashToken, verifyPassword } from '../src/auth.js';
import { authenticate } from '../src/auth.js';
import { sendApiError } from '../src/errors.js';
import { env } from '../src/config.js';
const provider = { start: vi.fn(async () => 'VEtest'), verify: vi.fn(async () => false) };
describe('MySQL account tokens, private setup sessions, invitations, and durable email', () => {
  let app: FastifyInstance,
    enabled: typeof accountConfig.ACCOUNT_EMAIL_ENABLED,
    managerId: string,
    managerUserId: string,
    managerSid: string,
    foreignUserId: string,
    foreignSid: string;
  const users: string[] = [],
    emails: string[] = [];
  let email: string;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Accounts require a dedicated _test database');
    enabled = accountConfig.ACCOUNT_EMAIL_ENABLED;
    accountConfig.ACCOUNT_EMAIL_ENABLED = 'true';
    app = Fastify({ logger: false });
    await app.register(sensible);
    await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
    app.setErrorHandler(sendApiError);
    await app.register(accountRoutes, { prefix: '/api/v1/auth', phoneProvider: provider });
    await app.register(invitationRoutes, { prefix: '/api/v1/invitations' });
    app.get('/protected', { preHandler: authenticate }, async () => ({ allowed: true }));
    await app.ready();
    for (let i = 0; i < 2; i++) {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@account-manager.invalid',
          passwordHash: 'not-login',
          role: 'LEASING_MANAGER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          leasingManager: { create: { fullName: 'Invitation Manager' } },
        },
        include: { leasingManager: true },
      });
      users.push(user.id);
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      if (!i) {
        managerUserId = user.id;
        managerId = user.leasingManager!.id;
        managerSid = session.id;
      } else {
        foreignUserId = user.id;
        foreignSid = session.id;
      }
    }
  });
  beforeEach(() => {
    email = randomUUID() + '@account.invalid';
    emails.push(email);
    vi.clearAllMocks();
    provider.start.mockResolvedValue('VEtest');
    provider.verify.mockResolvedValue(false);
  });
  afterEach(async () => {
    const created = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    for (const row of created) if (!users.includes(row.id)) users.push(row.id);
  });
  afterAll(async () => {
    accountConfig.ACCOUNT_EMAIL_ENABLED = enabled;
    await prisma.document.deleteMany({ where: { uploaderUserId: { in: users } } });
    await prisma.documentSeries.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.phoneChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.accountToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.accountConsent.deleteMany({ where: { userId: { in: users } } });
    await prisma.outboundEmail.deleteMany({
      where: { OR: [{ userId: { in: users } }, { recipient: { in: emails } }] },
    });
    await prisma.tenantInvitation.deleteMany({ where: { manager: { userId: { in: users } } } });
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app?.close();
    await prisma.$disconnect();
  });
  function send(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, token?: string) {
    return app.inject({
      method,
      url: path,
      payload,
      headers: token ? { authorization: 'Bearer ' + token } : {},
    });
  }
  const managerToken = (foreign = false) =>
    app.jwt.sign({
      sub: foreign ? foreignUserId : managerUserId,
      role: 'LEASING_MANAGER',
      sid: foreign ? foreignSid : managerSid,
    });
  const registration = () => ({
    email,
    password: 'AccountPass123!',
    fullName: 'New Manager',
    dateOfBirth: '1990-01-02',
    nationality: 'Egyptian',
    phone: '+971501234567',
    declarationVersion,
    declarationAccepted: true,
  });
  async function register() {
    const response = await send('POST', '/api/v1/auth/register/manager', registration());
    expect(response.statusCode, response.body).toBe(201);
    users.push(response.json().id);
    return response.json();
  }
  async function tokenFromMail(recipient = email, template = 'EMAIL_VERIFY') {
    const mail = await prisma.outboundEmail.findFirstOrThrow({
      where: { recipient, template },
      orderBy: { createdAt: 'desc' },
    });
    const text = decryptMail(mail.encryptedPayload).text as string;
    return { mail, token: /#token=([A-Za-z0-9_-]+)/.exec(text)![1]!, text };
  }
  async function verifyEmail() {
    const data = await tokenFromMail();
    const response = await send('POST', '/api/v1/auth/email/verify', { token: data.token });
    expect(response.statusCode, response.body).toBe(200);
    return data.token;
  }
  const invite = (clientId = randomUUID()) =>
    send(
      'POST',
      '/api/v1/invitations',
      { email, fullName: 'Invited Tenant', clientId },
      managerToken(),
    );
  it('registers a manager with immutable consent, hashed verification token, and encrypted transactional email', async () => {
    const row = await register();
    expect(row.status).toBe('PENDING_EMAIL');
    const consent = await prisma.accountConsent.findUniqueOrThrow({
      where: { userId_version: { userId: row.id, version: declarationVersion } },
    });
    expect(consent.textHash).toBe(declarationHash);
    expect(consent.ip).toBeTruthy();
    const { token, mail } = await tokenFromMail();
    expect(mail.encryptedPayload).not.toContain(token);
    expect(row).not.toHaveProperty('passwordHash');
    expect(
      await prisma.accountToken.findUnique({ where: { tokenHash: hashToken(token) } }),
    ).toBeTruthy();
  });
  it('rejects duplicate registration and role injection without extra accounts', async () => {
    await register();
    expect((await send('POST', '/api/v1/auth/register/manager', registration())).statusCode).toBe(
      409,
    );
    expect(
      (await send('POST', '/api/v1/auth/register/manager', { ...registration(), role: 'ADMIN' }))
        .statusCode,
    ).toBe(422);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
  it('restricts setup tokens to setup routes even after activation', async () => {
    const row = await register();
    expect(
      (await send('GET', '/api/v1/auth/setup/me', undefined, row.accessToken)).statusCode,
    ).toBe(200);
    expect((await send('GET', '/protected', undefined, row.accessToken)).statusCode).toBe(401);
    await prisma.user.update({ where: { id: row.id }, data: { status: 'ACTIVE' } });
    expect((await send('GET', '/protected', undefined, row.accessToken)).statusCode).toBe(401);
  });
  it('verifies email once and rejects replay, expiration, forged tokens, and wrong token purposes', async () => {
    const row = await register(),
      token = await verifyEmail();
    expect((await send('POST', '/api/v1/auth/email/verify', { token })).statusCode).toBe(422);
    expect(
      (await send('POST', '/api/v1/auth/email/verify', { token: 'a'.repeat(43) })).statusCode,
    ).toBe(422);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PENDING_PHONE',
    );
  });
  it('expires verification links and enforces resend cooldown with old-link revocation', async () => {
    const row = await register(),
      old = await tokenFromMail();
    expect((await send('POST', '/api/v1/auth/email/resend', {}, row.accessToken)).statusCode).toBe(
      429,
    );
    await prisma.accountToken.updateMany({
      where: { userId: row.id },
      data: { createdAt: new Date(Date.now() - 61000), expiresAt: new Date(Date.now() - 1) },
    });
    expect((await send('POST', '/api/v1/auth/email/verify', { token: old.token })).statusCode).toBe(
      422,
    );
    expect((await send('POST', '/api/v1/auth/email/resend', {}, row.accessToken)).statusCode).toBe(
      200,
    );
    expect((await send('POST', '/api/v1/auth/email/verify', { token: old.token })).statusCode).toBe(
      422,
    );
    await verifyEmail();
  });
  it('requires verified email before WhatsApp and consumes wrong-code attempts', async () => {
    const row = await register();
    expect(
      (await send('POST', '/api/v1/auth/phone/start', { phone: '+971501234567' }, row.accessToken))
        .statusCode,
    ).toBe(409);
    await verifyEmail();
    expect(
      (await send('POST', '/api/v1/auth/phone/start', { phone: '+971501234567' }, row.accessToken))
        .statusCode,
    ).toBe(200);
    expect(
      (await send('POST', '/api/v1/auth/phone/start', { phone: '+971501234567' }, row.accessToken))
        .statusCode,
    ).toBe(429);
    for (let i = 0; i < 5; i++)
      expect(
        (await send('POST', '/api/v1/auth/phone/confirm', { code: '000000' }, row.accessToken))
          .statusCode,
      ).toBe(422);
    expect(
      (await send('POST', '/api/v1/auth/phone/confirm', { code: '000000' }, row.accessToken))
        .statusCode,
    ).toBe(409);
    expect(
      (await prisma.phoneChallenge.findUniqueOrThrow({ where: { userId: row.id } })).attempts,
    ).toBe(5);
  });
  it('accepts only provider-approved WhatsApp verification without platform activation', async () => {
    const row = await register();
    await verifyEmail();
    await send('POST', '/api/v1/auth/phone/start', { phone: '+971502222222' }, row.accessToken);
    provider.verify.mockResolvedValue(true);
    expect(
      (await send('POST', '/api/v1/auth/phone/confirm', { code: '123456' }, row.accessToken))
        .statusCode,
    ).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
    expect(
      (await send('POST', '/api/v1/auth/phone/confirm', { code: '123456' }, row.accessToken))
        .statusCode,
    ).toBe(409);
  });
  it('preserves pending state after provider failure and hides provider errors', async () => {
    const row = await register();
    await verifyEmail();
    provider.start.mockRejectedValue(new Error('private provider token'));
    const response = await send(
      'POST',
      '/api/v1/auth/phone/start',
      { phone: '+971503333333' },
      row.accessToken,
    );
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private provider token');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).phoneVerifiedAt,
    ).toBeNull();
  });
  it('stores identity fields, masks identity numbers, and leaves completeness false without clean evidence', async () => {
    const row = await register();
    await verifyEmail();
    const response = await send(
      'PATCH',
      '/api/v1/auth/setup/profile',
      {
        fullName: 'Manager Identity',
        dateOfBirth: '1990-01-02',
        nationality: 'Egyptian',
        emiratesIdNumber: '784-1990-1234567-1',
        emiratesIdExpiry: '2030-12-01',
      },
      row.accessToken,
    );
    expect(response.statusCode, response.body).toBe(200);
    const me = await send('GET', '/api/v1/auth/setup/me', undefined, row.accessToken);
    expect(me.json().identityComplete).toBe(false);
    expect(me.body).not.toContain('784-1990-1234567-1');
    expect(me.json().profile.emiratesIdNumber).toBe('****67-1');
  });
  it('submits only complete verified manager accounts and preserves an idempotent review submission', async () => {
    const row = await register();
    await verifyEmail();
    await send('POST', '/api/v1/auth/phone/start', { phone: '+971504444444' }, row.accessToken);
    provider.verify.mockResolvedValue(true);
    expect(
      (await send('POST', '/api/v1/auth/phone/confirm', { code: '123456' }, row.accessToken))
        .statusCode,
    ).toBe(200);
    expect((await send('POST', '/api/v1/auth/setup/submit', {}, row.accessToken)).statusCode).toBe(
      409,
    );
    const profile = {
      fullName: 'Complete Manager',
      dateOfBirth: '1990-01-01',
      nationality: 'Egyptian',
      emiratesIdNumber: '784-1990-1234567-1',
      emiratesIdExpiry: '2030-01-01',
    };
    expect(
      (await send('PATCH', '/api/v1/auth/setup/profile', profile, row.accessToken)).statusCode,
    ).toBe(200);
    const series = await prisma.documentSeries.create({
      data: { ownerUserId: row.id, purpose: 'IDENTITY' },
    });
    await prisma.document.create({
      data: {
        seriesId: series.id,
        version: 1,
        uploaderUserId: row.id,
        clientId: randomUUID(),
        payloadHash: 'a'.repeat(64),
        title: 'Identity',
        originalName: 'id.png',
        mimeType: 'image/png',
        originalSize: 1,
        sourceHash: 'b'.repeat(64),
        quarantineKey: randomUUID(),
        status: 'CLEAN',
      },
    });
    expect(
      (await send('GET', '/api/v1/auth/setup/me', undefined, row.accessToken)).json()
        .identityComplete,
    ).toBe(true);
    for (let i = 0; i < 2; i++)
      expect(
        (await send('POST', '/api/v1/auth/setup/submit', {}, row.accessToken)).statusCode,
      ).toBe(200);
    expect(
      await prisma.auditEvent.count({
        where: { actorUserId: row.id, action: 'MANAGER_SUBMITTED' },
      }),
    ).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
    expect(
      (await prisma.leasingManagerProfile.findUniqueOrThrow({ where: { userId: row.id } }))
        .submittedAt,
    ).not.toBeNull();
  });
  it('issues generic password-recovery responses and revokes all sessions after one-time reset', async () => {
    const row = await register();
    await verifyEmail();
    const response = await send('POST', '/api/v1/auth/password/request', { email });
    const absent = await send('POST', '/api/v1/auth/password/request', {
      email: randomUUID() + '@absent.invalid',
    });
    expect(response.statusCode).toBe(202);
    expect(response.body).toBe(absent.body);
    const { token } = await tokenFromMail(email, 'PASSWORD_RESET');
    expect((await send('POST', '/api/v1/auth/email/verify', { token })).statusCode).toBe(422);
    expect(
      (
        await send('POST', '/api/v1/auth/password/reset', {
          token,
          newPassword: 'ChangedAccountPass123!',
        })
      ).statusCode,
    ).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: row.id } });
    expect(await verifyPassword(user.passwordHash, 'ChangedAccountPass123!')).toBe(true);
    expect(await prisma.authSession.count({ where: { userId: row.id, revokedAt: null } })).toBe(0);
    expect(
      (
        await send('POST', '/api/v1/auth/password/reset', {
          token,
          newPassword: 'AnotherAccountPass123!',
        })
      ).statusCode,
    ).toBe(422);
  });
  it('serializes concurrent password reset so exactly one request consumes the token', async () => {
    await register();
    await verifyEmail();
    await send('POST', '/api/v1/auth/password/request', { email });
    const { token } = await tokenFromMail(email, 'PASSWORD_RESET');
    const responses = await Promise.all([
      send('POST', '/api/v1/auth/password/reset', { token, newPassword: 'ConcurrentAccount123!' }),
      send('POST', '/api/v1/auth/password/reset', { token, newPassword: 'ConcurrentAccount123!' }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 422]);
  });
  it('rejects expired reset tokens without a password or session change', async () => {
    const row = await register();
    await verifyEmail();
    await send('POST', '/api/v1/auth/password/request', { email });
    const { token } = await tokenFromMail(email, 'PASSWORD_RESET');
    await prisma.accountToken.updateMany({
      where: { userId: row.id, type: 'PASSWORD_RESET' },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (
        await send('POST', '/api/v1/auth/password/reset', {
          token,
          newPassword: 'ExpiredAccount123!',
        })
      ).statusCode,
    ).toBe(422);
    expect(await prisma.authSession.count({ where: { userId: row.id, revokedAt: null } })).toBe(1);
  });
  it('ends setup sessions explicitly and refuses suspended accounts', async () => {
    const row = await register();
    expect((await send('POST', '/api/v1/auth/setup/logout', {}, row.accessToken)).statusCode).toBe(
      200,
    );
    expect(
      (await send('GET', '/api/v1/auth/setup/me', undefined, row.accessToken)).statusCode,
    ).toBe(401);
    await prisma.user.update({ where: { id: row.id }, data: { status: 'SUSPENDED' } });
    expect(
      (await send('POST', '/api/v1/auth/setup/login', { email, password: 'AccountPass123!' }))
        .statusCode,
    ).toBe(401);
  });
  it('creates manager-scoped invitations with encrypted mail and retry-safe replay', async () => {
    const clientId = randomUUID(),
      a = await invite(clientId),
      b = await invite(clientId);
    expect(a.statusCode, a.body).toBe(201);
    expect(b.json().id).toBe(a.json().id);
    expect(a.body).not.toContain('tokenHash');
    expect(
      (await send('GET', '/api/v1/invitations', undefined, managerToken(true))).json().items,
    ).toEqual([]);
    const body = await tokenFromMail(email, 'TENANT_INVITATION');
    expect(body.mail.encryptedPayload).not.toContain(body.token);
    expect(
      (
        await send(
          'POST',
          '/api/v1/invitations',
          { email, fullName: 'Changed', clientId },
          managerToken(),
        )
      ).statusCode,
    ).toBe(409);
  });
  it('accepts only the invitation email and bound manager with verified email before phone', async () => {
    const invitation = await invite();
    expect(invitation.statusCode, invitation.body).toBe(201);
    const { token } = await tokenFromMail(email, 'TENANT_INVITATION');
    expect(
      (
        await send('POST', '/api/v1/invitations/accept', {
          token,
          email: 'other@example.com',
          fullName: 'New Tenant',
          password: 'TenantAccount123!',
        })
      ).statusCode,
    ).toBe(422);
    const accepted = await send('POST', '/api/v1/invitations/accept', {
      token,
      email,
      fullName: 'New Tenant',
      password: 'TenantAccount123!',
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
    users.push(accepted.json().id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: accepted.json().id },
      include: { tenant: true },
    });
    expect(user.tenant!.managerId).toBe(managerId);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.phoneVerifiedAt).toBeNull();
    expect(user.status).toBe('PENDING_PHONE');
    expect(
      (
        await send('POST', '/api/v1/invitations/accept', {
          token,
          email,
          fullName: 'New Tenant',
          password: 'TenantAccount123!',
        })
      ).statusCode,
    ).toBe(422);
  });
  it('revokes invitations without deleting their history and rejects cross-manager commands', async () => {
    const created = await invite(),
      id = created.json().id,
      { token } = await tokenFromMail(email, 'TENANT_INVITATION');
    expect(
      (await send('POST', '/api/v1/invitations/' + id + '/revoke', {}, managerToken(true)))
        .statusCode,
    ).toBe(404);
    expect(
      (await send('POST', '/api/v1/invitations/' + id + '/revoke', {}, managerToken())).statusCode,
    ).toBe(200);
    expect((await send('POST', '/api/v1/invitations/inspect', { token })).statusCode).toBe(422);
    expect(await prisma.tenantInvitation.findUnique({ where: { id } })).toBeTruthy();
  });
  it('resends with new tokens, revokes previous links, and enforces cooldown and expiry', async () => {
    const created = await invite(),
      id = created.json().id,
      old = await tokenFromMail(email, 'TENANT_INVITATION');
    expect(
      (await send('POST', '/api/v1/invitations/' + id + '/resend', {}, managerToken())).statusCode,
    ).toBe(429);
    await prisma.tenantInvitation.update({
      where: { id },
      data: { lastSentAt: new Date(Date.now() - 61000) },
    });
    expect(
      (await send('POST', '/api/v1/invitations/' + id + '/resend', {}, managerToken())).statusCode,
    ).toBe(200);
    expect(
      (await send('POST', '/api/v1/invitations/inspect', { token: old.token })).statusCode,
    ).toBe(422);
    const latest = await tokenFromMail(email, 'TENANT_INVITATION');
    expect(
      (await send('POST', '/api/v1/invitations/inspect', { token: latest.token })).statusCode,
    ).toBe(200);
    await prisma.tenantInvitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (await send('POST', '/api/v1/invitations/inspect', { token: latest.token })).statusCode,
    ).toBe(422);
  });
  it('rejects invitation acceptance after inviter suspension without tenant creation', async () => {
    await invite();
    const { token } = await tokenFromMail(email, 'TENANT_INVITATION');
    await prisma.user.update({ where: { id: managerUserId }, data: { status: 'SUSPENDED' } });
    try {
      expect(
        (
          await send('POST', '/api/v1/invitations/accept', {
            token,
            email,
            fullName: 'Tenant',
            password: 'TenantAccount123!',
          })
        ).statusCode,
      ).toBe(422);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: managerUserId }, data: { status: 'ACTIVE' } });
    }
  });
  it('retries durable email after provider failure without rolling back the account', async () => {
    const row = await register(),
      { mail } = await tokenFromMail();
    // Isolate this worker's queue from prior acceptance fixtures.
    await prisma.outboundEmail.updateMany({
      where: { id: { not: mail.id }, status: 'QUEUED' },
      data: { nextAttemptAt: new Date('2099-01-01') },
    });
    const sender = vi.fn(async () => {
      throw new Error('Private SMTP credentials');
    });
    const now = new Date();
    expect(await runEmailWorkerOnce(sender, now)).toBe(true);
    const saved = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: mail.id } });
    expect(saved.status).toBe('QUEUED');
    expect(saved.failureCode).toBe('DELIVERY_UNAVAILABLE');
    expect(await prisma.user.findUnique({ where: { id: row.id } })).toBeTruthy();
    const accepted = vi.fn(async () => 'smtp-message-id');
    await runEmailWorkerOnce(accepted, new Date(now.getTime() + 120000));
    expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: mail.id } })).status).toBe(
      'COMPLETE',
    );
  });
});
