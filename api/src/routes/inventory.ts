import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import {
  lockOwnedSpace,
  occupantCount,
  occupiedStatus,
  openContractStatuses,
} from '../space-availability.js';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(String(value)), 'Use at most two decimal places.');
export const landlordSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    companyName: text(200),
    email: z.email().max(191).nullable().optional(),
    phone: text(40),
    whatsapp: text(40),
    address: text(500),
    notes: text(5000),
    preferredContactMethod: z.enum(['EMAIL', 'PHONE', 'WHATSAPP']).nullable().optional(),
  })
  .strict();
export const unitSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    area: z.string().trim().min(2).max(150),
    landlordId: z.string().min(1).nullable().optional(),
    building: text(150),
    street: text(200),
    addressNotes: text(1000),
    emirate: z.string().trim().min(2).max(100).default('Dubai'),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    defaultDeposit: money.default(0),
    ownerMonthlyRent: money.nullable().optional(),
    ownerPaymentSchedule: text(1000),
    currency: z.enum(['AED', 'USD']).default('AED'),
    amenities: z
      .object({
        airConditioning: z.boolean().optional(),
        furnished: z.boolean().optional(),
        bed: z.boolean().optional(),
        television: z.boolean().optional(),
        refrigerator: z.boolean().optional(),
        bathroom: z.boolean().optional(),
        kitchen: z.boolean().optional(),
        laundry: z.boolean().optional(),
        balcony: z.boolean().optional(),
        parking: z.boolean().optional(),
        wifi: z.boolean().optional(),
        cleaning: z.boolean().optional(),
        additional: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      })
      .catchall(z.json())
      .optional(),
    declarationAccepted: z.literal(true),
  })
  .strict();
export const spaceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['ROOM', 'MASTER_ROOM', 'BED_SPACE', 'PARTITION']),
    capacity: z.number().int().min(1).max(10),
    askingRent: money.nullable().optional(),
    amenities: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export const spaceUpdateSchema = spaceSchema
  .extend({
    availability: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']),
  })
  .strict();

const unitInclude = (owner: string) =>
  ({ landlord: { where: { managerId: owner } }, spaces: true }) as const;

