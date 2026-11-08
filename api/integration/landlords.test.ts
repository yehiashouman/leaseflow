import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';

describe('MySQL landlord lifecycle and property metadata', () => {
  let app: FastifyInstance;
  let owner: { id: string; userId: string; sessionId: string };
  let foreign: typeof owner;
  let landlordId: string;
  let suffix: string;
  const userIds: string[] = [];
  const managerIds: string[] = [];
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Integration tests require a dedicated _test database');
    app = await buildApp();
    await app.ready();
    async function manager() {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@inventory.invalid',
          passwordHash: 'not-a-login-hash',
          role: 'LEASING_MANAGER',
          status: 'ACTIVE',
          leasingManager: { create: { fullName: 'Inventory Manager' } },
        },
        include: { leasingManager: true },
      });
      userIds.push(user.id);
      managerIds.push(user.leasingManager!.id);
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      return { id: user.leasingManager!.id, userId: user.id, sessionId: session.id };
    }
    owner = await manager();
    foreign = await manager();
  });
  beforeEach(async () => {
    suffix = randomUUID().slice(0, 8);
    const response = await send('POST', '/landlords', {
      name: 'Owner ' + suffix,
      companyName: 'Company ' + suffix,
      email: suffix + '@owner.invalid',
      phone: '+971500000000',
      whatsapp: '+971500000001',
      preferredContactMethod: 'EMAIL',
      address: 'Dubai Marina',
      notes: 'First line\nSecond line',
    });
    expect(response.statusCode).toBe(201);
    landlordId = response.json().id;
  });
  afterAll(async () => {
    if (managerIds.length) {
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.unit.deleteMany({ where: { managerId: { in: managerIds } } });
      await prisma.landlord.deleteMany({ where: { managerId: { in: managerIds } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.leasingManagerProfile.deleteMany({ where: { id: { in: managerIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  function send(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    payload?: object,
    actor = owner,
    userAgent?: string,
  ) {
    return app.inject({
      method,
      url: '/api/v1/inventory' + path,
      payload,
      headers: {
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        authorization:
          'Bearer ' +
          app.jwt.sign({ sub: actor.userId, role: 'LEASING_MANAGER', sid: actor.sessionId }),
      },
    });
  }
  const unitBody = () => ({
    name: 'Unit ' + randomUUID().slice(0, 8),
    area: 'Dubai Marina',
    building: 'Demo Tower',
    street: 'Marina Road',
    emirate: 'Dubai',
    addressNotes: 'Gate 2\nFloor 3',
    latitude: 0,
    longitude: 55.2708,
    defaultDeposit: '2500',
    landlordId,
    declarationAccepted: true,
  });

  it('persists names, company, contacts, preferences, and multiline notes', async () => {
    const saved = await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } });
    expect(saved).toMatchObject({
      name: 'Owner ' + suffix,
      companyName: 'Company ' + suffix,
      preferredContactMethod: 'EMAIL',
      notes: 'First line\nSecond line',
      archivedAt: null,
      managerId: owner.id,
    });
    const response = await send('GET', '/landlords/' + landlordId);
    expect(response.statusCode).toBe(200);
    expect(response.json().units).toEqual([]);
  });
  it('edits contacts with old/new audit values and no duplicate record', async () => {
    expect(
      (
        await send('PATCH', '/landlords/' + landlordId, {
          name: 'Updated ' + suffix,
          preferredContactMethod: 'WHATSAPP',
          notes: 'Updated notes',
        })
      ).statusCode,
    ).toBe(200);
    const saved = await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } });
    expect(saved.preferredContactMethod).toBe('WHATSAPP');
    expect(saved.companyName).toBe('Company ' + suffix);
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: landlordId, action: 'UPDATE' },
    });
    expect(event.oldValue).toMatchObject({ name: 'Owner ' + suffix });
    expect(event.newValue).toMatchObject({ name: 'Updated ' + suffix });
  });
  it('accepts declared string limits and long audit user-agent metadata', async () => {
    const userAgent = 'Synthetic user agent '.repeat(30);
    const response = await send(
      'POST',
      '/landlords',
      { name: 'Boundary Owner', companyName: 'C'.repeat(200), address: 'A'.repeat(500) },
      owner,
      userAgent,
    );
    expect(response.statusCode).toBe(201);
    const saved = await prisma.landlord.findUniqueOrThrow({ where: { id: response.json().id } });
    expect(saved.companyName).toHaveLength(200);
    expect(saved.address).toHaveLength(500);
    expect(
      (
        await prisma.auditEvent.findFirstOrThrow({
          where: { entityId: saved.id, action: 'CREATE' },
        })
      ).userAgent,
    ).toBe(userAgent);
    const unit = await send('POST', '/units', { ...unitBody(), street: 'S'.repeat(200) });
    expect(unit.statusCode).toBe(201);
    expect(
      (await prisma.unit.findUniqueOrThrow({ where: { id: unit.json().id } })).street,
    ).toHaveLength(200);
  });
  it('reuses one landlord for multiple owned units and persists complete address, GPS, and deposit fields', async () => {
    const body = unitBody();
    const first = await send('POST', '/units', body);
    const second = await send('POST', '/units', unitBody());
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const detail = await send('GET', '/landlords/' + landlordId);
    expect(detail.json().units).toHaveLength(2);
    const saved = await prisma.unit.findUniqueOrThrow({ where: { id: first.json().id } });
    expect(saved).toMatchObject({
      managerId: owner.id,
      landlordId,
      name: body.name,
      building: 'Demo Tower',
      street: 'Marina Road',
      area: 'Dubai Marina',
      emirate: 'Dubai',
      addressNotes: 'Gate 2\nFloor 3',
    });
    expect(saved.latitude?.toString()).toBe('0');
    expect(saved.longitude?.toString()).toBe('55.2708');
    expect(saved.defaultDeposit.toFixed(2)).toBe('2500.00');
    const list = await send('GET', '/landlords?q=' + suffix);
    expect(list.json().find((item: { id: string }) => item.id === landlordId)._count.units).toBe(2);
  });
  it('archives and restores without deletion or duplicate audit events', async () => {
    expect((await send('POST', '/landlords/' + landlordId + '/archive')).statusCode).toBe(200);
    expect(
      (await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } })).archivedAt,
    ).not.toBeNull();
    expect((await send('GET', '/landlords?q=' + suffix)).json()).toHaveLength(0);
    expect((await send('GET', '/landlords?status=ARCHIVED&q=' + suffix)).json()).toHaveLength(1);
    expect(
      (await send('PATCH', '/landlords/' + landlordId, { name: 'Blocked Edit' })).statusCode,
    ).toBe(409);
    expect((await send('POST', '/units', unitBody())).statusCode).toBe(404);
    expect((await send('POST', '/landlords/' + landlordId + '/archive')).statusCode).toBe(200);
    expect(
      await prisma.auditEvent.count({ where: { entityId: landlordId, action: 'ARCHIVE' } }),
    ).toBe(1);
    expect((await send('POST', '/landlords/' + landlordId + '/restore')).statusCode).toBe(200);
    expect((await send('POST', '/landlords/' + landlordId + '/restore')).statusCode).toBe(200);
    expect(
      (await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } })).archivedAt,
    ).toBeNull();
    expect(
      await prisma.auditEvent.count({ where: { entityId: landlordId, action: 'RESTORE' } }),
    ).toBe(1);
    expect((await send('POST', '/units', unitBody())).statusCode).toBe(201);
  });
  it('rejects archive while linked units remain intact', async () => {
    const unit = await send('POST', '/units', unitBody());
    expect((await send('POST', '/landlords/' + landlordId + '/archive')).statusCode).toBe(409);
    expect(
      (await prisma.unit.findUniqueOrThrow({ where: { id: unit.json().id } })).landlordId,
    ).toBe(landlordId);
    expect(
      await prisma.auditEvent.count({ where: { entityId: landlordId, action: 'ARCHIVE' } }),
    ).toBe(0);
  });
  it('rejects cross-manager detail, edits, archive, restore, and unit references', async () => {
    expect((await send('GET', '/landlords/' + landlordId, undefined, foreign)).statusCode).toBe(
      404,
    );
    expect(
      (await send('PATCH', '/landlords/' + landlordId, { name: 'Forged' }, foreign)).statusCode,
    ).toBe(404);
    for (const action of ['archive', 'restore'])
      expect(
        (await send('POST', '/landlords/' + landlordId + '/' + action, undefined, foreign))
          .statusCode,
      ).toBe(404);
    expect((await send('POST', '/units', unitBody(), foreign)).statusCode).toBe(404);
    expect((await send('GET', '/landlords?q=' + suffix, undefined, foreign)).json()).toHaveLength(
      0,
    );
  });
  it('hides foreign legacy unit links from details and counts', async () => {
    await prisma.unit.create({
      data: { managerId: foreign.id, landlordId, name: 'Foreign legacy unit', area: 'Dubai' },
    });
    expect((await send('GET', '/landlords/' + landlordId)).json().units).toEqual([]);
    expect((await send('GET', '/landlords?q=' + suffix)).json()[0]._count.units).toBe(0);
    expect((await send('POST', '/landlords/' + landlordId + '/archive')).statusCode).toBe(409);
  });
  it('rejects forged owner/status fields and invalid contact or coordinate values', async () => {
    for (const extra of [
      { managerId: foreign.id },
      { archivedAt: new Date().toISOString() },
      { preferredContactMethod: 'SMS' },
    ])
      expect(
        (await send('POST', '/landlords', { name: 'Invalid Owner', ...extra })).statusCode,
      ).toBe(422);
    expect((await send('POST', '/units', { ...unitBody(), latitude: 91 })).statusCode).toBe(422);
    expect(
      (await send('POST', '/units', { ...unitBody(), defaultDeposit: '12.345' })).statusCode,
    ).toBe(422);
    expect(
      (await send('POST', '/landlords/' + landlordId + '/archive', { managerId: foreign.id }))
        .statusCode,
    ).toBe(422);
  });
  it('serializes archive against new unit creation', async () => {
    const [archive, creation] = await Promise.all([
      send('POST', '/landlords/' + landlordId + '/archive'),
      send('POST', '/units', unitBody()),
    ]);
    expect([
      [200, 404],
      [409, 201],
    ]).toContainEqual([archive.statusCode, creation.statusCode]);
    const saved = await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } });
    const links = await prisma.unit.count({ where: { landlordId } });
    expect(Boolean(saved.archivedAt) && links > 0).toBe(false);
  });
  it('serializes archive against an existing unit reassignment', async () => {
    const created = await send('POST', '/units', { ...unitBody(), landlordId: null });
    const body = unitBody();
    body.name = created.json().name;
    const [archive, assignment] = await Promise.all([
      send('POST', '/landlords/' + landlordId + '/archive'),
      send('PATCH', '/units/' + created.json().id, body),
    ]);
    expect([
      [200, 404],
      [409, 200],
    ]).toContainEqual([archive.statusCode, assignment.statusCode]);
    const saved = await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } });
    expect(
      Boolean(saved.archivedAt) && (await prisma.unit.count({ where: { landlordId } })) > 0,
    ).toBe(false);
  });
});
