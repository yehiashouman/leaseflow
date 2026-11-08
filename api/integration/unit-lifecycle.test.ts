import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';

describe('MySQL unit archive, amenities, and owner schedules', () => {
  let app: FastifyInstance;
  let owner: { id: string; profile: string; sid: string };
  let foreign: typeof owner;
  let unitId: string;
  let tenantId: string;
  let ip = 60;
  const userIds: string[] = [];
  const managerIds: string[] = [];
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Dedicated _test database required');
    app = await buildApp();
    await app.ready();
    async function manager() {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@unit-lifecycle.invalid',
          passwordHash: 'not-a-login-hash',
          role: 'LEASING_MANAGER',
          status: 'ACTIVE',
          leasingManager: { create: { fullName: 'Unit Manager' } },
        },
        include: { leasingManager: true },
      });
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      userIds.push(user.id);
      managerIds.push(user.leasingManager!.id);
      return { id: user.id, profile: user.leasingManager!.id, sid: session.id };
    }
    owner = await manager();
    foreign = await manager();
    const tenant = await prisma.user.create({
      data: {
        email: randomUUID() + '@unit-lifecycle.invalid',
        passwordHash: 'not-a-login-hash',
        role: 'TENANT',
        status: 'ACTIVE',
        tenant: { create: { fullName: 'Unit Tenant', managerId: owner.profile } },
      },
      include: { tenant: true },
    });
    userIds.push(tenant.id);
    tenantId = tenant.tenant!.id;
  });
  const body = () => ({
    name: 'Lifecycle Unit',
    area: 'Dubai Marina',
    currency: 'USD',
    ownerMonthlyRent: '8000.25',
    ownerPaymentSchedule: 'Four cheques\nDue dates agreed externally',
    defaultDeposit: '2500',
    declarationAccepted: true,
    amenities: {
      airConditioning: true,
      furnished: true,
      bed: true,
      television: true,
      refrigerator: true,
      bathroom: true,
      kitchen: true,
      laundry: true,
      balcony: true,
      parking: true,
      wifi: true,
      cleaning: true,
      additional: ['Lift', 'Gym'],
    },
  });
  function send(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, actor = owner) {
    return app.inject({
      method,
      url: path.startsWith('/api/') ? path : '/api/v1/inventory' + path,
      payload,
      headers: {
        'x-forwarded-for': '198.51.100.' + ip,
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: 'LEASING_MANAGER', sid: actor.sid }),
      },
    });
  }
  beforeEach(async () => {
    ip++;
    const response = await send('POST', '/units', body());
    expect(response.statusCode, response.body).toBe(201);
    unitId = response.json().id;
  });
  afterAll(async () => {
    if (managerIds.length) {
      const units = await prisma.unit.findMany({
        where: { managerId: { in: managerIds } },
        select: { id: true },
      });
      const ids = units.map((unit) => unit.id);
      const contracts = await prisma.contract.findMany({
        where: { rentalSpace: { unitId: { in: ids } } },
        select: { id: true },
      });
      const contractIds = contracts.map((contract) => contract.id);
      await prisma.payment.deleteMany({ where: { contractId: { in: contractIds } } });
      await prisma.contract.deleteMany({ where: { id: { in: contractIds } } });
      await prisma.rentalSpace.deleteMany({ where: { unitId: { in: ids } } });
      await prisma.unit.deleteMany({ where: { id: { in: ids } } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.tenantProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.leasingManagerProfile.deleteMany({ where: { id: { in: managerIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  async function room() {
    const response = await send('POST', '/units/' + unitId + '/spaces', {
      name: 'Unit Room',
      type: 'ROOM',
      capacity: 2,
      askingRent: '3000',
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json();
  }
  async function proposal(spaceId: string) {
    return send('POST', '/api/v1/contracts', {
      tenantId,
      rentalSpaceId: spaceId,
      startDate: '2026-11-01',
      monthlyRent: 3000,
      depositAmount: 2500,
    });
  }
  it('persists twelve amenities, custom labels, owner currency, rent, and literal payment schedule', async () => {
    const detail = (await send('GET', '/units/' + unitId)).json();
    expect(detail).toMatchObject({
      managerId: owner.profile,
      currency: 'USD',
      ownerMonthlyRent: '8000.25',
      ownerPaymentSchedule: body().ownerPaymentSchedule,
      amenities: body().amenities,
      active: false,
      archivedAt: null,
    });
    const updated = await send('PATCH', '/units/' + unitId, {
      ...body(),
      amenities: { ...body().amenities, wifi: false, additional: ['Pool'] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().amenities).toMatchObject({ wifi: false, additional: ['Pool'] });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: unitId, action: 'UPDATE' },
    });
    expect(audit.oldValue).toMatchObject({ amenities: { wifi: true } });
    expect(audit.newValue).toMatchObject({ amenities: { wifi: false } });
  });
  it('rejects invalid amenities, schedule limits, foreign archive, and ownership injection', async () => {
    expect(
      (await send('POST', '/units', { ...body(), amenities: { wifi: 'yes' } })).statusCode,
    ).toBe(422);
    expect(
      (
        await send('POST', '/units', {
          ...body(),
          amenities: { additional: Array(21).fill('Extra') },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await send('POST', '/units', { ...body(), ownerPaymentSchedule: 'A'.repeat(1001) }))
        .statusCode,
    ).toBe(422);
    expect((await send('POST', '/units', { ...body(), active: true })).statusCode).toBe(422);
    for (const action of ['archive', 'restore'])
      expect(
        (await send('POST', '/units/' + unitId + '/' + action, undefined, foreign)).statusCode,
      ).toBe(404);
  });
  it('archives and restores as a draft without duplicate audit or erased room history', async () => {
    const space = await room();
    await prisma.unit.update({ where: { id: unitId }, data: { active: true } });
    expect((await send('POST', '/units/' + unitId + '/archive')).statusCode).toBe(200);
    expect((await send('POST', '/units/' + unitId + '/archive')).statusCode).toBe(200);
    expect(
      (await send('GET', '/units')).json().some((item: { id: string }) => item.id === unitId),
    ).toBe(false);
    expect(
      (await send('GET', '/units?status=ARCHIVED&q=Lifecycle'))
        .json()
        .some((item: { id: string }) => item.id === unitId),
    ).toBe(true);
    expect((await send('PATCH', '/units/' + unitId, body())).statusCode).toBe(409);
    expect(
      (
        await send('POST', '/units/' + unitId + '/spaces', {
          name: 'Blocked',
          type: 'ROOM',
          capacity: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect((await proposal(space.id)).statusCode).toBe(404);
    expect((await send('POST', '/units/' + unitId + '/restore')).json()).toMatchObject({
      active: false,
      archivedAt: null,
    });
    expect((await send('POST', '/units/' + unitId + '/restore')).statusCode).toBe(200);
    expect(await prisma.auditEvent.count({ where: { entityId: unitId, action: 'ARCHIVE' } })).toBe(
      1,
    );
    expect(await prisma.auditEvent.count({ where: { entityId: unitId, action: 'RESTORE' } })).toBe(
      1,
    );
    expect(await prisma.rentalSpace.findUnique({ where: { id: space.id } })).not.toBeNull();
  });
  it('blocks archive for open or draft contracts and retains closed contract history', async () => {
    const space = await room();
    const contract = await prisma.contract.create({
      data: {
        tenantId,
        rentalSpaceId: space.id,
        startDate: new Date(),
        status: 'DRAFT',
        monthlyRent: 3000,
        depositAmount: 2500,
      },
    });
    for (const status of ['DRAFT', 'ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] as const) {
      await prisma.contract.update({ where: { id: contract.id }, data: { status } });
      expect((await send('POST', '/units/' + unitId + '/archive')).statusCode).toBe(409);
    }
    await prisma.contract.update({ where: { id: contract.id }, data: { status: 'CLOSED' } });
    expect((await send('POST', '/units/' + unitId + '/archive')).statusCode).toBe(200);
    expect(await prisma.contract.findUnique({ where: { id: contract.id } })).not.toBeNull();
  });
  it('preserves contract rent and deposit when owner amounts and unit defaults change', async () => {
    const space = await room();
    const contract = await prisma.contract.create({
      data: {
        tenantId,
        rentalSpaceId: space.id,
        startDate: new Date(),
        status: 'ACTIVE',
        monthlyRent: 3000,
        depositAmount: 2500,
      },
    });
    expect(
      (
        await send('PATCH', '/units/' + unitId, {
          ...body(),
          ownerMonthlyRent: '9000',
          defaultDeposit: '5000',
          currency: 'AED',
        })
      ).statusCode,
    ).toBe(200);
    const saved = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(saved.monthlyRent.toString()).toBe('3000');
    expect(saved.depositAmount.toString()).toBe('2500');
    expect(saved.currency).toBe('AED');
  });
  it('serializes archive against contract admission without an archived live allocation', async () => {
    const space = await room();
    await prisma.unit.update({ where: { id: unitId }, data: { active: true } });
    const [archive, admission] = await Promise.all([
      send('POST', '/units/' + unitId + '/archive'),
      proposal(space.id),
    ]);
    expect([
      [200, 404],
      [409, 201],
    ]).toContainEqual([archive.statusCode, admission.statusCode]);
    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(
      Boolean(unit.archivedAt) &&
        (await prisma.contract.count({ where: { rentalSpaceId: space.id, status: 'ACTIVE' } })) > 0,
    ).toBe(false);
  });
});
