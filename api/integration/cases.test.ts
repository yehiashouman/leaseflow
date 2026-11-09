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
  it('stores a manager deadline, immutable reason, notices, and exact retry result', async () => {
    const row = await send('GET', '/' + requestId);
    const body = {
      clientId: randomUUID(),
      expectedVersion: row.json().version,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'Confirm access tomorrow',
    };
    const first = await send('POST', '/' + requestId + '/deadline', body, manager);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().decisionDueAt).toBe(body.dueAt);
    const retry = await send('POST', '/' + requestId + '/deadline', body, manager);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().version).toBe(first.json().version);
    const events = retry
      .json()
      .events.filter((event: { kind: string }) => event.kind === 'DEADLINE_CHANGED');
    expect(events).toHaveLength(1);
    expect(events[0].message).toContain(body.reason);
    expect(await prisma.notification.count({ where: { eventId: events[0].id } })).toBe(2);
    expect(
      (
        await send(
          'POST',
          '/' + requestId + '/deadline',
          { ...body, reason: 'Changed content' },
          manager,
        )
      ).statusCode,
    ).toBe(409);
  });
  it('rejects tenant, administrator, roommate, and unrelated-manager deadline writes', async () => {
    const body = {
      clientId: randomUUID(),
      expectedVersion: 1,
      dueAt: null,
      reason: 'Remove deadline',
    };
    for (const actor of [tenant, roommate, admin])
      expect((await send('POST', '/' + requestId + '/deadline', body, actor)).statusCode).toBe(403);
    expect((await send('POST', '/' + requestId + '/deadline', body, outsider)).statusCode).toBe(
      404,
    );
  });
  it('rejects stale, past-date, and terminal-case deadline writes without extra events', async () => {
    const path = '/' + requestId + '/deadline';
    const body = {
      clientId: randomUUID(),
      expectedVersion: 0,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'Future response',
    };
    expect((await send('POST', path, body, manager)).statusCode).toBe(409);
    expect(
      (
        await send(
          'POST',
          path,
          { ...body, expectedVersion: 1, dueAt: '2020-01-01T00:00:00.000Z' },
          manager,
        )
      ).statusCode,
    ).toBe(422);
    await prisma.request.update({ where: { id: requestId }, data: { status: 'CLOSED' } });
    expect((await send('POST', path, { ...body, expectedVersion: 1 }, manager)).statusCode).toBe(
      409,
    );
    expect(
      await prisma.requestEvent.count({ where: { requestId, kind: 'DEADLINE_CHANGED' } }),
    ).toBe(0);
  });
  it('serializes competing deadline changes and preserves the previous deadline in history', async () => {
    const body = {
      clientId: randomUUID(),
      expectedVersion: 1,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'First response',
    };
    const results = await Promise.all([
      send('POST', '/' + requestId + '/deadline', body, manager),
      send(
        'POST',
        '/' + requestId + '/deadline',
        { ...body, clientId: randomUUID(), dueAt: new Date(Date.now() + 172800000).toISOString() },
        manager,
      ),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const latest = results.find((r) => r.statusCode === 200)!.json();
    const removed = await send(
      'POST',
      '/' + requestId + '/deadline',
      {
        clientId: randomUUID(),
        expectedVersion: latest.version,
        dueAt: null,
        reason: 'Response received',
      },
      manager,
    );
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json().decisionDueAt).toBeNull();
    expect(removed.json().events.at(-1).message).toContain(latest.decisionDueAt);
  });
  it('separates manager currency totals and uses outstanding balances rather than original amounts', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const created = await prisma.payment.createMany({
      data: [
        {
          contractId,
          periodStart: start,
          dueDate: start,
          amountDue: '3000.00',
          amountPaid: '1000.00',
          currency: 'AED',
          status: 'LATE',
        },
        {
          contractId,
          periodStart: new Date('2026-02-01'),
          dueDate: start,
          amountDue: '80.00',
          amountPaid: '30.00',
          currency: 'USD',
          status: 'PARTIALLY_PAID',
        },
      ],
    });
    expect(created.count).toBe(2);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/manager',
        headers: {
          authorization:
            'Bearer ' + app.jwt.sign({ sub: manager.id, role: manager.role, sid: manager.sid }),
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json().financialRecords).toEqual([
        {
          currency: 'AED',
          outstanding: '2000.00',
          overdue: '2000.00',
          received: '1000.00',
          expenses: '0.00',
        },
        {
          currency: 'USD',
          outstanding: '50.00',
          overdue: '0.00',
          received: '30.00',
          expenses: '0.00',
        },
      ]);
      expect(response.json().depositLiability).toBeNull();
    } finally {
      await prisma.payment.deleteMany({ where: { contractId } });
    }
  });
  it('excludes inactive units from operational space totals', async () => {
    const contract = await prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: { rentalSpace: true },
    });
    const path = '/api/v1/dashboard/manager';
    const before = (await send('GET', path, undefined, manager)).json();
    await prisma.unit.update({
      where: { id: contract.rentalSpace.unitId },
      data: { active: false },
    });
    try {
      const inactive = (await send('GET', path, undefined, manager)).json();
      expect(inactive.units).toBe(before.units);
      expect(inactive.spaces).toBe(0);
      expect(inactive.vacant).toBe(0);
      expect(inactive.occupied).toBe(0);
    } finally {
      await prisma.unit.update({
        where: { id: contract.rentalSpace.unitId },
        data: { active: true },
      });
    }
  });
  it('shows own unresolved replies and acknowledgements across historical contracts without roommate cases', async () => {
    await prisma.request.update({ where: { id: requestId }, data: { status: 'RESOLVED' } });
    await prisma.contract.update({ where: { id: contractId }, data: { status: 'CLOSED' } });
    await prisma.requestEvent.create({
      data: {
        requestId,
        kind: 'MESSAGE',
        actorUserId: manager.id,
        actorName: 'Case Manager',
        actorRole: 'LEASING_MANAGER',
        message: 'Repair is complete.',
      },
    });
    try {
      const result = await send('GET', '/api/v1/dashboard/tenant');
      expect(result.statusCode, result.body).toBe(200);
      const request = result
        .json()
        .unresolvedRequests.find((item: { id: string }) => item.id === requestId);
      expect(request.status).toBe('RESOLVED');
      expect(request.events[0].message).toBe('Repair is complete.');
      expect(result.json().pendingAcknowledgements).toBeGreaterThanOrEqual(1);
      const other = await send('GET', '/api/v1/dashboard/tenant', undefined, roommate);
      expect(other.json().unresolvedRequests).toEqual([]);
      expect(other.json().pendingAcknowledgements).toBe(0);
      expect(result.body).not.toMatch(/clientId|emiratesIdNumber|passwordHash/);
    } finally {
      await prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' } });
    }
  });
  it('keeps manager deadlines private and tenant dashboard output free from raw identity and private keys', async () => {
    await prisma.request.update({
      where: { id: requestId },
      data: { decisionDueAt: new Date(Date.now() + 86400000) },
    });
    const dashboard = async (actor: Actor) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/' + (actor.role === 'TENANT' ? 'tenant' : 'manager'),
        headers: {
          authorization:
            'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
        },
      });
    const owned = await dashboard(manager),
      foreign = await dashboard(outsider),
      own = await dashboard(tenant);
    expect(owned.json().deadlineSummary.approaching).toBeGreaterThanOrEqual(1);
    expect(foreign.json().deadlineSummary).toEqual({ overdue: 0, approaching: 0 });
    expect(owned.json().deadlines.some((item: { id: string }) => item.id === requestId)).toBe(true);
    expect(foreign.json().deadlines).toEqual([]);
    expect(own.json().contracts.every((item: { id: string }) => item.id === contractId)).toBe(true);
    expect(own.body).not.toMatch(
      /evidenceKey|secondaryOccupant|emiratesIdNumber|ownerMonthlyRent|passwordHash/,
    );
    expect(own.headers['cache-control']).toBe('no-store');
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
      await prisma.notification.deleteMany({
        where: { event: { request: { contractId: { in: ids } } } },
      });
      await prisma.requestEvent.deleteMany({ where: { request: { contractId: { in: ids } } } });
      await prisma.request.deleteMany({ where: { contractId: { in: ids } } });
      await prisma.payment.deleteMany({ where: { contractId: { in: ids } } });
      await prisma.depositEntry.deleteMany({ where: { contractId: { in: ids } } });
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
    const count = (await send('GET', '/api/v1/dashboard/manager', undefined, manager)).json()
      .openRequests;
    await prisma.request.update({ where: { id: requestId }, data: { status: 'DRAFT' } });
    try {
      expect(
        (await send('GET', '/api/v1/dashboard/manager', undefined, manager)).json().openRequests,
      ).toBe(count - 1);
      expect((await send('GET', '/' + requestId, undefined, manager)).statusCode).toBe(404);
    } finally {
      await prisma.request.update({ where: { id: requestId }, data: { status: 'SUBMITTED' } });
    }
  });
  it('serves scoped stored contract terms without private unit costs or occupant JSON', async () => {
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        secondaryOccupant: { fullName: 'Private companion', identityKey: 'private-identity-key' },
      },
    });
    for (const actor of [tenant, manager]) {
      const response = await send('GET', '/api/v1/contracts/' + contractId, undefined, actor);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toMatchObject({
        id: contractId,
        endDate: null,
        monthlyRent: '3000',
        depositAmount: '2000',
        noticeDays: 30,
        tenant: { id: tenant.profileId },
        rentalSpace: { unit: { name: 'Case Unit' } },
      });
      for (const field of [
        'ownerMonthlyRent',
        'passwordHash',
        'secondaryOccupant',
        'identityKey',
        'managerId',
      ])
        expect(response.body).not.toContain(field);
    }
  });
  it('denies foreign contract detail and record access, including ordinary administrators', async () => {
    for (const actor of [roommate, outsider, admin]) {
      for (const suffix of [
        '',
        '/records?section=payments',
        '/records?section=deposits',
        '/records?section=requests',
      ]) {
        const response = await send(
          'GET',
          '/api/v1/contracts/' + contractId + suffix,
          undefined,
          actor,
        );
        expect(response.statusCode).toBe(actor === admin ? 403 : 404);
        expect(response.body).not.toContain('Case Tenant');
      }
    }
    expect((await send('GET', '/api/v1/contracts/missing')).statusCode).toBe(404);
  });
  it('keeps tenant drafts private in contract case records and totals', async () => {
    const created = await send('POST', '', {
      ...submission(),
      draft: true,
      title: 'Hidden contract draft',
    });
    expect(created.statusCode, created.body).toBe(201);
    const path = '/api/v1/contracts/' + contractId + '/records?section=requests';
    const own = await send('GET', path);
    const managed = await send('GET', path, undefined, manager);
    expect(own.body).toContain('Hidden contract draft');
    expect(managed.body).not.toContain('Hidden contract draft');
    expect(own.json().total).toBe(managed.json().total + 1);
    expect(managed.body).not.toContain('Private complaint text');
    expect(managed.body).not.toContain('clientId');
  });
  it('pages contract payments without evidence keys and preserves stored decimal values', async () => {
    await prisma.payment.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        contractId,
        periodStart: new Date(Date.UTC(2024, index, 1)),
        dueDate: new Date(Date.UTC(2024, index, 1)),
        amountDue: '3000.15',
        amountPaid: '1000.05',
        currency: 'USD',
        evidenceKey: 'private-payment-key',
      })),
    });
    try {
      const path = '/api/v1/contracts/' + contractId + '/records?section=payments';
      const first = await send('GET', path);
      const second = await send('GET', path + '&page=2');
      expect(first.json()).toMatchObject({ total: 21, page: 1, pageSize: 20 });
      expect(first.json().items).toHaveLength(20);
      expect(second.json().items).toHaveLength(1);
      expect(first.json().items[0]).toMatchObject({
        amountDue: '3000.15',
        amountPaid: '1000.05',
        currency: 'USD',
      });
      expect(
        new Set([...first.json().items, ...second.json().items].map((item) => item.id)).size,
      ).toBe(21);
      expect(first.body).not.toContain('evidenceKey');
      expect(first.headers['cache-control']).toBe('no-store');
    } finally {
      await prisma.payment.deleteMany({ where: { contractId } });
    }
  });
  it('returns deposit facts without evidence storage paths or financial mutations', async () => {
    const entry = await prisma.depositEntry.create({
      data: {
        contractId,
        type: 'DEDUCTION_PROPOSED',
        amount: '45.25',
        description: 'Disputed deduction',
        tenantDisputedAt: new Date(),
        evidenceKey: 'private-deposit-key',
      },
    });
    try {
      for (const actor of [tenant, manager]) {
        const response = await send(
          'GET',
          '/api/v1/contracts/' + contractId + '/records?section=deposits',
          undefined,
          actor,
        );
        expect(response.json().items[0]).toMatchObject({
          id: entry.id,
          amount: '45.25',
          description: 'Disputed deduction',
        });
        expect(response.json().items[0].tenantDisputedAt).toBeTruthy();
        expect(response.body).not.toContain('evidenceKey');
      }
      expect(await prisma.depositEntry.count({ where: { contractId } })).toBe(1);
    } finally {
      await prisma.depositEntry.delete({ where: { id: entry.id } });
    }
  });
  it('rejects invalid contract record queries and inconsistent ownership after reassignment', async () => {
    const path = '/api/v1/contracts/' + contractId;
    for (const query of [
      'section=unknown',
      'section=payments&page=0',
      'section=requests&page=1.5',
      'section=payments&extra=1',
    ])
      expect((await send('GET', path + '/records?' + query)).statusCode).toBe(422);
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { managerId: outsider.profileId },
    });
    try {
      for (const actor of [tenant, manager, outsider]) {
        expect((await send('GET', path, undefined, actor)).statusCode).toBe(404);
        expect(
          (await send('GET', path + '/records?section=payments', undefined, actor)).statusCode,
        ).toBe(404);
      }
    } finally {
      await prisma.tenantProfile.update({
        where: { id: tenant.profileId },
        data: { managerId: manager.profileId },
      });
    }
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
  it('keeps drafts private and submits them once with complete immutable history', async () => {
    const body = { ...submission(), draft: true };
    const draft = await send('POST', '', body);
    expect(draft.statusCode).toBe(201);
    const id = draft.json().id;
    expect(draft.json()).toMatchObject({
      status: 'DRAFT',
      canMessage: false,
      allowedActions: [{ status: 'SUBMITTED' }],
    });
    expect((await send('GET', '/' + id, undefined, manager)).statusCode).toBe(404);
    expect(
      (await send('GET', '', undefined, manager))
        .json()
        .some((item: { id: string }) => item.id === id),
    ).toBe(false);
    expect(
      (
        await send('POST', '/' + id + '/messages', {
          clientId: randomUUID(),
          message: 'Not submitted',
        })
      ).statusCode,
    ).toBe(409);
    const command = { clientId: randomUUID(), status: 'SUBMITTED', expectedVersion: 1 };
    expect((await send('POST', '/' + id + '/respond', command)).statusCode).toBe(200);
    expect((await send('POST', '/' + id + '/respond', command)).json().events).toHaveLength(2);
    expect((await send('POST', '', body)).json().id).toBe(id);
    expect((await send('POST', '', { ...body, draft: false })).statusCode).toBe(409);
    const shared = (await send('GET', '/' + id, undefined, manager)).json();
    expect(shared.events.map((event: { kind: string }) => event.kind)).toEqual([
      'DRAFT_CREATED',
      'SUBMITTED',
    ]);
    expect(shared.version).toBe(2);
  });
  it('preserves seen, tenant-question, and manager-response states with valid role actions', async () => {
    await decision('SEEN');
    await decision('AWAITING_TENANT', manager, 'Please describe the leak');
    const response = await decision('AWAITING_MANAGER', tenant, 'The tap drips continuously');
    expect(response.events.map((event: { kind: string }) => event.kind)).toEqual([
      'SUBMITTED',
      'SEEN',
      'AWAITING_TENANT',
      'AWAITING_MANAGER',
    ]);
    expect(response.events[3].actorUserId).toBe(tenant.id);
    expect((await decision('IN_PROGRESS')).status).toBe('IN_PROGRESS');
  });
  it('rejects draft submission after contract closure without a shared event', async () => {
    const draft = (await send('POST', '', { ...submission(), draft: true })).json();
    await prisma.contract.update({ where: { id: contractId }, data: { status: 'CLOSED' } });
    try {
      expect(
        (
          await send('POST', '/' + draft.id + '/respond', {
            clientId: randomUUID(),
            status: 'SUBMITTED',
            expectedVersion: 1,
          })
        ).statusCode,
      ).toBe(409);
      expect((await send('GET', '/' + draft.id)).json().events).toHaveLength(1);
      expect((await send('GET', '/' + draft.id, undefined, manager)).statusCode).toBe(404);
    } finally {
      await prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' } });
    }
  });
  it('serves a filtered administrator queue without secret or full identity fields', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
    await prisma.leasingManagerProfile.update({
      where: { id: manager.profileId },
      data: { emiratesIdNumber: '784-2000-1234567-8', licenseNumber: 'LIC-12345678' },
    });
    const queue = await send(
      'GET',
      '/api/v1/admin/managers?status=ACTIVE&q=' + encodeURIComponent(user.email),
      undefined,
      admin,
    );
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(queue.json().items[0].id).toBe(manager.id);
    for (const field of ['passwordHash', 'emiratesIdNumber', 'licenseNumber'])
      expect(queue.body).not.toContain(field);
    const detail = await send('GET', '/api/v1/admin/managers/' + manager.id, undefined, admin);
    expect(detail.json()).toMatchObject({
      moderationAvailable: false,
      documentsAvailable: false,
      leasingManager: { emiratesIdNumber: '****67-8', licenseNumber: '****5678' },
    });
    expect(detail.body).not.toContain('784-2000-1234567-8');
    expect(detail.body).not.toContain('passwordHash');
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(
      (await send('GET', '/api/v1/admin/managers/' + tenant.id, undefined, admin)).statusCode,
    ).toBe(404);
    expect((await send('GET', '/api/v1/admin/managers?page=0', undefined, admin)).statusCode).toBe(
      422,
    );
  });
  it('denies administrator account and audit screens to tenant and manager roles', async () => {
    for (const actor of [tenant, manager])
      for (const path of [
        '/api/v1/admin/managers',
        '/api/v1/admin/managers/' + manager.id,
        '/api/v1/admin/audit',
      ])
        expect((await send('GET', path, undefined, actor)).statusCode).toBe(403);
    expect(
      (
        await send(
          'PATCH',
          '/api/v1/admin/managers/' + manager.id + '/status',
          { status: 'ACTIVE', reason: 'Unapproved policy' },
          admin,
        )
      ).statusCode,
    ).toBe(409);
  });
  it('returns audit identifiers without arbitrary old/new complaint payloads', async () => {
    await prisma.auditEvent.create({
      data: {
        actorUserId: manager.id,
        action: 'SENSITIVE_LEGACY',
        entityType: 'CaseBatch',
        entityId: requestId,
        newValue: { password: 'secret', complaint: 'Private legacy complaint' },
      },
    });
    const audit = await send(
      'GET',
      '/api/v1/admin/audit?entityType=CaseBatch&action=SENSITIVE_LEGACY',
      undefined,
      admin,
    );
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBeGreaterThan(0);
    expect(audit.body).not.toContain('Private legacy complaint');
    expect(audit.body).not.toContain('newValue');
    expect(audit.json().items[0].actorUserId).toBe(manager.id);
  });
  it('rejects role injection and public tenant registration without new users', async () => {
    const email = randomUUID() + '@role-injection.invalid';
    for (const role of ['ADMIN', 'TENANT']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/manager',
        headers: { 'x-forwarded-for': '198.51.100.' + clientIp },
        payload: { email, password: 'NeverPersistThis123!', fullName: 'Injected Role', role },
      });
      expect(response.statusCode).toBe(422);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register/tenant',
          payload: { email },
        })
      ).statusCode,
    ).toBe(404);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    const forged = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/managers',
      headers: {
        authorization: 'Bearer ' + app.jwt.sign({ sub: tenant.id, role: 'ADMIN', sid: tenant.sid }),
      },
    });
    expect(forged.statusCode).toBe(401);
  });
  const profileBody = (expectedVersion: number) => ({
    expectedVersion,
    fullName: 'Profile Tenant',
    dateOfBirth: '1990-01-02',
    nationality: 'Egyptian',
    gender: null,
    pendingPhone: '+971500000099',
    preferredLanguage: 'ar',
    timezone: 'Asia/Dubai',
    deliveryPreference: 'EMAIL',
    matchingPreferences: {
      gender: null,
      nationality: null,
      language: 'Arabic',
      culture: null,
      lifestyle: 'Quiet',
      sleepSchedule: 'Early',
      smoking: 'NON_SMOKING',
      noise: 'Low',
      sharedLanguage: null,
    },
  });
  it('persists own language and channel preferences for managers, tenants, and administrators', async () => {
    for (const actor of [manager, tenant, admin]) {
      const headers = {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
      };
      const before = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      try {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/v1/profile/preferences',
          headers,
          payload: {
            expectedVersion: before.profileVersion,
            preferredLanguage: 'ar',
            timezone: 'Asia/Dubai',
            deliveryPreference: 'WHATSAPP',
          },
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json()).toMatchObject({
          preferredLanguage: 'ar',
          deliveryPreference: 'WHATSAPP',
          profileVersion: before.profileVersion + 1,
        });
        expect(response.json().securityNotice).toContain('account email');
        const persisted = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
        expect(persisted.notifyEmail).toBe(false);
        expect(persisted.notifyWhatsapp).toBe(true);
        expect(persisted.email).toBe(before.email);
        expect(persisted.emailVerifiedAt).toEqual(before.emailVerifiedAt);
        const own = await app.inject({
          method: 'GET',
          url: '/api/v1/profile/preferences',
          headers,
        });
        expect(own.headers['cache-control']).toBe('no-store');
        expect(own.body).not.toMatch(/passwordHash|emiratesId|phone|tenantId|managerId/);
      } finally {
        await prisma.user.update({
          where: { id: actor.id },
          data: {
            preferredLanguage: before.preferredLanguage,
            timezone: before.timezone,
            notifyEmail: before.notifyEmail,
            notifyWhatsapp: before.notifyWhatsapp,
          },
        });
      }
    }
  });
  it('rejects preference ownership injection, invalid calendar settings, and stale profile versions', async () => {
    const headers = {
      authorization:
        'Bearer ' + app.jwt.sign({ sub: manager.id, role: manager.role, sid: manager.sid }),
    };
    const current = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
    const body = {
      expectedVersion: current.profileVersion,
      preferredLanguage: 'en',
      timezone: 'Asia/Dubai',
      deliveryPreference: 'BOTH',
    };
    for (const extra of [
      { userId: tenant.id },
      { timezone: 'No/Such' },
      { preferredLanguage: 'not_a_language' },
      { notifyEmail: false },
      { email: 'replace@example.invalid' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/v1/profile/preferences',
            headers,
            payload: { ...body, ...extra },
          })
        ).statusCode,
      ).toBe(422);
    }
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/profile/preferences',
          headers,
          payload: { ...body, expectedVersion: current.profileVersion + 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: manager.id } })).profileVersion,
    ).toBe(current.profileVersion);
  });
  it('persists optional tenant profile and delivery preferences without changing verified identity or historical authors', async () => {
    const current = (await send('GET', '/api/v1/profile')).json();
    const updated = await send('PATCH', '/api/v1/profile', profileBody(current.profileVersion));
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({
      profileVersion: current.profileVersion + 1,
      preferredLanguage: 'ar',
      timezone: 'Asia/Dubai',
      deliveryPreference: 'EMAIL',
      securityEmail: current.email,
      phone: current.phone,
      phoneVerifiedAt: current.phoneVerifiedAt,
      tenant: {
        fullName: 'Profile Tenant',
        pendingPhone: '+971500000099',
        matchingPreferences: { sleepSchedule: 'Early', smoking: 'NON_SMOKING' },
      },
    });
    expect((await send('GET', '/' + requestId)).json().events[0].actorName).toBe('Case Tenant');
    expect(
      (await send('PATCH', '/api/v1/profile', profileBody(current.profileVersion))).statusCode,
    ).toBe(409);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: tenant.id, action: 'PROFILE_UPDATE' },
    });
    expect(JSON.stringify(audit.newValue)).not.toContain('+971500000099');
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { fullName: 'Case Tenant' },
    });
  });
  it('rejects profile ownership/verification injection and invalid preferences or dates', async () => {
    const version = (await send('GET', '/api/v1/profile')).json().profileVersion;
    for (const extra of [
      { role: 'ADMIN' },
      { managerId: outsider.profileId },
      { phoneVerifiedAt: new Date().toISOString() },
      { timezone: 'Not/AZone' },
      { dateOfBirth: '2999-01-01' },
      { dateOfBirth: '2026-02-30' },
      { pendingPhone: '123' },
      { deliveryPreference: 'NONE' },
      { matchingPreferences: { ...profileBody(version).matchingPreferences, required: true } },
    ])
      expect(
        (await send('PATCH', '/api/v1/profile', { ...profileBody(version), ...extra })).statusCode,
      ).toBe(422);
    expect((await send('GET', '/api/v1/profile', undefined, manager)).statusCode).toBe(403);
    expect((await send('GET', '/api/v1/profile', undefined, admin)).statusCode).toBe(403);
  });
  it('serializes profile edits and allows empty, non-binding compatibility preferences', async () => {
    const version = (await send('GET', '/api/v1/profile')).json().profileVersion;
    const body = {
      ...profileBody(version),
      nationality: null,
      gender: null,
      pendingPhone: null,
      dateOfBirth: null,
      matchingPreferences: {
        gender: null,
        nationality: null,
        language: null,
        culture: null,
        lifestyle: null,
        sleepSchedule: null,
        noise: null,
        sharedLanguage: null,
        smoking: 'NO_PREFERENCE',
      },
    };
    const results = await Promise.all([
      send('PATCH', '/api/v1/profile', body),
      send('PATCH', '/api/v1/profile', body),
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await send('GET', '/api/v1/profile')).json().tenant.matchingPreferences).toMatchObject({
      nationality: null,
      gender: null,
      smoking: 'NO_PREFERENCE',
    });
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe(
      'ACTIVE',
    );
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { fullName: 'Case Tenant' },
    });
  });
  it('limits the tenant directory and contract summaries to the current manager', async () => {
    const list = await send('GET', '/api/v1/tenants?q=Case%20Tenant', undefined, manager);
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((item: { id: string }) => item.id === tenant.profileId)).toBe(
      true,
    );
    expect(list.body).not.toContain('passwordHash');
    expect(list.body).not.toContain('pendingPhone');
    const detail = await send('GET', '/api/v1/tenants/' + tenant.profileId, undefined, manager);
    expect(detail.json().contracts.some((item: { id: string }) => item.id === contractId)).toBe(
      true,
    );
    expect(
      (await send('GET', '/api/v1/tenants/' + tenant.profileId, undefined, outsider)).statusCode,
    ).toBe(404);
    expect((await send('GET', '/api/v1/tenants')).statusCode).toBe(403);
    expect((await send('GET', '/api/v1/tenants', undefined, admin)).statusCode).toBe(403);
  });
  it('persists notices for both participants once and preserves read timestamps across retries', async () => {
    const notices = await prisma.notification.findMany({ where: { event: { requestId } } });
    expect(notices.map((item) => item.recipientUserId).sort()).toEqual(
      [tenant.id, manager.id].sort(),
    );
    const own = notices.find((item) => item.recipientUserId === tenant.id)!;
    expect((await send('GET', '/api/v1/notifications')).body).not.toContain(
      'Private complaint text',
    );
    expect((await send('POST', '/api/v1/notifications/' + own.id + '/read')).json().updated).toBe(
      1,
    );
    const first = (await prisma.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt;
    expect((await send('POST', '/api/v1/notifications/' + own.id + '/read')).json().updated).toBe(
      0,
    );
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt).toEqual(
      first,
    );
    expect(
      (await send('POST', '/api/v1/notifications/' + own.id + '/read', undefined, manager))
        .statusCode,
    ).toBe(404);
    expect((await send('GET', '/api/v1/notifications', undefined, admin)).statusCode).toBe(403);
    const body = { clientId: randomUUID(), message: 'Notice once' };
    await send('POST', '/' + requestId + '/messages', body);
    await send('POST', '/' + requestId + '/messages', body);
    expect(await prisma.notification.count({ where: { event: { requestId } } })).toBe(4);
    await send('POST', '/api/v1/notifications/read-all');
    expect((await send('GET', '/api/v1/notifications/count')).json().unread).toBe(0);
    expect(
      await prisma.notification.count({ where: { recipientUserId: manager.id, readAt: null } }),
    ).toBeGreaterThan(0);
  });
  it('excludes private drafts and hides notices after inconsistent relationship changes', async () => {
    const draft = (await send('POST', '', { ...submission(), draft: true })).json();
    expect(await prisma.notification.count({ where: { event: { requestId: draft.id } } })).toBe(0);
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { managerId: outsider.profileId },
    });
    try {
      const notices = (await send('GET', '/api/v1/notifications')).json().items;
      expect(
        notices.some(
          (item: { event: { request: { id: string } } }) => item.event.request.id === requestId,
        ),
      ).toBe(false);
      expect((await send('GET', '/api/v1/notifications/count')).json().unread).toBe(0);
    } finally {
      await prisma.tenantProfile.update({
        where: { id: tenant.profileId },
        data: { managerId: manager.profileId },
      });
    }
  });
});
