import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';

type Actor = { id: string; role: Role; sid: string; profileId: string };
describe('MySQL maintenance responsibility and tenant cost response', () => {
  let app: FastifyInstance;
  let manager: Actor, tenant: Actor, roommate: Actor, foreign: Actor, admin: Actor;
  let unitId: string, roomId: string, contractId: string, requestId: string;
  const users: string[] = [];
  let ip = 160;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Maintenance requires a dedicated _test database');
    app = await buildApp();
    await app.ready();
    async function actor(role: Role, managerId?: string): Promise<Actor> {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@maintenance.invalid',
          passwordHash: 'not-a-login-hash',
          role,
          status: 'ACTIVE',
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Maintenance Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Maintenance Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { tenant: true, leasingManager: true },
      });
      users.push(user.id);
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      return {
        id: user.id,
        role,
        sid: session.id,
        profileId: user.tenant?.id ?? user.leasingManager?.id ?? user.id,
      };
    }
    manager = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.profileId);
    roommate = await actor('TENANT', manager.profileId);
    foreign = await actor('LEASING_MANAGER');
    admin = await actor('ADMIN');
    const unit = await prisma.unit.create({
      data: { managerId: manager.profileId, name: 'Maintenance Unit', area: 'Dubai' },
    });
    unitId = unit.id;
    const room = await prisma.rentalSpace.create({
      data: { unitId, name: 'Maintenance Room', type: 'ROOM' },
    });
    roomId = room.id;
    const contract = await prisma.contract.create({
      data: {
        tenantId: tenant.profileId,
        rentalSpaceId: roomId,
        status: 'ACTIVE',
        startDate: new Date(),
        monthlyRent: 3000,
        currency: 'USD',
      },
    });
    contractId = contract.id;
  });
  beforeEach(async () => {
    ip++;
    const row = await prisma.request.create({
      data: {
        contractId,
        type: 'MAINTENANCE',
        title: 'Repair responsibility',
        description: 'Private repair report',
        status: 'IN_PROGRESS',
        version: 1,
        events: {
          create: {
            kind: 'IN_PROGRESS',
            message: 'Repair underway',
            actorName: 'Original Manager',
            actorRole: 'LEASING_MANAGER',
            actorUserId: manager.id,
            sequence: 1,
          },
        },
      },
    });
    requestId = row.id;
  });
  afterAll(async () => {
    if (contractId) {
      await prisma.notification.deleteMany({ where: { event: { request: { contractId } } } });
      await prisma.maintenanceAssessment.deleteMany({ where: { request: { contractId } } });
      await prisma.requestEvent.deleteMany({ where: { request: { contractId } } });
      await prisma.request.deleteMany({ where: { contractId } });
      await prisma.contract.delete({ where: { id: contractId } });
      await prisma.rentalSpace.delete({ where: { id: roomId } });
      await prisma.unit.delete({ where: { id: unitId } });
      await prisma.tenantProfile.deleteMany({ where: { userId: { in: users } } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
      await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  function send(method: 'GET' | 'POST', suffix = '', payload?: object, actor = manager) {
    return app.inject({
      method,
      url: '/api/v1/requests/' + requestId + suffix,
      payload,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
        'x-forwarded-for': '198.51.100.' + ip,
      },
    });
  }
  const proposal = (expectedVersion = 1) => ({
    clientId: randomUUID(),
    expectedVersion,
    classification: 'TENANT_COST',
    proposedAmount: '45.5',
    explanation: 'Broken handle requires replacement',
    evidenceNotes: 'Inspection on 8 November found a snapped handle and no corrosion.',
  });
  async function create(body: object = proposal()) {
    const response = await send('POST', '/maintenance', body);
    expect(response.statusCode, response.body).toBe(201);
    return response.json();
  }
  const responseBody = (expectedVersion = 2, decision = 'DISPUTED') => ({
    clientId: randomUUID(),
    expectedVersion,
    decision,
    explanation: 'The handle was already damaged on arrival',
  });
  async function noMoney() {
    expect(await prisma.payment.count({ where: { contractId } })).toBe(0);
    expect(await prisma.depositEntry.count({ where: { contractId } })).toBe(0);
  }
  it('persists four classifications with manager responsibility and literal decimal proposals', async () => {
    for (const [index, classification] of [
      'MANAGER_COST',
      'TENANT_COST',
      'UNDER_REVIEW',
      'NO_COST',
    ].entries()) {
      const row = await create({
        ...proposal(index + 1),
        classification,
        proposedAmount: classification === 'TENANT_COST' ? '45.5' : null,
      });
      const item = row.maintenanceAssessments.at(-1);
      expect(item.classification).toBe(classification);
      expect(row.status).toBe('IN_PROGRESS');
      expect(item.proposedAmount).toBe(classification === 'TENANT_COST' ? '45.5' : null);
      expect(item.currency).toBe(classification === 'TENANT_COST' ? 'USD' : null);
      expect(row.events.at(-1).message).toContain('Leasing Manager responsibility');
    }
    await noMoney();
  });
  it('denies tenant, roommate, foreign-manager, and ordinary-administrator assessment writes', async () => {
    for (const actor of [tenant, roommate, foreign, admin])
      expect((await send('POST', '/maintenance', proposal(), actor)).statusCode).toBe(
        actor === foreign ? 404 : 403,
      );
    expect(await prisma.maintenanceAssessment.count({ where: { requestId } })).toBe(0);
  });
  it('rejects invalid amounts, missing evidence, and unauthorized assignment fields', async () => {
    for (const value of [
      '0',
      '-1',
      '1.234',
      '1e3',
      'not-a-number',
      'Infinity',
      '10000000000',
      45.5,
    ])
      expect(
        (await send('POST', '/maintenance', { ...proposal(), proposedAmount: value })).statusCode,
      ).toBe(422);
    for (const extra of [
      { evidenceNotes: '' },
      { classification: 'NO_COST' },
      { technicianId: 'outsider' },
      { ownerUserId: manager.id },
      { currency: 'AED' },
    ])
      expect((await send('POST', '/maintenance', { ...proposal(), ...extra })).statusCode).toBe(
        422,
      );
  });
  it('replays equivalent decimal input without duplicate rows, notices, or audit events', async () => {
    const body = proposal();
    const first = await create(body);
    const retry = await send('POST', '/maintenance', { ...body, proposedAmount: '45.50' });
    expect(retry.statusCode, retry.body).toBe(201);
    expect(retry.json().version).toBe(2);
    expect(retry.json().maintenanceAssessments).toHaveLength(1);
    expect(await prisma.notification.count({ where: { event: { requestId } } })).toBe(2);
    expect(
      await prisma.auditEvent.count({
        where: { entityId: requestId, action: 'MAINTENANCE_ASSESS' },
      }),
    ).toBe(1);
    expect(
      (await send('POST', '/maintenance', { ...body, evidenceNotes: 'Different evidence' }))
        .statusCode,
    ).toBe(409);
    expect(first.events.at(-1).actorName).toBe('Maintenance Manager');
  });
  it('preserves disputed proposals and supports a separate revised proposal and tenant acceptance', async () => {
    const first = await create();
    const old = first.maintenanceAssessments[0];
    expect(
      (await send('POST', '/maintenance/' + old.id + '/respond', responseBody(), tenant))
        .statusCode,
    ).toBe(200);
    const revised = await create({ ...proposal(3), proposedAmount: '20.25' });
    const latest = revised.maintenanceAssessments.at(-1);
    const accepted = await send(
      'POST',
      '/maintenance/' + latest.id + '/respond',
      responseBody(4, 'ACCEPTED'),
      tenant,
    );
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().maintenanceAssessments).toMatchObject([
      { decision: 'DISPUTED', proposedAmount: '45.5' },
      { decision: 'ACCEPTED', proposedAmount: '20.25' },
    ]);
    expect(accepted.json().canRespondMaintenance).toBe(false);
    await noMoney();
  });
  it('rejects foreign, stale, superseded, and manager responses to tenant proposals', async () => {
    const row = await create();
    const id = row.maintenanceAssessments[0].id;
    expect(
      (await send('POST', '/maintenance/' + id + '/respond', responseBody(), manager)).statusCode,
    ).toBe(403);
    expect(
      (await send('POST', '/maintenance/' + id + '/respond', responseBody(), roommate)).statusCode,
    ).toBe(404);
    expect(
      (await send('POST', '/maintenance/' + id + '/respond', responseBody(1), tenant)).statusCode,
    ).toBe(409);
    await create({ ...proposal(2), proposedAmount: '25.00' });
    expect(
      (await send('POST', '/maintenance/' + id + '/respond', responseBody(3), tenant)).statusCode,
    ).toBe(409);
  });
  it('replays tenant decisions without duplicate history and rejects changed explanations', async () => {
    const row = await create();
    const path = '/maintenance/' + row.maintenanceAssessments[0].id + '/respond';
    const body = responseBody();
    expect((await send('POST', path, body, tenant)).statusCode).toBe(200);
    const repeat = await send('POST', path, body, tenant);
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().version).toBe(3);
    expect(
      (await send('POST', path, { ...body, explanation: 'Different response' }, tenant)).statusCode,
    ).toBe(409);
    expect(await prisma.notification.count({ where: { event: { requestId } } })).toBe(4);
  });
  it('serializes competing assessments and tenant responses through the case version', async () => {
    const competing = await Promise.all([
      send('POST', '/maintenance', proposal()),
      send('POST', '/maintenance', proposal()),
    ]);
    expect(competing.map((item) => item.statusCode).sort()).toEqual([201, 409]);
    const id = competing.find((item) => item.statusCode === 201)!.json()
      .maintenanceAssessments[0].id;
    const responses = await Promise.all([
      send('POST', '/maintenance/' + id + '/respond', responseBody(2, 'ACCEPTED'), tenant),
      send('POST', '/maintenance/' + id + '/respond', responseBody(2, 'DISPUTED'), tenant),
    ]);
    expect(responses.map((item) => item.statusCode).sort()).toEqual([200, 409]);
    const events = await prisma.requestEvent.findMany({
      where: { requestId },
      orderBy: { sequence: 'asc' },
    });
    expect(events.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });
  it('does not equate repair acceptance with cost acceptance and allows a pending cost response after repair closure', async () => {
    const row = await create();
    const id = row.maintenanceAssessments[0].id;
    const transition = (status: string, expectedVersion: number) => ({
      status,
      expectedVersion,
      clientId: randomUUID(),
      message: 'Recorded repair completion',
    });
    expect((await send('POST', '/respond', transition('RESOLVED', 2))).statusCode).toBe(200);
    expect((await send('POST', '/respond', transition('ACCEPTED', 3), tenant)).statusCode).toBe(
      200,
    );
    expect(
      (await send('GET', '', undefined, tenant)).json().maintenanceAssessments[0].decision,
    ).toBeNull();
    expect((await send('POST', '/respond', transition('CLOSED', 4))).statusCode).toBe(200);
    expect(
      (await send('POST', '/maintenance/' + id + '/respond', responseBody(5, 'ACCEPTED'), tenant))
        .statusCode,
    ).toBe(200);
    await noMoney();
  });
  it('rejects silent replacement of accepted responsibility and preserves factual event text', async () => {
    const row = await create();
    const id = row.maintenanceAssessments[0].id;
    await send('POST', '/maintenance/' + id + '/respond', responseBody(2, 'ACCEPTED'), tenant);
    expect((await send('POST', '/maintenance', proposal(3))).statusCode).toBe(409);
    const data = (await send('GET', '', undefined, tenant)).json();
    expect(data.events[1].message).toContain('USD 45.50');
    expect(data.events[1].message).toContain(proposal().evidenceNotes);
    expect(data.events[2].kind).toBe('MAINTENANCE_ACCEPTED');
    expect(data.canAssessMaintenance).toBe(false);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: requestId, action: 'MAINTENANCE_ASSESS' },
    });
    expect(JSON.stringify(audit.newValue)).not.toContain('snapped handle');
  });
  it('rejects private drafts, closed assessment changes, and non-maintenance workflows', async () => {
    for (const status of ['DRAFT', 'CLOSED', 'REJECTED'] as const) {
      await prisma.request.update({ where: { id: requestId }, data: { status } });
      expect((await send('POST', '/maintenance', proposal())).statusCode).toBe(
        status === 'DRAFT' ? 404 : 409,
      );
    }
    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'IN_PROGRESS', type: 'GENERAL' },
    });
    expect((await send('POST', '/maintenance', proposal())).statusCode).toBe(409);
  });
  it('denies stale sessions and inconsistent tenant/property ownership', async () => {
    await prisma.authSession.update({
      where: { id: manager.sid },
      data: { revokedAt: new Date() },
    });
    try {
      expect((await send('POST', '/maintenance', proposal())).statusCode).toBe(401);
    } finally {
      await prisma.authSession.update({ where: { id: manager.sid }, data: { revokedAt: null } });
    }
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { managerId: foreign.profileId },
    });
    try {
      expect((await send('POST', '/maintenance', proposal())).statusCode).toBe(404);
    } finally {
      await prisma.tenantProfile.update({
        where: { id: tenant.profileId },
        data: { managerId: manager.profileId },
      });
    }
  });
});
