import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), count: vi.fn() },
  leasingManagerProfile: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  tenantProfile: { findFirst: vi.fn() },
  landlord: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  unit: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  rentalSpace: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  contract: { findMany: vi.fn(), create: vi.fn() },
  payment: { create: vi.fn() },
  auditEvent: { create: vi.fn() },
  authSession: { findFirst: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
}));
vi.mock('../src/db.js', () => ({ prisma: db }));
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost/test');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters');
vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-at-least-32-characters');

describe('inventory writes and role dashboards', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const { buildApp } = await import('../src/app.js');
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'LEASING_MANAGER' });
    db.leasingManagerProfile.findUnique.mockResolvedValue({ id: 'manager-1' });
    db.leasingManagerProfile.findUniqueOrThrow.mockResolvedValue({ id: 'manager-1' });
    db.$transaction.mockImplementation((callback) => callback(db));
    db.auditEvent.create.mockResolvedValue({});
    db.authSession.findFirst.mockResolvedValue({ id: 'session-1' });
    db.$queryRaw.mockResolvedValue([{ id: 'space-1' }]);
    db.contract.findMany.mockResolvedValue([]);
  });
  function send(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
    role: 'ADMIN' | 'LEASING_MANAGER' | 'TENANT' = 'LEASING_MANAGER',
  ) {
    return app.inject({
      method,
      url,
      payload,
      headers: {
        authorization: 'Bearer ' + app.jwt.sign({ sub: 'user-1', role, sid: 'session-1' }),
      },
    });
  }
  const unit = { name: 'Demo Apartment', area: 'Dubai Marina', declarationAccepted: true };

  it('rejects cross-manager landlord references', async () => {
    db.$queryRaw.mockResolvedValue([]);
    const response = await send('POST', '/api/v1/inventory/units', {
      ...unit,
      landlordId: 'other-manager-landlord',
    });
    expect(response.statusCode).toBe(404);
    expect(db.unit.create).not.toHaveBeenCalled();
    expect(db.$queryRaw.mock.calls[0]?.slice(1)).toEqual(['other-manager-landlord', 'manager-1']);
  });
  it('filters landlord lists by status and search within manager ownership', async () => {
    db.landlord.findMany.mockResolvedValue([]);
    expect(
      (await send('GET', '/api/v1/inventory/landlords?status=ARCHIVED&q=Demo')).statusCode,
    ).toBe(200);
    expect(db.landlord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          managerId: 'manager-1',
          archivedAt: { not: null },
          OR: expect.any(Array),
        }),
      }),
    );
    expect((await send('GET', '/api/v1/inventory/landlords?status=INVALID')).statusCode).toBe(422);
  });
  it('scopes landlord details and linked units to the manager', async () => {
    db.landlord.findFirst.mockResolvedValue({ id: 'landlord-1', units: [] });
    expect((await send('GET', '/api/v1/inventory/landlords/landlord-1')).statusCode).toBe(200);
    expect(db.landlord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'landlord-1', managerId: 'manager-1' },
        include: expect.objectContaining({
          units: expect.objectContaining({ where: { managerId: 'manager-1' } }),
        }),
      }),
    );
  });
  it('blocks landlord archive while any units remain linked', async () => {
    db.landlord.findFirst.mockResolvedValue({ id: 'landlord-1', archivedAt: null });
    db.unit.count.mockResolvedValue(1);
    expect((await send('POST', '/api/v1/inventory/landlords/landlord-1/archive')).statusCode).toBe(
      409,
    );
    expect(db.landlord.update).not.toHaveBeenCalled();
    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });
  it('archives and restores without deletion and preserves audit values', async () => {
    db.landlord.findFirst.mockResolvedValue({ id: 'landlord-1', archivedAt: null });
    db.unit.count.mockResolvedValue(0);
    db.landlord.update.mockResolvedValue({ id: 'landlord-1', archivedAt: new Date() });
    expect((await send('POST', '/api/v1/inventory/landlords/landlord-1/archive')).statusCode).toBe(
      200,
    );
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ARCHIVE',
          oldValue: { id: 'landlord-1', archivedAt: null },
        }),
      }),
    );
    db.$queryRaw.mockResolvedValue([{ id: 'landlord-1', archivedAt: new Date() }]);
    db.landlord.update.mockResolvedValue({ id: 'landlord-1', archivedAt: null });
    expect((await send('POST', '/api/v1/inventory/landlords/landlord-1/restore')).statusCode).toBe(
      200,
    );
  });
  it('blocks archived landlord edits and unit assignments', async () => {
    db.$queryRaw.mockResolvedValue([{ id: 'landlord-1', archivedAt: new Date() }]);
    expect(
      (await send('PATCH', '/api/v1/inventory/landlords/landlord-1', { name: 'New Name' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await send('POST', '/api/v1/inventory/units', { ...unit, landlordId: 'landlord-1' }))
        .statusCode,
    ).toBe(404);
    expect(db.landlord.update).not.toHaveBeenCalled();
    expect(db.unit.create).not.toHaveBeenCalled();
  });
  it('rejects landlord ownership/status injection and invalid contact preferences', async () => {
    for (const extra of [
      { managerId: 'forged' },
      { archivedAt: new Date().toISOString() },
      { preferredContactMethod: 'SMS' },
      { email: 'person@' + ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60), 'invalid'].join('.') },
    ])
      expect(
        (await send('POST', '/api/v1/inventory/landlords', { name: 'Demo Owner', ...extra }))
          .statusCode,
      ).toBe(422);
    expect(db.landlord.create).not.toHaveBeenCalled();
  });
  it('rejects ownership injection and absent declarations', async () => {
    expect(
      (await send('POST', '/api/v1/inventory/units', { ...unit, managerId: 'forged' })).statusCode,
    ).toBe(422);
    expect(
      (await send('POST', '/api/v1/inventory/units', { name: 'Unit', area: 'Dubai' })).statusCode,
    ).toBe(422);
    expect(db.unit.create).not.toHaveBeenCalled();
  });
  it('creates a draft unit with a transactional audit event', async () => {
    db.unit.create.mockResolvedValue({ id: 'unit-1', active: false });
    const response = await send('POST', '/api/v1/inventory/units', unit);
    expect(response.statusCode).toBe(201);
    expect(response.json().active).toBe(false);
    expect(db.unit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ managerId: 'manager-1', active: false }),
      }),
    );
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATE', entityId: 'unit-1' }),
      }),
    );
  });
  it('rejects another manager unit during an edit', async () => {
    db.unit.findFirst.mockResolvedValue(null);
    expect((await send('PATCH', '/api/v1/inventory/units/foreign', unit)).statusCode).toBe(404);
    expect(db.unit.update).not.toHaveBeenCalled();
  });
  it('preserves old and new values on a unit edit', async () => {
    db.unit.findFirst.mockResolvedValue({ id: 'unit-1', name: 'Old Unit' });
    db.unit.update.mockResolvedValue({ id: 'unit-1', name: 'Demo Apartment' });
    expect((await send('PATCH', '/api/v1/inventory/units/unit-1', unit)).statusCode).toBe(200);
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oldValue: { id: 'unit-1', name: 'Old Unit' },
          newValue: { id: 'unit-1', name: 'Demo Apartment' },
        }),
      }),
    );
  });
  it('creates and edits landlord contact records', async () => {
    db.landlord.create.mockResolvedValue({ id: 'landlord-1', name: 'Demo Owner' });
    expect(
      (
        await send('POST', '/api/v1/inventory/landlords', {
          name: 'Demo Owner',
          whatsapp: 'demo',
          address: 'Demo address',
        })
      ).statusCode,
    ).toBe(201);
    db.landlord.findFirst.mockResolvedValue({ id: 'landlord-1', name: 'Demo Owner' });
    db.landlord.update.mockResolvedValue({ id: 'landlord-1', name: 'Updated Owner' });
    expect(
      (
        await send('PATCH', '/api/v1/inventory/landlords/landlord-1', {
          name: 'Updated Owner',
          phone: null,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('rejects disabled room types through direct API calls', async () => {
    for (const type of ['BED_SPACE', 'PARTITION'])
      expect(
        (
          await send('POST', '/api/v1/inventory/units/unit-1/spaces', {
            name: 'Room',
            type,
            capacity: 1,
          })
        ).statusCode,
      ).toBe(422);
    expect(db.rentalSpace.create).not.toHaveBeenCalled();
  });
  it('requires a private bathroom for Master Room', async () => {
    expect(
      (
        await send('POST', '/api/v1/inventory/units/unit-1/spaces', {
          name: 'Master',
          type: 'MASTER_ROOM',
          capacity: 2,
        })
      ).statusCode,
    ).toBe(422);
  });
  it('rejects rooms in an unowned unit', async () => {
    db.unit.findFirst.mockResolvedValue(null);
    expect(
      (
        await send('POST', '/api/v1/inventory/units/foreign/spaces', {
          name: 'Room',
          type: 'ROOM',
          capacity: 1,
        })
      ).statusCode,
    ).toBe(404);
    expect(db.rentalSpace.create).not.toHaveBeenCalled();
  });
  it('creates an enabled room with an audit event', async () => {
    db.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
    db.rentalSpace.create.mockResolvedValue({ id: 'space-1', name: 'Room' });
    expect(
      (
        await send('POST', '/api/v1/inventory/units/unit-1/spaces', {
          name: 'Room',
          type: 'ROOM',
          capacity: 1,
        })
      ).statusCode,
    ).toBe(201);
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'RentalSpace', entityId: 'space-1' }),
      }),
    );
  });
  it('rejects invalid capacity and coordinates', async () => {
    expect(
      (await send('POST', '/api/v1/inventory/units', { ...unit, defaultDeposit: 12.345 }))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await send('POST', '/api/v1/inventory/units/unit-1/spaces', {
          name: 'Room',
          type: 'ROOM',
          capacity: 0,
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await send('POST', '/api/v1/inventory/units', { ...unit, latitude: 91 })).statusCode,
    ).toBe(422);
  });
  it('routes administrators to their own dashboard and blocks manager resources', async () => {
    db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'ADMIN' });
    db.user.count.mockResolvedValue(2);
    expect((await send('GET', '/api/v1/dashboard/admin', undefined, 'ADMIN')).statusCode).toBe(200);
    expect((await send('GET', '/api/v1/dashboard/manager', undefined, 'ADMIN')).statusCode).toBe(
      403,
    );
    expect((await send('GET', '/api/v1/inventory/units', undefined, 'ADMIN')).statusCode).toBe(403);
  });
  it('scopes tenant dashboards to the authenticated tenant', async () => {
    db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'TENANT' });
    db.contract.findMany.mockResolvedValue([]);
    expect((await send('GET', '/api/v1/dashboard/tenant', undefined, 'TENANT')).statusCode).toBe(
      200,
    );
    expect(db.contract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenant: { userId: 'user-1' } }) }),
    );
    expect((await send('GET', '/api/v1/inventory/units', undefined, 'TENANT')).statusCode).toBe(
      403,
    );
  });
  it('rejects suspended users even with an unexpired access token', async () => {
    db.user.findUnique.mockResolvedValue({ status: 'SUSPENDED', role: 'LEASING_MANAGER' });
    expect((await send('GET', '/api/v1/inventory/units')).statusCode).toBe(401);
    expect(db.unit.findMany).not.toHaveBeenCalled();
  });
  it('requires an active unit and an available enabled space for contract creation', async () => {
    db.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    db.rentalSpace.findFirst.mockResolvedValue(null);
    expect(
      (
        await send('POST', '/api/v1/contracts', {
          tenantId: 'tenant-1',
          rentalSpaceId: 'space-1',
          startDate: '2026-11-01',
          monthlyRent: 3000,
          depositAmount: 3000,
        })
      ).statusCode,
    ).toBe(404);
    expect(db.rentalSpace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unit: { managerId: 'manager-1', active: true },
          status: { notIn: ['INACTIVE', 'MAINTENANCE'] },
          enabled: true,
        }),
      }),
    );
  });
  const roomEdit = {
    name: 'Room A',
    type: 'ROOM',
    capacity: 2,
    askingRent: 2500,
    availability: 'ACTIVE',
  };
  it('edits room defaults with a row lock and old/new audit values', async () => {
    const previous = { id: 'space-1', name: 'Old Room', type: 'ROOM', capacity: 2 };
    db.rentalSpace.findFirst.mockResolvedValue(previous);
    db.rentalSpace.update.mockResolvedValue({ ...previous, ...roomEdit });
    expect((await send('PATCH', '/api/v1/inventory/spaces/space-1', roomEdit)).statusCode).toBe(
      200,
    );
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.rentalSpace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AVAILABLE', enabled: true }),
      }),
    );
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oldValue: previous, entityType: 'RentalSpace' }),
      }),
    );
    expect(db.contract.create).not.toHaveBeenCalled();
  });
  it('rejects foreign rooms before any update', async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect((await send('PATCH', '/api/v1/inventory/spaces/foreign', roomEdit)).statusCode).toBe(
      404,
    );
    expect(db.rentalSpace.update).not.toHaveBeenCalled();
    expect(db.$queryRaw.mock.calls[0]?.slice(1)).toEqual(['foreign', 'manager-1']);
  });
  it('counts secondary occupants and preserves committed capacity', async () => {
    db.rentalSpace.findFirst.mockResolvedValue({ id: 'space-1', type: 'ROOM', capacity: 2 });
    db.contract.findMany.mockResolvedValue([
      { secondaryOccupant: { fullName: 'Second Occupant' } },
    ]);
    expect(
      (await send('PATCH', '/api/v1/inventory/spaces/space-1', { ...roomEdit, capacity: 1 }))
        .statusCode,
    ).toBe(409);
    expect(db.rentalSpace.update).not.toHaveBeenCalled();
  });
  it('blocks type and operational holds while contracts remain open', async () => {
    db.rentalSpace.findFirst.mockResolvedValue({ id: 'space-1', type: 'ROOM', capacity: 2 });
    db.contract.findMany.mockResolvedValue([{ secondaryOccupant: null }]);
    for (const availability of ['INACTIVE', 'MAINTENANCE'])
      expect(
        (await send('PATCH', '/api/v1/inventory/spaces/space-1', { ...roomEdit, availability }))
          .statusCode,
      ).toBe(409);
    expect(
      (
        await send('PATCH', '/api/v1/inventory/spaces/space-1', {
          ...roomEdit,
          type: 'MASTER_ROOM',
          amenities: { privateBathroom: true },
        })
      ).statusCode,
    ).toBe(409);
    expect(db.rentalSpace.update).not.toHaveBeenCalled();
  });
  it('supports vacant-room maintenance, inactivity, and restoration', async () => {
    db.rentalSpace.findFirst.mockResolvedValue({ id: 'space-1', type: 'ROOM', capacity: 2 });
    db.rentalSpace.update.mockResolvedValue({ id: 'space-1' });
    for (const [availability, enabled, status] of [
      ['MAINTENANCE', true, 'MAINTENANCE'],
      ['INACTIVE', false, 'INACTIVE'],
      ['ACTIVE', true, 'AVAILABLE'],
    ]) {
      expect(
        (await send('PATCH', '/api/v1/inventory/spaces/space-1', { ...roomEdit, availability }))
          .statusCode,
      ).toBe(200);
      expect(db.rentalSpace.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ enabled, status }) }),
      );
    }
  });
  it('rejects room ownership/status injection, disabled types, and invalid master rooms', async () => {
    for (const extra of [
      { unitId: 'foreign' },
      { status: 'AVAILABLE' },
      { type: 'PARTITION' },
      { type: 'MASTER_ROOM' },
    ])
      expect(
        (await send('PATCH', '/api/v1/inventory/spaces/space-1', { ...roomEdit, ...extra }))
          .statusCode,
      ).toBe(422);
    expect(db.rentalSpace.update).not.toHaveBeenCalled();
  });
  it('rejects room edits from tenants and administrators', async () => {
    for (const role of ['TENANT', 'ADMIN'] as const) {
      db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', role });
      expect(
        (await send('PATCH', '/api/v1/inventory/spaces/space-1', roomEdit, role)).statusCode,
      ).toBe(403);
    }
    expect(db.rentalSpace.update).not.toHaveBeenCalled();
  });
  it('counts both occupants before contract admission', async () => {
    db.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    db.rentalSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 2 });
    db.contract.findMany.mockResolvedValue([{ secondaryOccupant: null }]);
    expect(
      (
        await send('POST', '/api/v1/contracts', {
          tenantId: 'tenant-1',
          rentalSpaceId: 'space-1',
          startDate: '2026-11-01',
          monthlyRent: 3000,
          depositAmount: 3000,
          secondaryOccupant: { fullName: 'Second Occupant' },
        })
      ).statusCode,
    ).toBe(409);
    expect(db.contract.create).not.toHaveBeenCalled();
  });
  it('writes the contract, first obligation, room status, and audit in one transaction', async () => {
    db.tenantProfile.findFirst.mockResolvedValue({ id: 'tenant-1' });
    db.rentalSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 2 });
    db.contract.create.mockResolvedValue({ id: 'contract-1' });
    expect(
      (
        await send('POST', '/api/v1/contracts', {
          tenantId: 'tenant-1',
          rentalSpaceId: 'space-1',
          startDate: '2026-11-01',
          monthlyRent: 3000,
          depositAmount: 3000,
        })
      ).statusCode,
    ).toBe(201);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.payment.create).toHaveBeenCalledOnce();
    expect(db.rentalSpace.update).toHaveBeenCalledWith({
      where: { id: 'space-1' },
      data: { status: 'PARTIAL' },
    });
    expect(db.auditEvent.create).toHaveBeenCalledOnce();
  });
});
