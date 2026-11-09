import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';

describe('MySQL room persistence and concurrent contract admission', () => {
  let app: FastifyInstance;
  let managerId: string;
  let userId: string;
  let unitId: string;
  let spaceId: string;
  let tenantId: string;
  let sessionId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Integration tests require a dedicated database with the _test suffix');
    app = await buildApp();
    await app.ready();
    const manager = await prisma.user.create({
      data: {
        email: randomUUID() + '@integration.invalid',
        passwordHash: 'not-a-login-password',
        role: 'LEASING_MANAGER',
        status: 'ACTIVE',
        leasingManager: { create: { fullName: 'Integration Manager' } },
      },
      include: { leasingManager: true },
    });
    userId = manager.id;
    userIds.push(userId);
    managerId = manager.leasingManager!.id;
    sessionId = (
      await prisma.authSession.create({
        data: { userId, expiresAt: new Date(Date.now() + 3600000) },
      })
    ).id;
    const tenant = await prisma.user.create({
      data: {
        email: randomUUID() + '@integration.invalid',
        passwordHash: 'not-a-login-password',
        role: 'TENANT',
        status: 'ACTIVE',
        tenant: { create: { managerId, fullName: 'Integration Tenant' } },
      },
      include: { tenant: true },
    });
    userIds.push(tenant.id);
    tenantId = tenant.tenant!.id;
  });
  beforeEach(async () => {
    const unit = await prisma.unit.create({
      data: {
        managerId,
        name: 'Integration Unit',
        area: 'Dubai',
        active: true,
        spaces: { create: { name: 'Room A', type: 'ROOM', capacity: 2 } },
      },
      include: { spaces: true },
    });
    unitId = unit.id;
    spaceId = unit.spaces[0]!.id;
  });
  afterAll(async () => {
    if (managerId) {
      const contracts = { tenant: { managerId } };
      await prisma.payment.deleteMany({ where: { contract: contracts } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.contract.deleteMany({ where: contracts });
      await prisma.rentalSpace.deleteMany({ where: { unit: { managerId } } });
      await prisma.unit.deleteMany({ where: { managerId } });
      await prisma.tenantProfile.deleteMany({ where: { managerId } });
      await prisma.leasingManagerProfile.deleteMany({ where: { id: managerId } });
    }
    if (userIds.length) {
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  function edit(extra: object = {}, id = spaceId) {
    return app.inject({
      method: 'PATCH',
      url: '/api/v1/inventory/spaces/' + id,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: userId, role: 'LEASING_MANAGER', sid: sessionId }),
      },
      payload: {
        name: 'Room Updated',
        type: 'ROOM',
        capacity: 2,
        askingRent: '3200.50',
        availability: 'ACTIVE',
        ...extra,
      },
    });
  }
  function contract(extra: object = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/contracts',
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: userId, role: 'LEASING_MANAGER', sid: sessionId }),
      },
      payload: {
        clientId: randomUUID(),
        tenantId,
        rentalSpaceId: spaceId,
        startDate: '2026-11-01',
        monthlyRent: 3000,
        depositAmount: 3000,
        ...extra,
      },
    });
  }

  it('copies unit deposit defaults and keeps the original snapshot after defaults change', async () => {
    await prisma.unit.update({ where: { id: unitId }, data: { defaultDeposit: '850.25' } });
    const created = await contract({ depositAmount: undefined });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ dueDay: 1, noticeDays: 30, endDate: null });
    expect(Number(created.json().depositAmount)).toBe(850.25);
    await prisma.unit.update({ where: { id: unitId }, data: { defaultDeposit: '999.00' } });
    const saved = await prisma.contract.findUniqueOrThrow({ where: { id: created.json().id } });
    expect(saved.depositAmount.toFixed(2)).toBe('850.25');
    expect(created.json().occupants).toHaveLength(1);
    expect(created.json().occupants[0].role).toBe('PRIMARY');
  });
  it('preserves explicit zero deposits and negotiated notice exceptions', async () => {
    const created = await contract({
      depositAmount: '0.00',
      noticeDays: 15,
      monthlyRent: '3000.10',
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().noticeDays).toBe(15);
    expect(Number(created.json().depositAmount)).toBe(0);
    expect(created.json().monthlyRent).toBe('3000.1');
  });
  it('captures a couple without a secondary account or plaintext identity in responses and audit records', async () => {
    const usersBefore = await prisma.user.count();
    const identity = '784-1990-1234567-1';
    const created = await contract({
      secondaryOccupant: {
        fullName: 'Secondary Snapshot',
        dateOfBirth: '1990-01-01',
        nationality: 'Egyptian',
        emiratesIdNumber: identity,
        emiratesIdExpiry: '2030-01-01',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().occupants).toHaveLength(2);
    const secondary = created
      .json()
      .occupants.find((row: { role: string }) => row.role === 'SECONDARY');
    expect(secondary).toMatchObject({
      fullName: 'Secondary Snapshot',
      maskedIdentity: '****67-1',
      recordComplete: true,
    });
    expect(created.body).not.toContain(identity);
    expect(created.body).not.toContain('identityCipher');
    expect(await prisma.user.count()).toBe(usersBefore);
    const persisted = await prisma.contractOccupant.findFirstOrThrow({
      where: { contractId: created.json().id, role: 'SECONDARY' },
    });
    expect(persisted.identityCipher).toMatch(/^sealed:/);
    expect(persisted.identityCipher).not.toContain(identity);
    const audit = await prisma.auditEvent.findMany({
      where: { entityType: 'Contract', entityId: created.json().id },
    });
    expect(JSON.stringify(audit)).not.toContain(identity);
  });
  it('replays concurrent contract keys without duplicate allocations, obligations, or audits', async () => {
    const key = randomUUID();
    const results = await Promise.all([contract({ clientId: key }), contract({ clientId: key })]);
    expect(results.map((row) => row.statusCode)).toEqual([201, 201]);
    expect(results[0]!.json().id).toBe(results[1]!.json().id);
    const id = results[0]!.json().id;
    expect(await prisma.contract.count({ where: { rentalSpaceId: spaceId } })).toBe(1);
    expect(await prisma.payment.count({ where: { contractId: id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityId: id, entityType: 'Contract' } })).toBe(
      1,
    );
    expect((await contract({ clientId: key, monthlyRent: '3500.00' })).statusCode).toBe(409);
  });
  it('requires explicit deposits across currencies and rejects unknown monetary fields', async () => {
    expect((await contract({ currency: 'USD', depositAmount: undefined })).statusCode).toBe(422);
    expect((await contract({ monthlyRent: '1.001' })).statusCode).toBe(422);
    expect((await contract({ futureApproved: true })).statusCode).toBe(422);
    expect(await prisma.contract.count({ where: { rentalSpaceId: spaceId } })).toBe(0);
  });
  it('keeps manager draft terms private from their primary tenant', async () => {
    const draft = await prisma.contract.create({
      data: {
        tenantId,
        rentalSpaceId: spaceId,
        monthlyRent: 1000,
        startDate: new Date('2026-01-01'),
        status: 'DRAFT',
      },
    });
    const sid = (
      await prisma.authSession.create({
        data: { userId: userIds[1]!, expiresAt: new Date(Date.now() + 3600000) },
      })
    ).id;
    const headers = {
      authorization: 'Bearer ' + app.jwt.sign({ sub: userIds[1]!, role: 'TENANT', sid }),
    };
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/contracts/' + draft.id, headers }))
        .statusCode,
    ).toBe(404);
    const list = await app.inject({ method: 'GET', url: '/api/v1/contracts', headers });
    expect(list.json().some((row: { id: string }) => row.id === draft.id)).toBe(false);
  });
  it('persists edits, holds, restoration, and audit history', async () => {
    expect((await edit({ availability: 'MAINTENANCE' })).statusCode).toBe(200);
    let saved = await prisma.rentalSpace.findUniqueOrThrow({ where: { id: spaceId } });
    expect(saved.status).toBe('MAINTENANCE');
    expect(saved.askingRent?.toFixed(2)).toBe('3200.50');
    expect((await contract()).statusCode).toBe(404);
    expect((await edit({ availability: 'INACTIVE' })).statusCode).toBe(200);
    saved = await prisma.rentalSpace.findUniqueOrThrow({ where: { id: spaceId } });
    expect(saved.enabled).toBe(false);
    expect((await contract()).statusCode).toBe(404);
    expect((await edit()).statusCode).toBe(200);
    const events = await prisma.auditEvent.findMany({
      where: { entityId: spaceId },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(3);
    expect(events[0]?.oldValue).toMatchObject({ name: 'Room A' });
    expect(events[0]?.newValue).toMatchObject({ name: 'Room Updated', status: 'MAINTENANCE' });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).active).toBe(true);
  });
  it('serializes simultaneous requests for the last available place', async () => {
    await prisma.rentalSpace.update({ where: { id: spaceId }, data: { capacity: 1 } });
    const results = await Promise.all([contract(), contract()]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    expect(await prisma.contract.count({ where: { rentalSpaceId: spaceId } })).toBe(1);
    expect(await prisma.payment.count({ where: { contract: { rentalSpaceId: spaceId } } })).toBe(1);
    expect((await prisma.rentalSpace.findUniqueOrThrow({ where: { id: spaceId } })).status).toBe(
      'OCCUPIED',
    );
  });
  it('counts secondary occupants and protects rent history', async () => {
    const response = await contract({
      secondaryOccupant: {
        fullName: 'Secondary Occupant',
        dateOfBirth: '1990-01-01',
        nationality: 'Egyptian',
        emiratesIdNumber: '784-1990-1234567-1',
        emiratesIdExpiry: '2030-01-01',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().rentalSpace.status).toBe('OCCUPIED');
    expect((await contract()).statusCode).toBe(409);
    expect((await edit({ capacity: 1 })).statusCode).toBe(409);
    expect((await edit({ availability: 'MAINTENANCE' })).statusCode).toBe(409);
    expect((await edit({ askingRent: '4000' })).statusCode).toBe(200);
    const saved = await prisma.contract.findFirstOrThrow({ where: { rentalSpaceId: spaceId } });
    expect(saved.monthlyRent.toFixed(2)).toBe('3000.00');
  });
  it('serializes a capacity reduction against a new two-person contract', async () => {
    const results = await Promise.all([
      edit({ capacity: 1 }),
      contract({
        secondaryOccupant: {
          fullName: 'Secondary Occupant',
          dateOfBirth: '1990-01-01',
          nationality: 'Egyptian',
          emiratesIdNumber: '784-1990-1234567-1',
          emiratesIdExpiry: '2030-01-01',
        },
      }),
    ]);
    expect([200, 409]).toContain(results[0]!.statusCode);
    expect([201, 409]).toContain(results[1]!.statusCode);
    const room = await prisma.rentalSpace.findUniqueOrThrow({ where: { id: spaceId } });
    const contracts = await prisma.contract.findMany({ where: { rentalSpaceId: spaceId } });
    const occupants = contracts.reduce((total, row) => total + (row.secondaryOccupant ? 2 : 1), 0);
    expect(occupants).toBeLessThanOrEqual(room.capacity);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(1);
  });
  it('rejects unknown room identifiers without audit writes', async () => {
    const before = await prisma.auditEvent.count({ where: { actorUserId: userId } });
    expect((await edit({}, 'foreign-' + randomUUID())).statusCode).toBe(404);
    expect(await prisma.auditEvent.count({ where: { actorUserId: userId } })).toBe(before);
  });
});
