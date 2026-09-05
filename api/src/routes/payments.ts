import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/:id/record', { preHandler: allowRoles('LEASING_MANAGER') }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ amountPaid: z.coerce.number().positive(), paidAt: z.coerce.date().default(() => new Date()), method: z.string().max(50).optional(), reference: z.string().max(150).optional(), evidenceKey: z.string().optional() }).parse(request.body);
    const profile = await prisma.leasingManagerProfile.findUniqueOrThrow({ where: { userId: request.user.sub } });
    const payment = await prisma.payment.findFirst({ where: { id, contract: { tenant: { managerId: profile.id } } } });
    if (!payment) return reply.notFound('Payment not found');
    const total = Number(payment.amountPaid) + body.amountPaid;
    const status = total >= Number(payment.amountDue) ? 'PAID' : 'PARTIALLY_PAID';
    const updated = await prisma.payment.update({ where: { id }, data: { ...body, amountPaid: total, status } });
    await audit(request, 'RECORD_PAYMENT', 'Payment', id, updated); return updated;
  });
};
