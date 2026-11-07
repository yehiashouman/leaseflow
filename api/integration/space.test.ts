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
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  function edit(extra: object = {}, id = spaceId) {
    return app.inject({
      method: 'PATCH',
      url: '/api/v1/inventory/spaces/' + id,
      headers: {
        authorization: 'Bearer ' + app.jwt.sign({ sub: userId, role: 'LEASING_MANAGER' }),
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
        authorization: 'Bearer ' + app.jwt.sign({ sub: userId, role: 'LEASING_MANAGER' }),
      },
      payload: {
        tenantId,
        rentalSpaceId: spaceId,
        startDate: '2026-11-01',
        monthlyRent: 3000,
        depositAmount: 3000,
        ...extra,
      },
    });
  }

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
    const response = await contract({ secondaryOccupant: { fullName: 'Secondary Occupant' } });
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
      contract({ secondaryOccupant: { fullName: 'Secondary Occupant' } }),
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
