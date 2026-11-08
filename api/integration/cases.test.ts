import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RequestStatus, Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';

type Actor = { id: string; profileId: string; role: Role; sid: string };
describe('MySQL private operational case workflow', () => {
  let app: FastifyInstance;
  let manager: Actor;
  let tenant: Actor;
  let roommate: Actor;
  let outsider: Actor;
  let admin: Actor;
  let contractId: string;
  let requestId: string;
  let clientIp = 1;
  const users: string[] = [];
  const managers: string[] = [];
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Integration tests require a dedicated _test database');
    app = await buildApp();
    await app.ready();
    async function actor(role: Role, managerId?: string): Promise<Actor> {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@case.invalid',
          passwordHash: 'not-a-login-hash',
          role,
          status: 'ACTIVE',
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Case Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Case Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { leasingManager: true, tenant: true },
      });
      users.push(user.id);
      if (user.leasingManager) managers.push(user.leasingManager.id);
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      return {
        id: user.id,
        profileId: user.leasingManager?.id ?? user.tenant?.id ?? user.id,
        role,
        sid: session.id,
      };
    }
    manager = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.profileId);
    roommate = await actor('TENANT', manager.profileId);
    outsider = await actor('LEASING_MANAGER');
    admin = await actor('ADMIN');
    const unit = await prisma.unit.create({
      data: {
        managerId: manager.profileId,
        name: 'Case Unit',
        area: 'Dubai',
        ownerMonthlyRent: 12345,
      },
    });
    const room = await prisma.rentalSpace.create({
      data: { unitId: unit.id, name: 'Case Room', type: 'ROOM', capacity: 2 },
    });
    const contract = await prisma.contract.create({
      data: {
        tenantId: tenant.profileId,
        rentalSpaceId: room.id,
        startDate: new Date(),
        status: 'ACTIVE',
        monthlyRent: 3000,
        depositAmount: 2000,
      },
    });
    contractId = contract.id;
    await prisma.contract.create({
      data: {
        tenantId: roommate.profileId,
        rentalSpaceId: room.id,
        startDate: new Date(),
        status: 'ACTIVE',
        monthlyRent: 3000,
      },
    });
  });
  beforeEach(async () => {
    clientIp += 1;
    const response = await send('POST', '', submission());
    expect(response.statusCode, response.body).toBe(201);
    requestId = response.json().id;
  });
  afterAll(async () => {
    if (users.length) {
      const contracts = await prisma.contract.findMany({
        where: { tenant: { userId: { in: users } } },
        select: { id: true },
      });
      const ids = contracts.map((item) => item.id);
      await prisma.requestEvent.deleteMany({ where: { request: { contractId: { in: ids } } } });
      await prisma.request.deleteMany({ where: { contractId: { in: ids } } });
      await prisma.contract.deleteMany({ where: { id: { in: ids } } });
      await prisma.rentalSpace.deleteMany({ where: { unit: { managerId: { in: managers } } } });
      await prisma.unit.deleteMany({ where: { managerId: { in: managers } } });
      await prisma.tenantProfile.deleteMany({ where: { userId: { in: users } } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
      await prisma.leasingManagerProfile.deleteMany({ where: { id: { in: managers } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  function send(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: object,
    actor = tenant,
  ) {
    return app.inject({
      method,
      url: path.startsWith('/api/') ? path : '/api/v1/requests' + path,
      payload,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
        'x-forwarded-for': '198.51.100.' + clientIp,
      },
    });
  }
  const submission = () => ({
    contractId,
    clientId: randomUUID(),
    type: 'MAINTENANCE',
    title: 'Private tap repair',
    description: 'Private complaint text',
    category: 'Plumbing',
    urgency: 'URGENT',
  });
  async function decision(
    status: RequestStatus,
    actor = manager,
    message = 'Decision explanation',
  ) {
    const current = (await send('GET', '/' + requestId, undefined, actor)).json();
    const response = await send(
      'POST',
      '/' + requestId + '/respond',
      { clientId: randomUUID(), status, expectedVersion: current.version, message },
      actor,
    );
    expect(response.statusCode, response.body).toBe(200);
    return response.json();
  }
  it('stores author snapshots, ordered events, safe metadata, and minimal transactional audit', async () => {
    const response = await send('GET', '/' + requestId);
    const row = response.json();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(row).toMatchObject({
      version: 1,
      status: 'SUBMITTED',
      metadata: { category: 'Plumbing', urgency: 'URGENT' },
      events: [
        {
          actorUserId: tenant.id,
          actorName: 'Case Tenant',
          actorRole: 'TENANT',
          sequence: 1,
          kind: 'SUBMITTED',
        },
      ],
    });
    expect(new Date(row.events[0].createdAt).getTime()).toBeGreaterThan(0);
    for (const privateField of ['ownerMonthlyRent', 'passwordHash', 'emiratesIdNumber', 'clientId'])
      expect(response.body).not.toContain(privateField);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: requestId } });
    expect(audit.newValue).toMatchObject({ status: 'SUBMITTED', version: 1 });
    expect(JSON.stringify(audit)).not.toContain('Private complaint text');
  });
  it('replays submissions without duplicates and rejects changed content', async () => {
    const body = submission();
    const first = await send('POST', '', body);
    const retry = await send('POST', '', body);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().id).toBe(first.json().id);
    expect(retry.json().events).toHaveLength(1);
    expect((await send('POST', '', { ...body, title: 'Different content' })).statusCode).toBe(409);
    expect(await prisma.auditEvent.count({ where: { entityId: first.json().id } })).toBe(1);
  });
  it('excludes tenant account secrets and case replay keys from adjacent contract and dashboard responses', async () => {
    for (const path of ['/api/v1/contracts', '/api/v1/dashboard/tenant']) {
      const response = await send('GET', path);
      expect(response.statusCode).toBe(200);
      for (const field of [
        'ownerMonthlyRent',
        'passwordHash',
        'clientId',
        'Private complaint text',
      ])
        expect(response.body).not.toContain(field);
    }
    const managerContracts = await send('GET', '/api/v1/contracts', undefined, manager);
    expect(managerContracts.statusCode).toBe(200);
    expect(managerContracts.body).not.toContain('passwordHash');
    expect(
      managerContracts.json().find((item: { id: string }) => item.id === contractId).tenant,
    ).toEqual({
      id: tenant.profileId,
      fullName: 'Case Tenant',
    });
  });
  it('denies roommates, foreign managers, administrators, and foreign contract submissions', async () => {
    for (const actor of [roommate, outsider]) {
      expect((await send('GET', '/' + requestId, undefined, actor)).statusCode).toBe(404);
      expect((await send('GET', '', undefined, actor)).json()).toEqual([]);
      expect(
        (
          await send(
            'POST',
            '/' + requestId + '/messages',
            { clientId: randomUUID(), message: 'Intrusion' },
            actor,
          )
        ).statusCode,
      ).toBe(404);
    }
    expect((await send('POST', '', submission(), roommate)).statusCode).toBe(404);
    expect((await send('GET', '', undefined, admin)).statusCode).toBe(403);
    expect((await send('GET', '/' + requestId, undefined, admin)).statusCode).toBe(403);
    expect((await send('GET', '/options', undefined, manager)).statusCode).toBe(403);
  });
  it('hides inconsistent legacy manager relationships from reads and writes', async () => {
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { managerId: outsider.profileId },
    });
    try {
      for (const actor of [tenant, manager, outsider])
        expect((await send('GET', '/' + requestId, undefined, actor)).statusCode).toBe(404);
      for (const actor of [tenant, manager, outsider]) {
        const contracts = (await send('GET', '/api/v1/contracts', undefined, actor)).json();
        expect(contracts.some((item: { id: string }) => item.id === contractId)).toBe(false);
      }
      expect((await send('GET', '/api/v1/dashboard/tenant')).json().contracts).toEqual([]);
      expect((await send('POST', '', submission())).statusCode).toBe(404);
      expect(
        (
          await send('POST', '/' + requestId + '/messages', {
            clientId: randomUUID(),
            message: 'Blocked',
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await prisma.tenantProfile.update({
        where: { id: tenant.profileId },
        data: { managerId: manager.profileId },
      });
    }
  });
  it('retains both concurrent messages with unique sequences and immutable author snapshots', async () => {
    const [first, second] = await Promise.all([
      send('POST', '/' + requestId + '/messages', {
        clientId: randomUUID(),
        message: 'Tenant note',
      }),
      send(
        'POST',
        '/' + requestId + '/messages',
        { clientId: randomUUID(), message: 'Manager note' },
        manager,
      ),
    ]);
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { fullName: 'Renamed Tenant' },
    });
    try {
      const row = (await send('GET', '/' + requestId)).json();
      expect(row.version).toBe(3);
      expect(row.events.map((event: { sequence: number }) => event.sequence)).toEqual([1, 2, 3]);
      expect(row.events[0].actorName).toBe('Case Tenant');
      expect(row.events.map((event: { message: string }) => event.message)).toContain(
        'Manager note',
      );
    } finally {
      await prisma.tenantProfile.update({
        where: { id: tenant.profileId },
        data: { fullName: 'Case Tenant' },
      });
    }
  });
  it('replays messages once and rejects spoofed actor fields or altered replay content', async () => {
    const body = { clientId: randomUUID(), message: 'One message' };
    expect((await send('POST', '/' + requestId + '/messages', body)).statusCode).toBe(201);
    expect((await send('POST', '/' + requestId + '/messages', body)).json().events).toHaveLength(2);
    expect(
      (await send('POST', '/' + requestId + '/messages', { ...body, message: 'Altered' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await send('POST', '/' + requestId + '/messages', { ...body, actorName: 'Forged' }))
        .statusCode,
    ).toBe(422);
    expect(
      (await send('PATCH', '/' + requestId + '/events/event-1', { message: 'Rewrite' })).statusCode,
    ).toBe(404);
    expect((await send('DELETE', '/' + requestId + '/events/event-1')).statusCode).toBe(404);
  });
  it('denies role escalation and requires explanations for consequential decisions', async () => {
    for (const status of ['APPROVED', 'RESOLVED', 'CLOSED'])
      expect(
        (
          await send('POST', '/' + requestId + '/respond', {
            clientId: randomUUID(),
            status,
            expectedVersion: 1,
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await send(
          'POST',
          '/' + requestId + '/respond',
          { clientId: randomUUID(), status: 'ACCEPTED', expectedVersion: 1 },
          manager,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await send(
          'POST',
          '/' + requestId + '/respond',
          { clientId: randomUUID(), status: 'REJECTED', expectedVersion: 1, message: '' },
          manager,
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await send(
          'POST',
          '/' + requestId + '/respond',
          { clientId: randomUUID(), status: 'CLOSED', expectedVersion: 1 },
          manager,
        )
      ).statusCode,
    ).toBe(409);
  });
  it('keeps unanswered resolutions unacknowledged and preserves resolvedAt through acceptance and closure', async () => {
    await decision('IN_PROGRESS');
    const resolved = await decision('RESOLVED');
    expect(
      (
        await send(
          'POST',
          '/' + requestId + '/respond',
          { clientId: randomUUID(), status: 'CLOSED', expectedVersion: resolved.version },
          manager,
        )
      ).statusCode,
    ).toBe(409);
    await send(
      'POST',
      '/' + requestId + '/messages',
      { clientId: randomUUID(), message: 'Await tenant response' },
      manager,
    );
    expect((await send('GET', '/' + requestId)).json().status).toBe('RESOLVED');
    expect((await decision('ACCEPTED', tenant, '')).resolvedAt).toBe(resolved.resolvedAt);
    expect((await decision('CLOSED', manager, '')).resolvedAt).toBe(resolved.resolvedAt);
    expect(
      (
        await send('POST', '/' + requestId + '/messages', {
          clientId: randomUUID(),
          message: 'Blocked until reopened',
        })
      ).statusCode,
    ).toBe(409);
    expect((await decision('REOPENED', tenant)).resolvedAt).toBe(resolved.resolvedAt);
  });
  it('serializes concurrent decisions and rejects stale versions', async () => {
    const body = { status: 'IN_PROGRESS', expectedVersion: 1, message: '' };
    const responses = await Promise.all([
      send('POST', '/' + requestId + '/respond', { ...body, clientId: randomUUID() }, manager),
      send('POST', '/' + requestId + '/respond', { ...body, clientId: randomUUID() }, manager),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const row = (await send('GET', '/' + requestId)).json();
    expect(row.version).toBe(2);
    expect(row.events).toHaveLength(2);
  });
  it('returns current history for identical decision replays after subsequent events', async () => {
    const body = { clientId: randomUUID(), status: 'IN_PROGRESS', expectedVersion: 1, message: '' };
    expect((await send('POST', '/' + requestId + '/respond', body, manager)).statusCode).toBe(200);
    await send('POST', '/' + requestId + '/messages', {
      clientId: randomUUID(),
      message: 'Later note',
    });
    expect((await send('POST', '/' + requestId + '/respond', body, manager)).json().version).toBe(
      3,
    );
    expect(
      (await send('POST', '/' + requestId + '/respond', { ...body, message: 'Altered' }, manager))
        .statusCode,
    ).toBe(409);
    expect(await prisma.requestEvent.count({ where: { requestId } })).toBe(3);
  });
  it('blocks unsupported financial case writes and preserves readable legacy history', async () => {
    for (const type of ['LATE_PAYMENT', 'ROOM_CHANGE', 'MOVE_OUT'])
      expect((await send('POST', '', { ...submission(), type })).statusCode).toBe(409);
    await prisma.request.update({
      where: { id: requestId },
      data: { type: 'LATE_PAYMENT', metadata: { category: 'Legacy', arbitrarySecret: 'Hidden' } },
    });
    await prisma.requestEvent.create({
      data: {
        requestId,
        actorUserId: 'historical-author',
        kind: 'LEGACY',
        message: 'Legacy event',
        createdAt: new Date('2020-01-01'),
      },
    });
    const row = (await send('GET', '/' + requestId)).json();
    expect(row.allowedActions).toEqual([]);
    expect(row.metadata).toEqual({ category: 'Legacy' });
    expect(row.events[0]).toMatchObject({
      actorUserId: 'historical-author',
      actorName: null,
      actorRole: null,
      sequence: null,
    });
    expect(
      (
        await send(
          'POST',
          '/' + requestId + '/respond',
          { clientId: randomUUID(), status: 'APPROVED', expectedVersion: row.version },
          manager,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await send('POST', '/' + requestId + '/messages', {
          clientId: randomUUID(),
          message: 'Permitted conversation',
        })
      ).statusCode,
    ).toBe(201);
    expect(await prisma.payment.count({ where: { contractId } })).toBe(0);
    expect(await prisma.depositEntry.count({ where: { contractId } })).toBe(0);
  });
  it('rejects invalid inputs, closed contracts, and revoked sessions', async () => {
    expect(
      (await send('POST', '', { ...submission(), metadata: { forged: true } })).statusCode,
    ).toBe(422);
    expect((await send('POST', '', { ...submission(), title: 'x' })).statusCode).toBe(422);
    await prisma.contract.update({ where: { id: contractId }, data: { status: 'CLOSED' } });
    try {
      expect((await send('POST', '', submission())).statusCode).toBe(409);
    } finally {
      await prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' } });
    }
    await prisma.authSession.update({ where: { id: tenant.sid }, data: { revokedAt: new Date() } });
    try {
      expect(
        (
          await send('POST', '/' + requestId + '/messages', {
            clientId: randomUUID(),
            message: 'Blocked',
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await prisma.authSession.update({ where: { id: tenant.sid }, data: { revokedAt: null } });
    }
  });
});