async function recordAudit(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  action: string,
  entityType: string,
  entity: { id: string },
  oldValue?: unknown,
) {
  await tx.auditEvent.create({
    data: {
      actorUserId: request.user.sub,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      action,
      entityType,
      entityId: entity.id,
      oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : undefined,
      newValue: JSON.parse(JSON.stringify(entity)),
    },
  });
}

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const managerOnly = allowRoles('LEASING_MANAGER');
  async function managerId(userId: string) {
    const manager = await prisma.leasingManagerProfile.findUnique({ where: { userId } });
    if (!manager) throw app.httpErrors.forbidden('Manager profile required');
    return manager.id;
  }
  async function lockLandlord(tx: Prisma.TransactionClient, id: string, owner: string) {
    const rows = await tx.$queryRaw<{ id: string; archivedAt: Date | null }[]>`
      SELECT id, archivedAt FROM Landlord WHERE id = ${id} AND managerId = ${owner} FOR UPDATE
    `;
    if (!rows[0]) throw app.httpErrors.notFound('Landlord not found');
    return rows[0];
  }
  async function lockUnit(tx: Prisma.TransactionClient, id: string, owner: string) {
    const rows = await tx.$queryRaw<{ id: string; archivedAt: Date | null }[]>`
      SELECT id, archivedAt FROM Unit WHERE id = ${id} AND managerId = ${owner} FOR UPDATE
    `;
    if (!rows[0]) throw app.httpErrors.notFound('Unit not found');
    return rows[0];
  }
  async function verifyLandlord(
    tx: Prisma.TransactionClient,
    id: string | null | undefined,
    owner: string,
  ) {
    if (id && (await lockLandlord(tx, id, owner)).archivedAt)
      throw app.httpErrors.notFound('Active landlord not found');
  }

  app.get('/landlords', { preHandler: managerOnly }, async (request) => {
    const { status, q } = z
      .object({
        status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
        q: z.string().trim().max(150).default(''),
      })
      .strict()
      .parse(request.query);
    const owner = await managerId(request.user.sub);
    return prisma.landlord.findMany({
      where: {
        managerId: owner,
        ...(status === 'ACTIVE'
          ? { archivedAt: null }
          : status === 'ARCHIVED'
            ? { archivedAt: { not: null } }
            : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { companyName: { contains: q } },
                { email: { contains: q } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { units: { where: { managerId: owner } } } } },
      orderBy: { name: 'asc' },
    });
  });
  app.get('/landlords/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const owner = await managerId(request.user.sub);
    const landlord = await prisma.landlord.findFirst({
      where: { id, managerId: owner },
      include: {
        units: {
          where: { managerId: owner },
          select: { id: true, name: true, area: true, active: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!landlord) throw app.httpErrors.notFound('Landlord not found');
    return landlord;
  });
  app.post('/landlords', { preHandler: managerOnly }, async (request, reply) => {
    const body = landlordSchema.parse(request.body);
    const owner = await managerId(request.user.sub);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.landlord.create({ data: { ...body, managerId: owner } });
      await recordAudit(tx, request, 'CREATE', 'Landlord', created);
      return created;
    });
    return reply.code(201).send(item);
  });
  app.patch('/landlords/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = landlordSchema.parse(request.body);
    const owner = await managerId(request.user.sub);
    return prisma.$transaction(async (tx) => {
      if ((await lockLandlord(tx, id, owner)).archivedAt)
        throw app.httpErrors.conflict('Restore the landlord before an edit');
      const existing = await tx.landlord.findFirst({ where: { id, managerId: owner } });
      if (!existing) throw app.httpErrors.notFound('Landlord not found');
      const updated = await tx.landlord.update({ where: { id, managerId: owner }, data: body });
      await recordAudit(tx, request, 'UPDATE', 'Landlord', updated, existing);
      return updated;
    });
  });
  for (const action of ['archive', 'restore'] as const) {
    app.post('/landlords/:id/' + action, { preHandler: managerOnly }, async (request) => {
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      z.object({})
        .strict()
        .parse(request.body ?? {});
      const owner = await managerId(request.user.sub);
      return prisma.$transaction(async (tx) => {
        const row = await lockLandlord(tx, id, owner);
        const existing = await tx.landlord.findFirst({ where: { id, managerId: owner } });
        if (!existing) throw app.httpErrors.notFound('Landlord not found');
        if ((action === 'archive') === Boolean(row.archivedAt)) return existing;
        if (action === 'archive' && (await tx.unit.count({ where: { landlordId: id } })))
          throw app.httpErrors.conflict('Unlink all units before archive');
        const updated = await tx.landlord.update({
          where: { id, managerId: owner },
          data: { archivedAt: action === 'archive' ? new Date() : null },
        });
        await recordAudit(
          tx,
          request,
          action === 'archive' ? 'ARCHIVE' : 'RESTORE',
          'Landlord',
          updated,
          existing,
        );
        return updated;
      });
    });
  }

  app.get('/units', { preHandler: managerOnly }, async (request) => {
    const { status, q } = z
      .object({
        status: z.enum(['CURRENT', 'ARCHIVED', 'ALL']).default('CURRENT'),
        q: z.string().trim().max(150).default(''),
      })
      .strict()
      .parse(request.query);
    const owner = await managerId(request.user.sub);
    return prisma.unit.findMany({
      where: {
        managerId: owner,
        ...(status === 'CURRENT'
          ? { archivedAt: null }
          : status === 'ARCHIVED'
            ? { archivedAt: { not: null } }
            : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { area: { contains: q } },
                { building: { contains: q } },
              ],
            }
          : {}),
      },
      include: unitInclude(owner),
      orderBy: { createdAt: 'desc' },
    });
  });
  app.get('/units/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const owner = await managerId(request.user.sub);
    const unit = await prisma.unit.findFirst({
      where: { id, managerId: owner },
      include: unitInclude(owner),
    });
    if (!unit) throw app.httpErrors.notFound('Unit not found');
    return unit;
  });
  app.post('/units', { preHandler: managerOnly }, async (request, reply) => {
    const { declarationAccepted: _declaration, ...body } = unitSchema.parse(request.body);
    void _declaration;
    const owner = await managerId(request.user.sub);
    const item = await prisma.$transaction(async (tx) => {
      await verifyLandlord(tx, body.landlordId, owner);
      const created = await tx.unit.create({
        data: { ...body, managerId: owner, active: false, declarationAcceptedAt: new Date() },
        include: unitInclude(owner),
      });
      await recordAudit(tx, request, 'CREATE', 'Unit', created);
      return created;
    });
    return reply.code(201).send(item);
  });
  app.patch('/units/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { declarationAccepted: _declaration, ...body } = unitSchema.parse(request.body);
    void _declaration;
    const owner = await managerId(request.user.sub);
    return prisma.$transaction(async (tx) => {
      await verifyLandlord(tx, body.landlordId, owner);
      if ((await lockUnit(tx, id, owner)).archivedAt)
        throw app.httpErrors.conflict('Restore the unit before an edit');
      const existing = await tx.unit.findFirst({ where: { id, managerId: owner } });
      if (!existing) throw app.httpErrors.notFound('Unit not found');
      const updated = await tx.unit.update({
        where: { id, managerId: owner },
        data: { ...body, declarationAcceptedAt: new Date() },
        include: unitInclude(owner),
      });
      await recordAudit(tx, request, 'UPDATE', 'Unit', updated, existing);
      return updated;
    });
  });
  for (const action of ['archive', 'restore'] as const) {
    app.post('/units/:id/' + action, { preHandler: managerOnly }, async (request) => {
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      z.object({})
        .strict()
        .parse(request.body ?? {});
      const owner = await managerId(request.user.sub);
      return prisma.$transaction(
        async (tx) => {
          const row = await lockUnit(tx, id, owner);
          const existing = await tx.unit.findFirst({ where: { id, managerId: owner } });
          if (!existing) throw app.httpErrors.notFound('Unit not found');
          if ((action === 'archive') === Boolean(row.archivedAt)) return existing;
          if (
            action === 'archive' &&
            (await tx.contract.count({
              where: { rentalSpace: { unitId: id }, status: { notIn: ['CLOSED', 'CANCELLED'] } },
            }))
          )
            throw app.httpErrors.conflict('Resolve open contracts before unit archive');
          const updated = await tx.unit.update({
            where: { id, managerId: owner },
            data: { archivedAt: action === 'archive' ? new Date() : null, active: false },
            include: unitInclude(owner),
          });
          await recordAudit(
            tx,
            request,
            action === 'archive' ? 'ARCHIVE' : 'RESTORE',
            'Unit',
            updated,
            existing,
          );
          return updated;
        },
        { isolationLevel: 'ReadCommitted' },
      );
    });
  }
  app.post('/units/:unitId/spaces', { preHandler: managerOnly }, async (request, reply) => {
    const { unitId } = z.object({ unitId: z.string() }).parse(request.params);
    const body = spaceSchema.parse(request.body);
    if (body.type === 'MASTER_ROOM' && body.amenities?.privateBathroom !== true)
      return reply.unprocessableEntity('Master Room requires a private bathroom');
    const owner = await managerId(request.user.sub);
    if (!['ROOM', 'MASTER_ROOM'].includes(body.type))
      return reply.unprocessableEntity('Future feature: this accommodation type is disabled');
    const item = await prisma.$transaction(async (tx) => {
      if ((await lockUnit(tx, unitId, owner)).archivedAt)
        throw app.httpErrors.conflict('Restore the unit before a new room');
      if (!(await tx.unit.findFirst({ where: { id: unitId, managerId: owner } })))
        throw app.httpErrors.notFound('Unit not found');
      const created = await tx.rentalSpace.create({
        data: { ...body, unitId, enabled: true, status: 'AVAILABLE' },
      });
      await recordAudit(tx, request, 'CREATE', 'RentalSpace', created);
      return created;
    });
    return reply.code(201).send(item);
  });
  app.patch('/spaces/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { availability, ...body } = spaceUpdateSchema.parse(request.body);
    if (!['ROOM', 'MASTER_ROOM'].includes(body.type))
      throw app.httpErrors.unprocessableEntity(
        'Future feature: this accommodation type is disabled',
      );
    if (body.type === 'MASTER_ROOM' && body.amenities?.privateBathroom !== true)
      throw app.httpErrors.unprocessableEntity('Master Room requires a private bathroom');
    const owner = await managerId(request.user.sub);
    return prisma.$transaction(async (tx) => {
      if (!(await lockOwnedSpace(tx, id, owner))) throw app.httpErrors.notFound('Room not found');
      const existing = await tx.rentalSpace.findFirst({
        where: { id, unit: { managerId: owner } },
      });
      if (!existing) throw app.httpErrors.notFound('Room not found');
      const contracts = await tx.contract.findMany({
        where: { rentalSpaceId: id, status: { in: [...openContractStatuses] } },
        select: { secondaryOccupant: true },
      });
      const occupants = occupantCount(contracts);
      if (body.capacity < occupants)
        throw app.httpErrors.conflict('Capacity cannot be lower than committed occupants');
      if (contracts.length && (availability !== 'ACTIVE' || body.type !== existing.type))
        throw app.httpErrors.conflict(
          'Resolve open contracts before a type or availability change',
        );
      const updated = await tx.rentalSpace.update({
        where: { id },
        data: {
          ...body,
          enabled: availability !== 'INACTIVE',
          status:
            availability === 'ACTIVE' ? occupiedStatus(occupants, body.capacity) : availability,
        },
      });
      await recordAudit(tx, request, 'UPDATE', 'RentalSpace', updated, existing);
      return updated;
    });
  });
};
