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
    email: z.email().nullable().optional(),
    phone: text(40),
    whatsapp: text(40),
    address: text(500),
    notes: text(5000),
  })
  .strict();
export const unitSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    area: z.string().trim().min(2).max(150),
    landlordId: z.string().min(1).nullable().optional(),
    building: text(150),
    street: text(200),
    emirate: z.string().trim().min(2).max(100).default('Dubai'),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    defaultDeposit: money.default(0),
    ownerMonthlyRent: money.nullable().optional(),
    currency: z.enum(['AED', 'USD']).default('AED'),
    amenities: z.record(z.string(), z.json()).optional(),
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

const unitInclude = { landlord: true, spaces: true } as const;

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
  async function verifyLandlord(id: string | null | undefined, owner: string) {
    if (id && !(await prisma.landlord.findFirst({ where: { id, managerId: owner } })))
      throw app.httpErrors.notFound('Landlord not found');
  }

  app.get('/landlords', { preHandler: managerOnly }, async (request) =>
    prisma.landlord.findMany({
      where: { managerId: await managerId(request.user.sub) },
      include: { _count: { select: { units: true } } },
      orderBy: { name: 'asc' },
    }),
  );
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
      const existing = await tx.landlord.findFirst({ where: { id, managerId: owner } });
      if (!existing) throw app.httpErrors.notFound('Landlord not found');
      const updated = await tx.landlord.update({ where: { id, managerId: owner }, data: body });
      await recordAudit(tx, request, 'UPDATE', 'Landlord', updated, existing);
      return updated;
    });
  });

  app.get('/units', { preHandler: managerOnly }, async (request) =>
    prisma.unit.findMany({
      where: { managerId: await managerId(request.user.sub) },
      include: unitInclude,
      orderBy: { createdAt: 'desc' },
    }),
  );
  app.get('/units/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const unit = await prisma.unit.findFirst({
      where: { id, managerId: await managerId(request.user.sub) },
      include: unitInclude,
    });
    if (!unit) throw app.httpErrors.notFound('Unit not found');
    return unit;
  });
  app.post('/units', { preHandler: managerOnly }, async (request, reply) => {
    const { declarationAccepted: _declaration, ...body } = unitSchema.parse(request.body);
    void _declaration;
    const owner = await managerId(request.user.sub);
    await verifyLandlord(body.landlordId, owner);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.unit.create({
        data: { ...body, managerId: owner, active: false, declarationAcceptedAt: new Date() },
        include: unitInclude,
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
    await verifyLandlord(body.landlordId, owner);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.unit.findFirst({ where: { id, managerId: owner } });
      if (!existing) throw app.httpErrors.notFound('Unit not found');
      const updated = await tx.unit.update({
        where: { id, managerId: owner },
        data: { ...body, declarationAcceptedAt: new Date() },
        include: unitInclude,
      });
      await recordAudit(tx, request, 'UPDATE', 'Unit', updated, existing);
      return updated;
    });
  });
  app.post('/units/:unitId/spaces', { preHandler: managerOnly }, async (request, reply) => {
    const { unitId } = z.object({ unitId: z.string() }).parse(request.params);
    const body = spaceSchema.parse(request.body);
    if (body.type === 'MASTER_ROOM' && body.amenities?.privateBathroom !== true)
      return reply.unprocessableEntity('Master Room requires a private bathroom');
    const owner = await managerId(request.user.sub);
    if (!['ROOM', 'MASTER_ROOM'].includes(body.type))
      return reply.unprocessableEntity('Future feature: this accommodation type is disabled');
    const item = await prisma.$transaction(async (tx) => {
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
