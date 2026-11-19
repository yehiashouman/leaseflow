import { createHash, randomUUID } from 'node:crypto';
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
      clientId: randomUUID(),
      tenantId,
      rentalSpaceId: spaceId,
      startDate: '2026-11-01',
      monthlyRent: 3000,
      depositAmount: 2500,
    });
  }
  const evidenceVersion = (seriesId: string, version: number, expiresAt: Date) =>
    prisma.document.create({
      data: {
        seriesId,
        version,
        uploaderUserId: owner.id,
        clientId: randomUUID(),
        payloadHash: 'a'.repeat(64),
        title: 'Activation evidence ' + version,
        originalName: 'proof.pdf',
        mimeType: 'application/pdf',
        originalSize: 1,
        sourceHash: 'b'.repeat(64),
        quarantineKey: randomUUID(),
        expiresAt,
        status: 'CLEAN',
      },
    });
  it('returns bounded unit pages with stable ties and counts within the owner scope', async () => {
    const prefix = 'Paging ' + randomUUID();
    const createdAt = new Date('2026-11-01');
    const names = Array.from(
      { length: 21 },
      (_, index) => prefix + ' ' + String(index).padStart(2, '0'),
    );
    await prisma.unit.createMany({
      data: [
        ...names.map((name) => ({ name, area: 'Dubai', managerId: owner.profile, createdAt })),
        { name: prefix + ' foreign', area: 'Dubai', managerId: foreign.profile, createdAt },
      ],
    });
    const path = '/units?q=' + encodeURIComponent(prefix) + '&sort=NAME';
    const first = await send('GET', path + '&page=1');
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ total: 21, page: 1, pageSize: 20 });
    expect(first.json().items.map((row: { name: string }) => row.name)).toEqual(names.slice(0, 20));
    const second = await send('GET', path + '&page=2');
    expect(second.json().items.map((row: { name: string }) => row.name)).toEqual(names.slice(20));
    expect((await send('GET', path + '&page=10001')).statusCode).toBe(422);
    expect((await send('GET', path)).json()).toHaveLength(21);
    const tied = await send('GET', '/units?page=1&q=' + encodeURIComponent(prefix));
    const ids = await prisma.unit.findMany({
      where: { managerId: owner.profile, name: { startsWith: prefix } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(tied.json().items.map((row: { id: string }) => row.id)).toEqual(
      ids.slice(0, 20).map((row) => row.id),
    );
  });
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
    expect(
      (await send('POST', '/units', { ...body(), declarationVersion: 'unknown' })).statusCode,
    ).toBe(422);
    const declaration = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: unitId, action: 'CREATE' },
    });
    expect(declaration.newValue).toMatchObject({
      declaration: {
        version: 'unit-details-v1',
        sessionId: owner.sid,
        textHash: createHash('sha256')
          .update(
            'I confirm the property and authorization information is genuine and legally sufficient.',
          )
          .digest('hex'),
      },
    });
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
  it('blocks new contracts that rely on expired evidence and preserves existing access', async () => {
    const space = await room();
    await prisma.unit.update({ where: { id: unitId }, data: { active: true } });
    const series = await prisma.documentSeries.create({
      data: { unitId, ownerUserId: owner.id, purpose: 'PROPERTY_DOCUMENT' },
    });
    try {
      const expired = new Date('2020-01-01');
      await evidenceVersion(series.id, 1, expired);
      const refused = await proposal(space.id);
      expect(refused.statusCode, refused.body).toBe(409);
      expect(refused.json().message).toContain('expired');
      expect(await prisma.contract.count({ where: { rentalSpaceId: space.id } })).toBe(0);
      await evidenceVersion(series.id, 2, new Date('2099-01-01'));
      const accepted = await proposal(space.id);
      expect(accepted.statusCode, accepted.body).toBe(201);
      await evidenceVersion(series.id, 3, expired);
      expect((await send('GET', '/api/v1/contracts/' + accepted.json().id)).statusCode).toBe(200);
      expect((await send('GET', '/units/' + unitId)).statusCode).toBe(200);
    } finally {
      await prisma.document.deleteMany({ where: { seriesId: series.id } });
      await prisma.documentSeries.delete({ where: { id: series.id } });
    }
  });
  it('activates a declared unit once with current proof and the required written consent', async () => {
    const path = '/units/' + unitId;
    const proof = await prisma.documentSeries.create({
      data: { unitId, ownerUserId: owner.id, purpose: 'PROPERTY_DOCUMENT' },
    });
    const consent = await prisma.documentSeries.create({
      data: { unitId, ownerUserId: owner.id, purpose: 'CONSENT' },
    });
    const seriesIds = [proof.id, consent.id];
    try {
      const expired = await evidenceVersion(proof.id, 1, new Date('2020-01-01'));
      const current = await evidenceVersion(proof.id, 2, new Date('2099-01-01'));
      const written = await evidenceVersion(consent.id, 1, new Date('2099-01-01'));
      const declaration = {
        proofKind: 'TENANCY',
        proofId: expired.id,
        consentRequired: true,
        declarationAccepted: true,
      };
      expect((await send('GET', path + '/activation', undefined, foreign)).statusCode).toBe(404);
      const choices = await send('GET', path + '/activation');
      expect(
        choices
          .json()
          .documents.map((row: { id: string }) => row.id)
          .sort(),
      ).toEqual([current.id, written.id].sort());
      expect(choices.body).not.toMatch(/quarantineKey|originalName|sourceHash/);
      expect((await send('POST', path + '/activate', declaration)).statusCode).toBe(409);
      const activeProof = { ...declaration, proofId: current.id };
      expect((await send('POST', path + '/activate', activeProof)).statusCode).toBe(409);
      expect((await send('GET', path)).json().active).toBe(false);
      const complete = { ...activeProof, consentId: written.id };
      await prisma.unit.update({ where: { id: unitId }, data: { declarationAcceptedAt: null } });
      expect((await send('POST', path + '/activate', complete)).statusCode).toBe(409);
      await prisma.unit.update({
        where: { id: unitId },
        data: { declarationAcceptedAt: new Date() },
      });
      const results = await Promise.all([
        send('POST', path + '/activate', complete),
        send('POST', path + '/activate', complete),
      ]);
      for (const result of results) {
        expect(result.statusCode, result.body).toBe(200);
        expect(result.json().active).toBe(true);
      }
      const events = await prisma.auditEvent.findMany({
        where: { entityId: unitId, action: 'ACTIVATE' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.newValue).toMatchObject({
        proofId: current.id,
        consentId: written.id,
        declaration: {
          version: 'unit-activation-v1',
          sessionId: owner.sid,
          textHash: createHash('sha256')
            .update('I confirm this evidence is current and I am authorized to let this unit')
            .digest('hex'),
        },
      });
    } finally {
      await prisma.document.deleteMany({ where: { seriesId: { in: seriesIds } } });
      await prisma.documentSeries.deleteMany({ where: { id: { in: seriesIds } } });
    }
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
  it('rejects legacy disabled space types even when their unit and space flags are active', async () => {
    await prisma.unit.update({ where: { id: unitId }, data: { active: true } });
    for (const type of ['BED_SPACE', 'PARTITION'] as const) {
      const space = await prisma.rentalSpace.create({
        data: {
          unitId,
          name: 'Legacy disabled type',
          type,
          enabled: true,
          status: 'AVAILABLE',
          capacity: 2,
        },
      });
      expect((await proposal(space.id)).statusCode).toBe(404);
      expect(await prisma.contract.count({ where: { rentalSpaceId: space.id } })).toBe(0);
      expect(
        (
          await send('POST', '/units/' + unitId + '/spaces', {
            name: 'Future type',
            type,
            capacity: 1,
          })
        ).statusCode,
      ).toBe(422);
    }
  });
});
