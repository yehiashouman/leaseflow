import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { env } from '../src/config.js';
type Actor = { id: string; profileId: string; role: Role; sid: string };
describe('MySQL immutable external rent payment receipts', () => {
  let app: FastifyInstance,
    manager: Actor,
    foreign: Actor,
    tenant: Actor,
    roommate: Actor,
    admin: Actor,
    unitId: string,
    spaceId: string,
    contractId: string,
    paymentId: string;
  const actors: Actor[] = [];
  let period = 0;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Payment verification requires a _test database');
    app = await buildApp();
    await app.ready();
    async function actor(role: Role, managerId?: string) {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@payment.invalid',
          passwordHash: 'not-for-login',
          role,
          status: 'ACTIVE',
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Receipt Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Receipt Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { leasingManager: true, tenant: true },
      });
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      const result = {
        id: user.id,
        profileId: user.leasingManager?.id ?? user.tenant?.id ?? user.id,
        role,
        sid: session.id,
      };
      actors.push(result);
      return result;
    }
    manager = await actor('LEASING_MANAGER');
    foreign = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.profileId);
    roommate = await actor('TENANT', manager.profileId);
    admin = await actor('ADMIN');
    unitId = (
      await prisma.unit.create({
        data: { managerId: manager.profileId, name: 'Receipt Unit', area: 'Dubai' },
      })
    ).id;
    spaceId = (
      await prisma.rentalSpace.create({
        data: { unitId, name: 'Receipt Room', type: 'ROOM', capacity: 2 },
      })
    ).id;
    contractId = (
      await prisma.contract.create({
        data: {
          rentalSpaceId: spaceId,
          tenantId: tenant.profileId,
          monthlyRent: '100.00',
          startDate: new Date('2026-01-01'),
          status: 'ACTIVE',
        },
      })
    ).id;
  });
  beforeEach(async () => {
    paymentId = (
      await prisma.payment.create({
        data: {
          contractId,
          periodStart: new Date('2026-' + String(++period).padStart(2, '0') + '-01'),
          dueDate: new Date('2026-01-01'),
          amountDue: '100.00',
        },
      })
    ).id;
  });
  // Each example receives a new period so retry and concurrency records remain independently inspectable.
  const body = (extra = {}) => ({
    clientId: randomUUID(),
    amountPaid: '10.10',
    paidAt: '2026-01-03T10:00:00Z',
    method: 'Bank transfer',
    reference: 'External reference',
    ...extra,
  });
  const send = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    suffix: string,
    payload?: object,
    actor?: Actor,
  ) =>
    app.inject({
      method,
      url: '/api/v1/payments/' + paymentId + suffix,
      payload,
      headers: {
        authorization:
          'Bearer ' +
          app.jwt.sign({
            sub: (actor ?? manager).id,
            role: (actor ?? manager).role,
            sid: (actor ?? manager).sid,
          }),
      },
    });
  afterAll(async () => {
    const ids = actors.map((a) => a.id);
    if (contractId) {
      await prisma.paymentReceipt.deleteMany({ where: { payment: { contractId } } });
      await prisma.payment.deleteMany({ where: { contractId } });
      await prisma.contract.delete({ where: { id: contractId } });
    }
    if (spaceId) await prisma.rentalSpace.delete({ where: { id: spaceId } });
    if (unitId) await prisma.unit.delete({ where: { id: unitId } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });
  it('posts decimal cents, preserves the original due, and stores one audited receipt', async () => {
    const response = await send('POST', '/record', body());
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().amount).toBe('10.1');
    expect(response.json().recordedBalance).toBe('10.1');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.amountDue.toFixed(2)).toBe('100.00');
    expect(payment.amountPaid.toFixed(2)).toBe('10.10');
    expect(payment.status).toBe('PARTIALLY_PAID');
    expect(
      await prisma.auditEvent.count({
        where: { entityId: response.json().id, action: 'RECORD_PAYMENT' },
      }),
    ).toBe(1);
  });
  it('deduplicates simultaneous exact retries and rejects changed key content', async () => {
    const payload = body();
    const responses = await Promise.all([
      send('POST', '/record', payload),
      send('POST', '/record', payload),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0].json().id).toBe(responses[1].json().id);
    expect((await send('POST', '/record', { ...payload, amountPaid: '20.00' })).statusCode).toBe(
      409,
    );
    expect(await prisma.paymentReceipt.count({ where: { paymentId } })).toBe(1);
  });
  it('serializes competing full payments and prevents overpayment', async () => {
    const results = await Promise.all([
      send('POST', '/record', body({ amountPaid: '100.00' })),
      send('POST', '/record', body({ amountPaid: '100.00' })),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe(
      'PAID',
    );
  });
  it('rejects floating amounts, extra precision, negatives, future dates, and direct evidence keys', async () => {
    for (const extra of [
      { amountPaid: 0.1 },
      { amountPaid: '0.001' },
      { amountPaid: '-1' },
      { amountPaid: '0' },
      { paidAt: '2999-01-01T00:00:00Z' },
      { evidenceKey: 'foreign-key' },
    ])
      expect((await send('POST', '/record', body(extra))).statusCode).toBe(422);
    expect(await prisma.paymentReceipt.count({ where: { paymentId } })).toBe(0);
  });
  it('restricts record writes and history to actual contract participants', async () => {
    for (const actor of [tenant, roommate, admin])
      expect((await send('POST', '/record', body(), actor)).statusCode).toBe(403);
    expect((await send('POST', '/record', body(), foreign)).statusCode).toBe(404);
    expect((await send('GET', '/receipts', undefined, tenant)).statusCode).toBe(200);
    expect((await send('GET', '/receipts', undefined, roommate)).statusCode).toBe(404);
    expect((await send('GET', '/receipts', undefined, foreign)).statusCode).toBe(404);
    expect((await send('GET', '/receipts', undefined, admin)).statusCode).toBe(403);
  });
  it('rejects inconsistent tenant and property ownership', async () => {
    await prisma.unit.update({ where: { id: unitId }, data: { managerId: foreign.profileId } });
    try {
      for (const actor of [manager, foreign])
        expect((await send('POST', '/record', body(), actor)).statusCode).toBe(404);
      expect((await send('GET', '/receipts', undefined, tenant)).statusCode).toBe(404);
    } finally {
      await prisma.unit.update({ where: { id: unitId }, data: { managerId: manager.profileId } });
    }
  });
  it('preserves audit records after ordinary-user edit and delete attempts', async () => {
    const created = await send('POST', '/record', body());
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: created.json().id },
    });
    for (const actor of [manager, tenant]) {
      const headers = {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
      };
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/admin/audit', headers })).statusCode,
      ).toBe(403);
      for (const path of ['/api/v1/admin/audit/' + audit.id, '/api/v1/audit/' + audit.id]) {
        for (const method of ['PATCH', 'DELETE'] as const) {
          expect(
            (await app.inject({ method, url: path, headers, payload: { action: 'HIDE_HISTORY' } }))
              .statusCode,
          ).toBe(404);
        }
      }
    }
    expect(await prisma.auditEvent.findUniqueOrThrow({ where: { id: audit.id } })).toEqual(audit);
  });
  it('keeps production and disputed obligations gated', async () => {
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect((await send('POST', '/record', body())).statusCode).toBe(409);
    } finally {
      env.NODE_ENV = previous;
    }
    await prisma.payment.update({ where: { id: paymentId }, data: { status: 'DISPUTED' } });
    expect((await send('POST', '/record', body())).statusCode).toBe(409);
  });
  it('exposes safe paged history without retry secrets and provides no receipt edit or delete', async () => {
    const created = await send('POST', '/record', body());
    const response = await send('GET', '/receipts', undefined, tenant);
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(1);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toMatch(/clientId|payloadHash|actorUserId|evidenceKey/);
    for (const method of ['PATCH', 'DELETE'] as const)
      expect((await send(method, '/receipts/' + created.json().id, {})).statusCode).toBe(404);
    expect((await send('GET', '/receipts?page=0')).statusCode).toBe(422);
  });
});
