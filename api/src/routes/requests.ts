import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addDays, subMonths } from '../time.js';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';

export const requestRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request) => {
    const where = request.user.role === 'TENANT' ? { contract: { tenant: { userId: request.user.sub } } } : { contract: { tenant: { manager: { userId: request.user.sub } } } };
    return prisma.request.findMany({ where, include: { events: { orderBy: { createdAt: 'asc' } }, contract: true }, orderBy: { createdAt: 'desc' } });
  });
  app.post('/', { preHandler: allowRoles('TENANT') }, async (request, reply) => {
    const body = z.object({ contractId: z.string(), type: z.enum(['MAINTENANCE', 'NEIGHBOR_COMPLAINT', 'LATE_PAYMENT', 'ROOM_CHANGE', 'MOVE_OUT', 'KEY_LOCK_CHANGE', 'GENERAL']), title: z.string().min(3).max(160), description: z.string().min(3).max(5000), metadata: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
    const contract = await prisma.contract.findFirst({ where: { id: body.contractId, tenant: { userId: request.user.sub }, status: { in: ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] } }, include: { tenant: true, payments: { where: { status: { in: ['UPCOMING', 'DUE'] } }, orderBy: { dueDate: 'asc' }, take: 1 } } });
    if (!contract) return reply.notFound('Active contract not found');
    if (['LATE_PAYMENT', 'ROOM_CHANGE'].includes(body.type)) {
      const previous = await prisma.request.findFirst({ where: { contractId: contract.id, type: body.type, status: { in: ['APPROVED', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED', 'CLOSED'] }, createdAt: { gte: subMonths(new Date(), 6) } } });
      if (previous) return reply.unprocessableEntity('Only one approved request of this type is allowed per rolling six months');
    }
    if (body.type === 'LATE_PAYMENT') {
      const next = contract.payments[0];
      if (!next) return reply.unprocessableEntity('No upcoming payment found');
      const earliest = addDays(next.dueDate, -Math.min(contract.tenant.lateRequestWindowDays, 10));
      if (new Date() < earliest || new Date() > next.dueDate) return reply.unprocessableEntity('Late-payment request is outside the allowed window');
    }
    const decisionDueAt = body.type === 'ROOM_CHANGE' ? addDays(new Date(), 5) : null;
    const item = await prisma.request.create({ data: { ...body, decisionDueAt, events: { create: { actorUserId: request.user.sub, kind: 'SUBMITTED', message: body.description } } } as never, include: { events: true } });
    await audit(request, 'CREATE', 'Request', item.id, item); return reply.code(201).send(item);
  });
  app.post('/:id/respond', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(['SEEN', 'AWAITING_MANAGER', 'AWAITING_TENANT', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED', 'REOPENED', 'DEADLOCK', 'CLOSED']), message: z.string().max(5000).optional(), metadata: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
    const existing = await prisma.request.findUnique({ where: { id }, include: { contract: { include: { tenant: { include: { manager: true } } } } } });
    if (!existing) return reply.notFound('Request not found');
    const permitted = existing.contract.tenant.userId === request.user.sub || existing.contract.tenant.manager.userId === request.user.sub;
    if (!permitted) return reply.forbidden();
    const item = await prisma.request.update({ where: { id }, data: { status: body.status, resolvedAt: ['RESOLVED', 'ACCEPTED', 'CLOSED'].includes(body.status) ? new Date() : undefined, events: { create: { actorUserId: request.user.sub, kind: body.status, message: body.message, metadata: body.metadata } } } as never, include: { events: true } });
    await audit(request, 'RESPOND', 'Request', id, body); return item;
  });
};
