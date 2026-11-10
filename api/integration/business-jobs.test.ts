import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { BusinessJobKind, Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import {
  materializeBusinessJobs,
  materializeRoomExpiryJobs,
  roomExpiry,
  roomExpiryReason,
  runBusinessJobOnce,
} from '../src/business-jobs.js';
import { businessRuntime } from '../src/business-runtime.js';
import { businessConfig } from '../src/business-config.js';
import { env } from '../src/config.js';
type Actor = { id: string; role: Role; profileId: string; sid: string };
describe('MySQL durable calendar jobs and annual reviews', () => {
  let app: FastifyInstance,
    manager: Actor,
    tenant: Actor,
    foreign: Actor,
    admin: Actor,
    unitId: string,
    spaceId: string,
    contractId: string;
  const actors: Actor[] = [],
    now = new Date('2026-05-12T10:00:00Z');
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Business jobs require a _test database');
    app = await buildApp();
    await app.ready();
    async function actor(role: Role, owner?: string) {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@job.invalid',
          passwordHash: 'not-for-login',
          role,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Job Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Job Tenant', managerId: owner! } } }
            : {}),
        },
        include: { leasingManager: true, tenant: true },
      });
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      const result = {
        id: user.id,
        role,
        profileId: user.leasingManager?.id ?? user.tenant?.id ?? user.id,
        sid: session.id,
      };
      actors.push(result);
      return result;
    }
    manager = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.profileId);
    foreign = await actor('LEASING_MANAGER');
    admin = await actor('ADMIN');
    unitId = (
      await prisma.unit.create({
        data: { managerId: manager.profileId, name: 'Job Unit', area: 'Dubai', active: true },
      })
    ).id;
    spaceId = (
      await prisma.rentalSpace.create({ data: { unitId, name: 'Job Space', type: 'ROOM' } })
    ).id;
  });
  beforeEach(async () => {
    contractId = (
      await prisma.contract.create({
        data: {
          tenantId: tenant.profileId,
          rentalSpaceId: spaceId,
          startDate: new Date('2026-01-17'),
          monthlyRent: '3100.00',
          dueDay: 5,
          currency: 'AED',
          status: 'ACTIVE',
        },
      })
    ).id;
  });
  async function removeContract() {
    if (!contractId) return;
    const artifacts = await Promise.all([
      prisma.payment.findMany({ where: { contractId }, select: { id: true } }),
      prisma.contractReview.findMany({ where: { contractId }, select: { id: true } }),
      prisma.request.findMany({ where: { contractId }, select: { id: true } }),
      prisma.businessJob.findMany({ where: { contractId }, select: { id: true } }),
    ]);
    await prisma.auditEvent.deleteMany({
      where: { entityId: { in: artifacts.flatMap((rows) => rows.map((row) => row.id)) } },
    });
    await prisma.notification.deleteMany({
      where: {
        OR: [{ event: { request: { contractId } } }, { reviewEvent: { review: { contractId } } }],
      },
    });
    await prisma.contractAmendment.deleteMany({ where: { contractId } });
    await prisma.contractReviewEvent.deleteMany({ where: { review: { contractId } } });
    await prisma.contractReview.deleteMany({ where: { contractId } });
    await prisma.businessJobRetry.deleteMany({ where: { job: { contractId } } });
    await prisma.businessJob.deleteMany({ where: { contractId } });
    await prisma.requestEvent.deleteMany({ where: { request: { contractId } } });
    await prisma.request.deleteMany({ where: { contractId } });
    await prisma.paymentReceipt.deleteMany({ where: { payment: { contractId } } });
    await prisma.payment.deleteMany({ where: { contractId } });
    await prisma.contract.delete({ where: { id: contractId } });
    contractId = '';
  }
  // Keep every example isolated from scheduler scans and replica claims.
  const cleanup = async () => {
    await removeContract();
  };
  // Vitest invokes this hook after the actual worker promises finish.
  afterAll(async () => {
    await removeContract();
    await prisma.rentalSpace.delete({ where: { id: spaceId } });
    await prisma.unit.delete({ where: { id: unitId } });
    const ids = actors.map((a) => a.id);
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });
  async function jobs(clock = now) {
    await materializeBusinessJobs('', clock, contractId);
    return prisma.businessJob.findMany({ where: { contractId } });
  }
  async function drain(kind: BusinessJobKind, clock = now, limit = 80) {
    for (let i = 0; i < limit; i++)
      if (!(await runBusinessJobOnce({ now: clock, kinds: [kind] }))) return;
    throw new Error('Job drain exceeded its bound');
  }
  const send = (method: 'GET' | 'POST', path: string, payload?: object, actor = manager) =>
    app.inject({
      method,
      url: '/api/v1' + path,
      payload,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
      },
    });
  const decision = (extra = {}) => ({
    clientId: randomUUID(),
    expectedVersion: 0,
    decision: 'NO_CHANGE',
    note: 'Shared factual review note',
    ...extra,
  });
  async function review() {
    await prisma.contract.update({
      where: { id: contractId },
      data: { startDate: new Date('2024-02-29') },
    });
    await jobs();
    await drain('ANNUAL_REVIEW');
    return prisma.contractReview.findFirstOrThrow({
      where: { contractId },
      orderBy: { dueAt: 'asc' },
    });
  }
  it('materializes one durable job per source and kind across scheduler restarts', async () => {
    try {
      await jobs();
      await jobs();
      expect(await prisma.businessJob.count({ where: { contractId } })).toBe(3);
    } finally {
      await cleanup();
    }
  });
  it('catches up missed full months with exact cents, real month lengths, and one initial prorated month', async () => {
    try {
      await jobs();
      await drain('MONTHLY_OBLIGATIONS');
      await drain('MONTHLY_OBLIGATIONS');
      const records = await prisma.payment.findMany({
        where: { contractId },
        orderBy: { periodStart: 'asc' },
      });
      expect(records).toHaveLength(5);
      expect(records[0]!.amountDue.toFixed(2)).toBe('1500.00');
      expect(records.slice(1).every((row) => row.amountDue.toFixed(2) === '3100.00')).toBe(true);
      expect(records[1]!.dueDate.toISOString()).toBe('2026-02-04T20:00:00.000Z');
      expect(
        (
          await prisma.businessJob.findFirstOrThrow({
            where: { contractId, kind: 'MONTHLY_OBLIGATIONS' },
          })
        ).cursor.toISOString(),
      ).toBe('2026-06-01T00:00:00.000Z');
    } finally {
      await cleanup();
    }
  });
  it('posts the same full rent in a leap February without a daily-rate adjustment', async () => {
    try {
      await prisma.contract.update({
        where: { id: contractId },
        data: { startDate: new Date('2024-01-01'), dueDay: 1 },
      });
      const clock = new Date('2024-03-31T12:00:00Z');
      await jobs(clock);
      await drain('MONTHLY_OBLIGATIONS', clock);
      const payments = await prisma.payment.findMany({
        where: { contractId },
        orderBy: { periodStart: 'asc' },
      });
      expect(payments.map((row) => row.amountDue.toFixed(2))).toEqual([
        '3100.00',
        '3100.00',
        '3100.00',
      ]);
    } finally {
      await cleanup();
    }
  });
  it('does not duplicate the initial obligation written by contract admission', async () => {
    try {
      const original = await prisma.payment.create({
        data: {
          contractId,
          periodStart: new Date('2026-01-17'),
          dueDate: new Date('2026-01-17'),
          amountDue: '1500.00',
        },
      });
      await jobs();
      await drain('MONTHLY_OBLIGATIONS');
      expect(await prisma.payment.count({ where: { contractId } })).toBe(5);
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id: original.id } })).amountDue.toFixed(
          2,
        ),
      ).toBe('1500.00');
    } finally {
      await cleanup();
    }
  });
  it('serializes competing workers without duplicate obligations or audits', async () => {
    try {
      await jobs();
      await Promise.all(
        Array.from({ length: 6 }, () =>
          runBusinessJobOnce({ now, kinds: ['MONTHLY_OBLIGATIONS'] }),
        ),
      );
      await drain('MONTHLY_OBLIGATIONS');
      const payments = await prisma.payment.findMany({
        where: { contractId },
        select: { id: true },
      });
      expect(payments).toHaveLength(5);
      expect(
        await prisma.auditEvent.count({
          where: {
            action: 'MONTHLY_OBLIGATION_CREATED',
            entityId: { in: payments.map((row) => row.id) },
          },
        }),
      ).toBe(5);
    } finally {
      await cleanup();
    }
  });
  it('fences a delayed stale lease after another replica recovers it', async () => {
    try {
      await jobs();
      let release!: () => void, claimed!: () => void;
      const hold = new Promise<void>((resolve) => {
          release = resolve;
        }),
        started = new Promise<void>((resolve) => {
          claimed = resolve;
        });
      const old = runBusinessJobOnce({
        now,
        kinds: ['MONTHLY_OBLIGATIONS'],
        afterClaim: async () => {
          claimed();
          await hold;
        },
      });
      await started;
      await runBusinessJobOnce({
        now: new Date(now.getTime() + 90001),
        kinds: ['MONTHLY_OBLIGATIONS'],
      });
      release();
      await old;
      expect(await prisma.payment.count({ where: { contractId } })).toBe(1);
    } finally {
      await cleanup();
    }
  });
  it('pauses unsupported legacy terms and production financial generation without money effects', async () => {
    try {
      await prisma.contract.update({ where: { id: contractId }, data: { dueDay: 31 } });
      await jobs();
      await drain('MONTHLY_OBLIGATIONS');
      expect(await prisma.payment.count({ where: { contractId } })).toBe(0);
      expect(
        (
          await prisma.businessJob.findFirstOrThrow({
            where: { contractId, kind: 'MONTHLY_OBLIGATIONS' },
          })
        ).failureCode,
      ).toBe('SOURCE_TERMS_INVALID');
      const original = env.NODE_ENV;
      env.NODE_ENV = 'production';
      try {
        await runBusinessJobOnce({ now, kinds: ['OBLIGATION_STATUS'] });
        expect(
          (
            await prisma.businessJob.findFirstOrThrow({
              where: { contractId, kind: 'OBLIGATION_STATUS' },
            })
          ).state,
        ).toBe('PAUSED');
      } finally {
        env.NODE_ENV = original;
      }
    } finally {
      await cleanup();
    }
  });
  it('updates due/late status without a new amount or change to the original due date', async () => {
    try {
      const due = new Date('2026-05-11T20:00:00Z');
      const payment = await prisma.payment.create({
        data: {
          contractId,
          periodStart: new Date('2026-05-01'),
          dueDate: due,
          amountDue: '100.00',
          amountPaid: '10.00',
          status: 'UPCOMING',
        },
      });
      await jobs();
      await drain('OBLIGATION_STATUS');
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
        'PARTIALLY_PAID',
      );
      await drain('OBLIGATION_STATUS', new Date('2026-05-12T20:00:00Z'));
      const late = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(late.status).toBe('LATE');
      expect(late.amountDue.toFixed(2)).toBe('100.00');
      expect(late.dueDate).toEqual(due);
    } finally {
      await cleanup();
    }
  });
  it('creates twelve-month anniversary reviews once without automatic rent changes', async () => {
    try {
      await review();
      await drain('ANNUAL_REVIEW');
      const rows = await prisma.contractReview.findMany({
        where: { contractId },
        orderBy: { dueAt: 'asc' },
      });
      expect(rows.map((row) => row.dueAt.toISOString().slice(0, 10))).toEqual([
        '2025-02-28',
        '2026-02-28',
      ]);
      expect(rows.map((row) => row.milestoneMonths)).toEqual([12, 24]);
      expect(
        (
          await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })
        ).monthlyRent.toFixed(2),
      ).toBe('3100.00');
      expect(
        await prisma.notification.count({
          where: { recipientUserId: manager.id, reviewEvent: { review: { contractId } } },
        }),
      ).toBe(2);
      expect(
        await prisma.noticeDelivery.count({
          where: { notification: { reviewEvent: { review: { contractId } } } },
        }),
      ).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
  it('records no-change once and rejects changed UUID content and competing decisions', async () => {
    try {
      const row = await review(),
        body = decision();
      const first = await send('POST', '/reviews/' + row.id + '/decision', body);
      expect(first.statusCode, first.body).toBe(200);
      const again = await send('POST', '/reviews/' + row.id + '/decision', body);
      expect(again.json().version).toBe(1);
      expect(
        (
          await send('POST', '/reviews/' + row.id + '/decision', {
            ...body,
            note: 'Altered content',
          })
        ).statusCode,
      ).toBe(409);
      expect((await send('POST', '/reviews/' + row.id + '/decision', decision())).statusCode).toBe(
        409,
      );
      expect(
        await prisma.contractReviewEvent.count({ where: { reviewId: row.id, kind: 'NO_CHANGE' } }),
      ).toBe(1);
    } finally {
      await cleanup();
    }
  });
  it('preserves a next-month price proposal and tenant visibility without changing original rent', async () => {
    try {
      const row = await review();
      const response = await send(
        'POST',
        '/reviews/' + row.id + '/decision',
        decision({ decision: 'PROPOSED_PRICE', proposedRent: '3456.78' }),
      );
      expect(response.statusCode, response.body).toBe(200);
      const proposal = await prisma.contractAmendment.findFirstOrThrow({ where: { contractId } });
      expect(proposal.status).toBe('PROPOSED');
      expect(proposal.effectiveDate.getUTCDate()).toBe(1);
      expect(
        (
          await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })
        ).monthlyRent.toFixed(2),
      ).toBe('3100.00');
      const own = await send('GET', '/reviews/' + row.id, undefined, tenant);
      expect(own.statusCode).toBe(200);
      expect(own.body).toContain('3456.78');
      expect(own.body).not.toMatch(/payloadHash|clientId|emiratesId|passwordHash/);
      expect(
        await prisma.notification.count({
          where: { recipientUserId: tenant.id, reviewEvent: { reviewId: row.id } },
        }),
      ).toBe(1);
    } finally {
      await cleanup();
    }
  });
  it('preserves deferral history and permits a later explicit final decision', async () => {
    try {
      const row = await review();
      const next = new Date();
      next.setUTCDate(next.getUTCDate() + 30);
      const deferred = await send(
        'POST',
        '/reviews/' + row.id + '/decision',
        decision({ decision: 'DEFERRED', deferredUntil: next.toISOString().slice(0, 10) }),
      );
      expect(deferred.statusCode, deferred.body).toBe(200);
      expect(deferred.json().reviewedAt).toBeNull();
      const final = await send(
        'POST',
        '/reviews/' + row.id + '/decision',
        decision({ expectedVersion: 1 }),
      );
      expect(final.statusCode, final.body).toBe(200);
      expect(final.json().events.map((event: { kind: string }) => event.kind)).toContain(
        'DEFERRED',
      );
    } finally {
      await cleanup();
    }
  });
  it('rejects foreign, administrative, and tenant review writes and private source exposure', async () => {
    try {
      const row = await review();
      for (const actor of [foreign, admin])
        expect((await send('GET', '/reviews/' + row.id, undefined, actor)).statusCode).toBe(
          actor === admin ? 403 : 404,
        );
      for (const actor of [tenant, admin])
        expect(
          (await send('POST', '/reviews/' + row.id + '/decision', decision(), actor)).statusCode,
        ).toBe(403);
      expect(
        (await send('POST', '/reviews/' + row.id + '/decision', decision(), foreign)).statusCode,
      ).toBe(404);
      expect((await send('GET', '/reviews?unknown=x')).statusCode).toBe(422);
      expect((await send('GET', '/reviews?page=0')).statusCode).toBe(422);
    } finally {
      await cleanup();
    }
  });
  it('retains original space names and refuses silent anniversary resets after a source allocation changes', async () => {
    try {
      const row = await review();
      await prisma.rentalSpace.update({
        where: { id: spaceId },
        data: { name: 'Renamed current room' },
      });
      const read = await send('GET', '/reviews/' + row.id);
      expect(read.json().rentalSpace.name).toBe('Job Space');
      const job = await prisma.businessJob.findFirstOrThrow({
        where: { contractId, kind: 'ANNUAL_REVIEW' },
      });
      await prisma.contract.update({
        where: { id: contractId },
        data: { startDate: new Date('2023-01-01') },
      });
      await runBusinessJobOnce({ now: new Date('2028-01-01'), kinds: ['ANNUAL_REVIEW'] });
      expect(
        (await prisma.businessJob.findUniqueOrThrow({ where: { id: job.id } })).failureCode,
      ).toBe('SOURCE_ALLOCATION_CHANGED');
      expect(await prisma.contractReview.count({ where: { contractId } })).toBe(2);
    } finally {
      await prisma.rentalSpace.update({ where: { id: spaceId }, data: { name: 'Job Space' } });
      await cleanup();
    }
  });
  async function roomRequest(status: 'SUBMITTED' | 'APPROVED' = 'SUBMITTED') {
    return prisma.request.create({
      data: {
        contractId,
        type: 'ROOM_CHANGE',
        status,
        title: 'Recorded room change',
        description: 'Factual legacy request',
        createdAt: now,
        version: 1,
        events: {
          create: {
            kind: status,
            sequence: 1,
            actorUserId: tenant.id,
            actorName: 'Job Tenant',
            actorRole: 'TENANT',
            createdAt: now,
          },
        },
      },
    });
  }
  it('expires an unapproved room change exactly after five calendar days with immutable reason and notices', async () => {
    try {
      const request = await roomRequest();
      await materializeRoomExpiryJobs('', contractId);
      const expiry = roomExpiry(now);
      await runBusinessJobOnce({
        now: new Date(expiry.getTime() - 1),
        kinds: ['ROOM_CHANGE_EXPIRY'],
      });
      expect((await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
        'SUBMITTED',
      );
      await Promise.all([
        runBusinessJobOnce({ now: expiry, kinds: ['ROOM_CHANGE_EXPIRY'] }),
        runBusinessJobOnce({ now: expiry, kinds: ['ROOM_CHANGE_EXPIRY'] }),
      ]);
      const result = await prisma.request.findUniqueOrThrow({
        where: { id: request.id },
        include: { events: true },
      });
      expect(result.status).toBe('REJECTED');
      expect(result.events.filter((event) => event.kind === 'REJECTED')).toHaveLength(1);
      expect(result.events.find((event) => event.kind === 'REJECTED')?.message).toBe(
        roomExpiryReason,
      );
      expect(
        await prisma.notification.count({
          where: { event: { requestId: request.id, kind: 'REJECTED' } },
        }),
      ).toBe(2);
    } finally {
      await cleanup();
    }
  });
  it('never expires a request after an approval or an approval history during negotiation', async () => {
    try {
      const request = await roomRequest();
      await materializeRoomExpiryJobs('', contractId);
      await prisma.request.update({
        where: { id: request.id },
        data: { status: 'AWAITING_MANAGER' },
      });
      await prisma.requestEvent.create({
        data: { requestId: request.id, kind: 'APPROVED', sequence: 2, createdAt: now },
      });
      await runBusinessJobOnce({ now: roomExpiry(now), kinds: ['ROOM_CHANGE_EXPIRY'] });
      expect((await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
        'AWAITING_MANAGER',
      );
    } finally {
      await cleanup();
    }
  });
  it('exposes opaque operational jobs, restricts recovery, and preserves retry cursor and audit reason', async () => {
    try {
      await jobs();
      const job = await prisma.businessJob.findFirstOrThrow({
        where: { contractId, kind: 'MONTHLY_OBLIGATIONS' },
      });
      await prisma.businessJob.update({
        where: { id: job.id },
        data: { state: 'FAILED', failureCode: 'BUSINESS_JOB_FAILED' },
      });
      for (const actor of [manager, tenant])
        expect((await send('GET', '/operations/business-jobs', undefined, actor)).statusCode).toBe(
          403,
        );
      const list = await send('GET', '/operations/business-jobs', undefined, admin);
      expect(list.statusCode).toBe(200);
      expect(list.body).not.toMatch(/contractId|sourceSpaceId|leaseToken|Job Tenant/);
      const body = {
        clientId: randomUUID(),
        expectedRetryCount: 0,
        reason: 'Retry after dependency repair',
      };
      const path = '/operations/business-jobs/' + job.id + '/retry';
      const first = await send('POST', path, body, admin);
      expect(first.statusCode, first.body).toBe(200);
      expect((await send('POST', path, body, admin)).json().retryCount).toBe(1);
      expect(
        (await prisma.businessJob.findUniqueOrThrow({ where: { id: job.id } })).cursor,
      ).toEqual(job.cursor);
      expect(
        (await send('POST', path, { ...body, reason: 'Changed reason' }, admin)).statusCode,
      ).toBe(409);
    } finally {
      await cleanup();
    }
  });
  it.runIf(process.env.BUSINESS_REDIS_TESTS === 'true')(
    'preserves schedules and effects after real Redis checkpoint eviction and worker restart',
    async () => {
      try {
        const clock = new Date(),
          start = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth() - 1, 1));
        await prisma.contract.update({ where: { id: contractId }, data: { startDate: start } });
        const oldPrefix = businessConfig.BUSINESS_REDIS_PREFIX;
        businessConfig.BUSINESS_REDIS_PREFIX = 'leaseflow:test:' + randomUUID();
        const client = new Redis(env.REDIS_URL);
        const heartbeat1 = 'test-worker-' + randomUUID(),
          heartbeat2 = 'test-worker-' + randomUUID();
        const first = businessRuntime(() => {}, heartbeat1),
          second = businessRuntime(() => {}, heartbeat2);
        async function waitFor(check: () => Promise<boolean>) {
          const end = Date.now() + 10000;
          while (Date.now() < end) {
            if (await check()) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('Worker did not reach its durable state');
        }
        try {
          await first.start();
          await waitFor(async () => (await prisma.payment.count({ where: { contractId } })) === 2);
          await first.stop();
          const ids = (
            await prisma.businessJob.findMany({ where: { contractId }, select: { id: true } })
          )
            .map((row) => row.id)
            .sort();
          await client.del(businessConfig.BUSINESS_REDIS_PREFIX + ':contract-scan');
          await second.start();
          await waitFor(
            async () =>
              !!(await prisma.businessWorkerHeartbeat.findUnique({ where: { id: heartbeat2 } })),
          );
          expect(
            (await prisma.businessJob.findMany({ where: { contractId }, select: { id: true } }))
              .map((row) => row.id)
              .sort(),
          ).toEqual(ids);
          expect(await prisma.payment.count({ where: { contractId } })).toBe(2);
        } finally {
          await first.stop();
          await second.stop();
          await client.del(businessConfig.BUSINESS_REDIS_PREFIX + ':contract-scan');
          await client.quit();
          await prisma.businessWorkerHeartbeat.deleteMany({
            where: { id: { in: [heartbeat1, heartbeat2] } },
          });
          businessConfig.BUSINESS_REDIS_PREFIX = oldPrefix;
        }
      } finally {
        await cleanup();
      }
    },
  );
});
