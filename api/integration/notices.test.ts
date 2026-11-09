import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { NoticeChannel, Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { env } from '../src/config.js';
import { noticeConfig, callbackUrl, NoticeSendError } from '../src/notice-policy.js';
import { decryptMail } from '../src/account-policy.js';
import { runNoticeWorkerOnce, type NoticeSender } from '../src/notice-worker.js';
type Actor = { id: string; sid: string; role: Role; managerId?: string };
describe('MySQL transactional notice intent, provider attempts, callbacks, and owner recovery', () => {
  let app: FastifyInstance,
    manager: Actor,
    tenant: Actor,
    foreign: Actor,
    admin: Actor,
    contractId: string,
    unitId: string,
    roomId: string,
    requestId: string;
  const actors: Actor[] = [],
    originalNotice = { ...noticeConfig },
    originalEnv = {
      TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
    };
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Notice verification requires a _test database');
    app = await buildApp();
    await app.ready();
    env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
    env.TWILIO_AUTH_TOKEN = 'notice-test-signature-secret';
    noticeConfig.TWILIO_STATUS_CALLBACK_URL =
      'https://callbacks.example.invalid/api/v1/providers/twilio/status';
    async function actor(role: Role, managerId?: string) {
      const phone = '+971' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@notice.invalid',
          phone,
          passwordHash: 'not-for-login',
          role,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Notice Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Notice Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { leasingManager: true, tenant: true },
      });
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      const result = { id: user.id, sid: session.id, role, managerId: user.leasingManager?.id };
      actors.push(result);
      return result;
    }
    manager = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.managerId);
    foreign = await actor('LEASING_MANAGER');
    admin = await actor('ADMIN');
    unitId = (
      await prisma.unit.create({
        data: { managerId: manager.managerId!, name: 'Notice Unit', area: 'Dubai' },
      })
    ).id;
    roomId = (
      await prisma.rentalSpace.create({ data: { unitId, name: 'Notice Room', type: 'ROOM' } })
    ).id;
    const profile = await prisma.tenantProfile.findUniqueOrThrow({ where: { userId: tenant.id } });
    contractId = (
      await prisma.contract.create({
        data: {
          tenantId: profile.id,
          rentalSpaceId: roomId,
          monthlyRent: 3000,
          startDate: new Date('2026-01-01'),
          status: 'ACTIVE',
        },
      })
    ).id;
  });
  beforeEach(async () => {
    await prisma.user.updateMany({
      where: { id: { in: [manager.id, tenant.id] } },
      data: { notifyEmail: true, notifyWhatsapp: true, preferredLanguage: 'en' },
    });
    const response = await send('POST', '/requests', {
      clientId: randomUUID(),
      contractId,
      type: 'GENERAL',
      title: 'Private case title',
      description: 'CONFIDENTIAL_CASE_DESCRIPTION',
    });
    expect(response.statusCode, response.body).toBe(201);
    requestId = response.json().id;
  });
  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { event: { requestId } } });
    await prisma.requestEvent.deleteMany({ where: { requestId } });
    await prisma.request.delete({ where: { id: requestId } });
  });
  afterAll(async () => {
    Object.assign(noticeConfig, originalNotice);
    Object.assign(env, originalEnv);
    const ids = actors.map((actor) => actor.id),
      managers = actors.flatMap((actor) => (actor.managerId ? [actor.managerId] : []));
    await prisma.contract.delete({ where: { id: contractId } });
    await prisma.rentalSpace.delete({ where: { id: roomId } });
    await prisma.unit.delete({ where: { id: unitId } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leasingManagerProfile.deleteMany({ where: { id: { in: managers } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });
  function send(method: 'GET' | 'POST', path: string, payload?: object, actor = tenant) {
    return app.inject({
      method,
      url: '/api/v1' + path,
      payload,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
      },
    });
  }
  async function job(channel: NoticeChannel = 'EMAIL') {
    return prisma.noticeDelivery.findFirstOrThrow({
      where: { recipientUserId: tenant.id, channel, notification: { event: { requestId } } },
    });
  }
  async function isolate(id: string) {
    await prisma.noticeDelivery.updateMany({
      where: { id: { not: id }, notification: { event: { requestId } } },
      data: { nextAttemptAt: new Date('2099-01-01') },
    });
  }
  const accepted: NoticeSender = async (input) => ({
    providerId: input.channel === 'EMAIL' ? 'smtp-' + input.id : 'SM' + 'a'.repeat(32),
  });
  async function dispatch(channel: NoticeChannel = 'EMAIL', sender = accepted) {
    const row = await job(channel);
    await isolate(row.id);
    expect(
      await runNoticeWorkerOnce({ channels: [channel], sender, now: new Date(Date.now() + 1000) }),
    ).toBe(true);
    return prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } });
  }
  function callback(
    id: string,
    status: string,
    extra: Record<string, string> = {},
    signatureOverride?: string,
  ) {
    const fields = {
      AccountSid: env.TWILIO_ACCOUNT_SID!,
      MessageSid: 'SM' + 'a'.repeat(32),
      MessageStatus: status,
      ...extra,
    };
    const canonical =
      callbackUrl(id) +
      Object.keys(fields)
        .sort()
        .map((key) => key + fields[key as keyof typeof fields])
        .join('');
    const signature =
      signatureOverride ??
      createHmac('sha1', env.TWILIO_AUTH_TOKEN!).update(canonical).digest('base64');
    return app.inject({
      method: 'POST',
      url: '/api/v1/providers/twilio/status?job=' + id,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': signature,
      },
      payload: new URLSearchParams(fields).toString(),
    });
  }
  it('persists encrypted paused intents for both parties without private message content', async () => {
    const rows = await prisma.noticeDelivery.findMany({
      where: { notification: { event: { requestId } } },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.state === 'PAUSED')).toBe(true);
    for (const row of rows) {
      expect(row.recipientCipher).not.toContain('@notice.invalid');
      const payload = decryptMail(row.payloadCipher);
      expect(payload.text).not.toContain('CONFIDENTIAL');
      expect(payload.text).not.toContain('Private case title');
      expect(payload.url).toMatch(new RegExp('/requests/' + requestId + '$'));
    }
  });
  it('honors channel preferences and English template fallback within the business transaction', async () => {
    await prisma.user.update({
      where: { id: tenant.id },
      data: { notifyWhatsapp: false, preferredLanguage: 'ar-EG' },
    });
    const response = await send('POST', '/requests/' + requestId + '/messages', {
      clientId: randomUUID(),
      message: 'A factual reply',
    });
    expect(response.statusCode).toBe(201);
    const eventId = response.json().events.at(-1).id;
    const rows = await prisma.noticeDelivery.findMany({
      where: { recipientUserId: tenant.id, notification: { eventId } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: 'EMAIL', language: 'ar' });
    expect(decryptMail(rows[0]!.payloadCipher).subject).toContain('تحديث');
  });
  it('records SMTP acceptance without a false inbox-delivery or case-acknowledgement result', async () => {
    const row = await dispatch();
    expect(row.state).toBe('ACCEPTED');
    expect(row.deliveredAt).toBeNull();
    expect(row.readAt).toBeNull();
    expect(await prisma.noticeAttempt.count({ where: { deliveryId: row.id } })).toBe(1);
    const current = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    expect(current.status).toBe('SUBMITTED');
    expect(current.version).toBe(1);
  });
  it('claims one intent once across simultaneous worker replicas', async () => {
    const row = await job();
    await isolate(row.id);
    let calls = 0;
    const sender: NoticeSender = async (input) => {
      calls++;
      return accepted(input);
    };
    await Promise.all([
      runNoticeWorkerOnce({ channels: ['EMAIL'], sender, now: new Date(Date.now() + 1000) }),
      runNoticeWorkerOnce({ channels: ['EMAIL'], sender, now: new Date(Date.now() + 1000) }),
    ]);
    expect(calls).toBe(1);
    expect(await prisma.noticeAttempt.count({ where: { deliveryId: row.id } })).toBe(1);
  });
  it('bounds known transient failures at three attempts without a business rollback', async () => {
    const row = await job();
    await isolate(row.id);
    let calls = 0;
    const now = Date.now() + 1000;
    const sender: NoticeSender = async () => {
      calls++;
      throw new NoticeSendError('PROVIDER_THROTTLED', true);
    };
    for (const offset of [0, 31000, 92000])
      await runNoticeWorkerOnce({ channels: ['EMAIL'], sender, now: new Date(now + offset) });
    const failed = await prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } });
    expect(failed.state).toBe('FAILED');
    expect(failed.attempts).toBe(3);
    expect(calls).toBe(3);
    expect(
      await runNoticeWorkerOnce({ channels: ['EMAIL'], sender, now: new Date(now + 200000) }),
    ).toBe(false);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe(
      'SUBMITTED',
    );
  });
  it('keeps ambiguous provider results uncertain without an automatic duplicate send', async () => {
    const row = await dispatch('EMAIL', async () => {
      throw new Error('private provider diagnostic');
    });
    expect(row.state).toBe('UNKNOWN');
    expect(row.failureCode).toBe('DELIVERY_PROCESSING_FAILED');
    expect(
      await runNoticeWorkerOnce({
        channels: ['EMAIL'],
        sender: accepted,
        now: new Date(Date.now() + 200000),
      }),
    ).toBe(false);
    const history = await send('GET', '/notifications/deliveries');
    expect(history.statusCode).toBe(200);
    expect(history.body).not.toMatch(/recipientCipher|payloadCipher|private provider diagnostic/);
  });
  it('marks interrupted leases uncertain rather than silently resend', async () => {
    const row = await job();
    await isolate(row.id);
    await prisma.noticeDelivery.update({
      where: { id: row.id },
      data: {
        state: 'RUNNING',
        attempts: 1,
        leaseToken: 'lost-worker',
        leaseExpiresAt: new Date('2020-01-01'),
      },
    });
    await prisma.noticeAttempt.create({ data: { deliveryId: row.id, number: 1 } });
    let calls = 0;
    await runNoticeWorkerOnce({
      channels: ['EMAIL'],
      sender: async (input) => {
        calls++;
        return accepted(input);
      },
    });
    expect(calls).toBe(0);
    expect((await prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } })).state).toBe(
      'UNKNOWN',
    );
  });
  it('requires owner acknowledgement for uncertain retries and preserves exact retry keys', async () => {
    const row = await dispatch('EMAIL', async () => {
      throw new Error('timeout');
    });
    const path = '/notifications/deliveries/' + row.id + '/retry',
      key = randomUUID();
    expect((await send('POST', path, { clientId: key })).statusCode).toBe(422);
    const first = await send('POST', path, { clientId: key, acknowledgePossibleDuplicate: true });
    expect(first.statusCode, first.body).toBe(201);
    const repeated = await send('POST', path, {
      clientId: key,
      acknowledgePossibleDuplicate: true,
    });
    expect(repeated.json().id).toBe(first.json().id);
    expect(
      (await send('POST', path, { clientId: key, acknowledgePossibleDuplicate: false })).statusCode,
    ).toBe(409);
    expect(
      (
        await send(
          'POST',
          path,
          { clientId: randomUUID(), acknowledgePossibleDuplicate: true },
          foreign,
        )
      ).statusCode,
    ).toBe(404);
    expect((await send('GET', '/notifications/deliveries', undefined, admin)).statusCode).toBe(403);
  });
  it('suppresses stale contacts and preferences before provider dispatch', async () => {
    const row = await job();
    await isolate(row.id);
    await prisma.user.update({ where: { id: tenant.id }, data: { notifyEmail: false } });
    let calls = 0;
    await runNoticeWorkerOnce({
      channels: ['EMAIL'],
      sender: async (input) => {
        calls++;
        return accepted(input);
      },
      now: new Date(Date.now() + 1000),
    });
    expect(calls).toBe(0);
    expect((await prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } })).state).toBe(
      'SUPPRESSED',
    );
  });
  it('accepts signed provider delivery/read events without changing case status or inbox read state', async () => {
    const row = await dispatch('WHATSAPP');
    expect((await callback(row.id, 'delivered')).statusCode).toBe(200);
    expect((await callback(row.id, 'read')).statusCode).toBe(200);
    const updated = await prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.state).toBe('READ');
    expect(updated.deliveredAt).not.toBeNull();
    expect(updated.readAt).not.toBeNull();
    const inbox = await prisma.notification.findUniqueOrThrow({
      where: { id: row.notificationId },
    });
    expect(inbox.readAt).toBeNull();
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe(
      'SUBMITTED',
    );
  });
  it('acknowledges duplicate callbacks once and rejects status regression', async () => {
    const row = await dispatch('WHATSAPP');
    await callback(row.id, 'delivered');
    const before = await prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } });
    const repeated = await callback(row.id, 'delivered');
    expect(repeated.json()).toMatchObject({ duplicate: true });
    await callback(row.id, 'sent');
    const after = await prisma.noticeDelivery.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.state).toBe('DELIVERED');
    expect(after.deliveredAt).toEqual(before.deliveredAt);
    expect(await prisma.noticeCallback.count({ where: { deliveryId: row.id } })).toBe(2);
  });
  it('rejects invalid signatures, mismatched accounts/messages, and ambiguous callback fields', async () => {
    const row = await dispatch('WHATSAPP');
    expect((await callback(row.id, 'delivered', {}, 'invalid')).statusCode).toBe(401);
    expect(
      (await callback(row.id, 'delivered', { AccountSid: 'AC' + 'b'.repeat(32) })).statusCode,
    ).toBe(403);
    expect(
      (await callback(row.id, 'delivered', { MessageSid: 'SM' + 'b'.repeat(32) })).statusCode,
    ).toBe(409);
    const duplicated = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/twilio/status?job=' + row.id,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'MessageStatus=sent&MessageStatus=read',
    });
    expect(duplicated.statusCode).toBe(400);
    expect(await prisma.noticeCallback.count({ where: { deliveryId: row.id } })).toBe(0);
  });
});
