import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { env } from '../src/config.js';
type Actor = { id: string; role: Role; sid: string; managerId?: string };
describe('MySQL expense records, recoveries, and immutable void history', () => {
  let app: FastifyInstance,
    manager: Actor,
    foreign: Actor,
    tenant: Actor,
    admin: Actor,
    unitId: string,
    foreignUnitId: string,
    landlordId: string,
    spaceId: string,
    contractId: string;
  const actors: Actor[] = [];
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Expense verification requires a _test database');
    app = await buildApp();
    await app.ready();
    async function actor(role: Role, managerId?: string) {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@expense.invalid',
          passwordHash: 'not-for-login',
          role,
          status: 'ACTIVE',
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Expense Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Expense Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { leasingManager: true },
      });
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      const value = { id: user.id, role, sid: session.id, managerId: user.leasingManager?.id };
      actors.push(value);
      return value;
    }
    manager = await actor('LEASING_MANAGER');
    foreign = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.managerId);
    admin = await actor('ADMIN');
    const landlord = await prisma.landlord.create({
      data: { managerId: manager.managerId!, name: 'Expense Owner' },
    });
    landlordId = landlord.id;
    const unit = await prisma.unit.create({
      data: { managerId: manager.managerId!, landlordId, name: 'Expense Unit', area: 'Dubai' },
    });
    unitId = unit.id;
    foreignUnitId = (
      await prisma.unit.create({
        data: { managerId: foreign.managerId!, name: 'Private Unit', area: 'Dubai' },
      })
    ).id;
    spaceId = (
      await prisma.rentalSpace.create({ data: { unitId, name: 'Expense Room', type: 'ROOM' } })
    ).id;
    const profile = await prisma.tenantProfile.findUniqueOrThrow({ where: { userId: tenant.id } });
    contractId = (
      await prisma.contract.create({
        data: {
          tenantId: profile.id,
          rentalSpaceId: spaceId,
          monthlyRent: 3000,
          startDate: new Date('2026-01-01'),
          status: 'ACTIVE',
        },
      })
    ).id;
  });
  afterAll(async () => {
    const ids = actors.map((a) => a.id),
      managers = actors.flatMap((a) => (a.managerId ? [a.managerId] : []));
    const where = { managerId: { in: managers } };
    await prisma.expenseRecovery.deleteMany({ where: { expense: where } });
    await prisma.expenseVoid.deleteMany({ where: { expense: where } });
    await prisma.expense.deleteMany({ where });
    await prisma.contract.deleteMany({ where: { id: contractId } });
    await prisma.rentalSpace.deleteMany({ where: { id: spaceId } });
    await prisma.unit.deleteMany({ where: { managerId: { in: managers } } });
    await prisma.landlord.deleteMany({ where: { managerId: { in: managers } } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });
  const body = (extra = {}) => ({
    clientId: randomUUID(),
    category: 'MAINTENANCE',
    amount: '100.10',
    currency: 'AED',
    incurredAt: '2026-11-09',
    vendor: 'Repair Vendor',
    description: 'Factual expense',
    ...extra,
  });
  const send = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: object,
    actor = manager,
  ) =>
    app.inject({
      method,
      url: '/api/v1/expenses' + path,
      payload,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
      },
    });
  async function create(extra = {}) {
    const response = await send('POST', '', body(extra));
    expect(response.statusCode, response.body).toBe(201);
    return response.json();
  }
  it('persists original currency, vendor, date, and notes through list and detail', async () => {
    const row = await create({ currency: 'USD' });
    const detail = await send('GET', '/' + row.id);
    expect(detail.statusCode).toBe(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.json()).toMatchObject({
      amount: '100.1',
      currency: 'USD',
      vendor: 'Repair Vendor',
      recovered: '0.00',
      unrecovered: '100.10',
    });
    const list = await send('GET', '?currency=USD');
    expect(list.json().items.some((item: { id: string }) => item.id === row.id)).toBe(true);
    expect(detail.body).not.toMatch(/evidenceKey|payloadHash|passwordHash/);
  });
  it('replays the same intent once and rejects a different payload under the same key', async () => {
    const input = body();
    const first = await send('POST', '', input),
      repeat = await send('POST', '', { ...input, amount: '100.1' });
    expect(repeat.statusCode).toBe(201);
    expect(repeat.json().id).toBe(first.json().id);
    expect((await send('POST', '', { ...input, amount: '101.00' })).statusCode).toBe(409);
    expect(
      await prisma.auditEvent.count({
        where: { entityId: first.json().id, action: 'EXPENSE_RECORDED' },
      }),
    ).toBe(1);
  });
  it('rejects tenant, administrator, and unrelated-manager access', async () => {
    const row = await create();
    for (const actor of [tenant, admin]) {
      expect((await send('GET', '', undefined, actor)).statusCode).toBe(403);
      expect((await send('POST', '', body(), actor)).statusCode).toBe(403);
    }
    expect((await send('GET', '/' + row.id, undefined, foreign)).statusCode).toBe(404);
    expect(
      (
        await send(
          'POST',
          '/' + row.id + '/void',
          { clientId: randomUUID(), reason: 'Foreign void' },
          foreign,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await send('POST', '', body({ scopeKind: 'UNIT', targetId: foreignUnitId }))).statusCode,
    ).toBe(404);
  });
  it('preserves direct portfolio, landlord, unit, room, and contract scopes', async () => {
    for (const [scopeKind, targetId] of [
      ['LANDLORD', landlordId],
      ['UNIT', unitId],
      ['SPACE', spaceId],
      ['CONTRACT', contractId],
    ]) {
      const row = await create({ scopeKind, targetId });
      expect(row.scopeKind).toBe(scopeKind);
      if (scopeKind !== 'LANDLORD') expect(row.unit.id).toBe(unitId);
      if (scopeKind === 'CONTRACT') expect(row.contract.id).toBe(contractId);
    }
  });
  it('serializes competing recoveries and never exceeds gross expense', async () => {
    const row = await create({ amount: '100.00' }),
      receipt = {
        clientId: randomUUID(),
        amount: '60.00',
        paidAt: '2026-11-09',
        method: 'Bank transfer',
        reference: 'Evidence reference',
      };
    const replies = await Promise.all([
      send('POST', '/' + row.id + '/recoveries', receipt),
      send('POST', '/' + row.id + '/recoveries', { ...receipt, clientId: randomUUID() }),
    ]);
    expect(replies.map((reply) => reply.statusCode).sort()).toEqual([201, 409]);
    const detail = await send('GET', '/' + row.id);
    expect(detail.json()).toMatchObject({
      amount: '100',
      recovered: '60.00',
      unrecovered: '40.00',
    });
    expect(detail.json().recoveries).toHaveLength(1);
  });
  it('keeps recovery retries exact and preserves gross amounts and source records', async () => {
    const row = await create(),
      receipt = { clientId: randomUUID(), amount: '25.10', paidAt: '2026-11-09', method: 'Cash' };
    const first = await send('POST', '/' + row.id + '/recoveries', receipt),
      retry = await send('POST', '/' + row.id + '/recoveries', receipt);
    expect(first.statusCode).toBe(201);
    expect(retry.json().recoveries).toHaveLength(1);
    expect(retry.json().amount).toBe(row.amount);
    expect(retry.json().recovered).toBe('25.10');
    expect(
      (await send('POST', '/' + row.id + '/recoveries', { ...receipt, amount: '26' })).statusCode,
    ).toBe(409);
    expect(
      (
        await send('POST', '/' + row.id + '/void', {
          clientId: randomUUID(),
          reason: 'Hide recovery',
        })
      ).statusCode,
    ).toBe(409);
  });
  it('records an immutable reasoned void, preserves the original, and excludes it from active totals', async () => {
    const row = await create(),
      input = { clientId: randomUUID(), reason: 'Duplicate vendor invoice' };
    expect((await send('POST', '/' + row.id + '/void', input)).statusCode).toBe(200);
    expect((await send('POST', '/' + row.id + '/void', input)).statusCode).toBe(200);
    expect(
      (await send('POST', '/' + row.id + '/void', { ...input, reason: 'Different reason' }))
        .statusCode,
    ).toBe(409);
    const original = await prisma.expense.findUniqueOrThrow({ where: { id: row.id } });
    expect(original.vendor).toBe('Repair Vendor');
    expect(original.amount.toString()).toBe('100.1');
    const voids = await send('GET', '?status=VOID');
    expect(voids.json().items.some((item: { id: string }) => item.id === row.id)).toBe(true);
    expect((await send('PATCH', '/' + row.id, { amount: '1' })).statusCode).toBe(404);
    expect((await send('DELETE', '/' + row.id)).statusCode).toBe(404);
  });
  it('exports only authorized filtered records with spreadsheet formula protection and an audit event', async () => {
    const row = await create({ vendor: '=1+1', description: 'unique-export-token' });
    const csv = await send('GET', '/export.csv?q=unique-export-token');
    expect(csv.statusCode, csv.body).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('"\'=1+1"');
    expect(csv.body).toContain(row.id);
    expect(csv.body).not.toContain('Private Unit');
    expect(
      await prisma.auditEvent.count({
        where: { actorUserId: manager.id, action: 'EXPENSE_EXPORT' },
      }),
    ).toBeGreaterThan(0);
  });
  it('rejects excessive precision, ownership injection, unknown scopes, and invalid date ranges', async () => {
    for (const extra of [
      { amount: '0.001' },
      { managerId: foreign.managerId },
      { scopeKind: 'UNIT', targetId: null },
      { incurredAt: '2026-02-30' },
    ])
      expect((await send('POST', '', body(extra))).statusCode).toBe(422);
    expect((await send('GET', '?from=2026-12-01&to=2026-01-01')).statusCode).toBe(422);
  });
  it('binds recovery payers to owned tenants and preserves their name snapshots', async () => {
    const profile = await prisma.tenantProfile.findUniqueOrThrow({ where: { userId: tenant.id } });
    const row = await create();
    const receipt = await send('POST', '/' + row.id + '/recoveries', {
      clientId: randomUUID(),
      amount: '20.00',
      paidAt: '2026-11-09',
      method: 'Cash',
      payerTenantId: profile.id,
    });
    expect(receipt.statusCode, receipt.body).toBe(201);
    expect(receipt.json().recoveries[0]).toMatchObject({
      payerTenantId: profile.id,
      payerName: 'Expense Tenant',
    });
    try {
      await prisma.tenantProfile.update({
        where: { id: profile.id },
        data: { fullName: 'Changed Current Name' },
      });
      const persisted = await send('GET', '/' + row.id);
      expect(persisted.json().recoveries[0].payerName).toBe('Expense Tenant');
    } finally {
      await prisma.tenantProfile.update({
        where: { id: profile.id },
        data: { fullName: 'Expense Tenant' },
      });
    }
    const denied = await send('POST', '/' + row.id + '/recoveries', {
      clientId: randomUUID(),
      amount: '1.00',
      paidAt: '2026-11-09',
      method: 'Cash',
      payerTenantId: 'foreign-or-unknown',
    });
    expect(denied.statusCode).toBe(404);
  });
  it('refuses production writes without a journal row', async () => {
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect((await send('POST', '', body())).statusCode).toBe(409);
    } finally {
      env.NODE_ENV = previous;
    }
  });
});
