import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';

async function managerId(userId: string) {
  const profile = await prisma.leasingManagerProfile.findUnique({ where: { userId } });
  if (!profile) throw new Error('Manager profile missing');
  return profile.id;
}

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const managerOnly = allowRoles('LEASING_MANAGER');
  app.get('/landlords', { preHandler: managerOnly }, async (request) => prisma.landlord.findMany({ where: { managerId: await managerId(request.user.sub) }, orderBy: { name: 'asc' } }));
  app.post('/landlords', { preHandler: managerOnly }, async (request, reply) => {
    const data = z.object({ name: z.string().min(2), companyName: z.string().optional(), email: z.email().optional(), phone: z.string().optional(), notes: z.string().optional() }).parse(request.body);
    const item = await prisma.landlord.create({ data: { ...data, managerId: await managerId(request.user.sub) } });
    await audit(request, 'CREATE', 'Landlord', item.id, item); return reply.code(201).send(item);
  });
  app.get('/units', { preHandler: managerOnly }, async (request) => prisma.unit.findMany({ where: { managerId: await managerId(request.user.sub) }, include: { landlord: true, spaces: true }, orderBy: { createdAt: 'desc' } }));
  app.post('/units', { preHandler: managerOnly }, async (request, reply) => {
    const data = z.object({ name: z.string().min(2), area: z.string().min(2), landlordId: z.string().optional(), building: z.string().optional(), street: z.string().optional(), defaultDeposit: z.coerce.number().min(0).default(0), ownerMonthlyRent: z.coerce.number().min(0).optional(), currency: z.enum(['AED', 'USD']).default('AED'), amenities: z.record(z.string(), z.unknown()).optional(), declarationAccepted: z.literal(true) }).parse(request.body);
    const fields = { ...data };
    delete (fields as Partial<typeof data>).declarationAccepted;
    const item = await prisma.unit.create({ data: { ...fields, managerId: await managerId(request.user.sub), declarationAcceptedAt: new Date() } as never });
    await audit(request, 'CREATE', 'Unit', item.id, item); return reply.code(201).send(item);
  });
  app.post('/units/:unitId/spaces', { preHandler: managerOnly }, async (request, reply) => {
    const { unitId } = z.object({ unitId: z.string() }).parse(request.params);
    const body = z.object({ name: z.string().min(1), type: z.enum(['ROOM', 'MASTER_ROOM', 'BED_SPACE', 'PARTITION']), capacity: z.number().int().min(1).max(10), askingRent: z.coerce.number().min(0).optional(), amenities: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
    const unit = await prisma.unit.findFirst({ where: { id: unitId, managerId: await managerId(request.user.sub) } });
    if (!unit) return reply.notFound('Unit not found');
    if (['BED_SPACE', 'PARTITION'].includes(body.type)) return reply.unprocessableEntity('Future feature: this accommodation type is disabled');
    const item = await prisma.rentalSpace.create({ data: { ...body, unitId } as never });
    await audit(request, 'CREATE', 'RentalSpace', item.id, item); return reply.code(201).send(item);
  });
};
