import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';

const managerProfile = (userId: string) => prisma.leasingManagerProfile.findUniqueOrThrow({ where: { userId } });
export function proratedRent(monthlyRent: number, startDate: Date) {
  const days = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.round((monthlyRent / days) * (days - startDate.getUTCDate() + 1) * 100) / 100;
}

export const contractRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request) => {
    if (request.user.role === 'TENANT') return prisma.contract.findMany({ where: { tenant: { userId: request.user.sub } }, include: { rentalSpace: { include: { unit: true } }, payments: true, requests: true } });
    const manager = await managerProfile(request.user.sub);
    return prisma.contract.findMany({ where: { tenant: { managerId: manager.id } }, include: { tenant: { include: { user: true } }, rentalSpace: { include: { unit: true } } } });
  });
  app.post('/', { preHandler: allowRoles('LEASING_MANAGER') }, async (request, reply) => {
    const body = z.object({ tenantId: z.string(), rentalSpaceId: z.string(), startDate: z.coerce.date(), monthlyRent: z.coerce.number().positive(), currency: z.enum(['AED', 'USD']).default('AED'), dueDay: z.number().int().min(1).max(28).default(1), noticeDays: z.number().int().min(0).max(90).default(30), depositAmount: z.coerce.number().min(0), secondaryOccupant: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
    const manager = await managerProfile(request.user.sub);
    const tenant = await prisma.tenantProfile.findFirst({ where: { id: body.tenantId, managerId: manager.id } });
    const space = await prisma.rentalSpace.findFirst({ where: { id: body.rentalSpaceId, enabled: true, unit: { managerId: manager.id }, type: { in: ['ROOM', 'MASTER_ROOM'] } } });
    if (!tenant || !space) return reply.notFound('Tenant or enabled rental space not found');
    const occupancy = await prisma.contract.count({ where: { rentalSpaceId: space.id, status: { in: ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] } } });
    if (occupancy >= space.capacity) return reply.conflict('Rental space capacity reached');
    const contract = await prisma.contract.create({ data: { ...body, status: 'ACTIVE' } as never, include: { rentalSpace: true } });
    const firstAmount = proratedRent(body.monthlyRent, body.startDate);
    await prisma.payment.create({ data: { contractId: contract.id, periodStart: body.startDate, dueDate: body.startDate, amountDue: firstAmount, currency: body.currency, status: 'DUE' } });
    await audit(request, 'CREATE', 'Contract', contract.id, contract); return reply.code(201).send(contract);
  });
};
