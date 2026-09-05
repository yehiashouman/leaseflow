import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { audit } from '../audit.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/managers', { preHandler: allowRoles('ADMIN') }, () => prisma.user.findMany({ where: { role: 'LEASING_MANAGER' }, select: { id: true, email: true, phone: true, status: true, createdAt: true, leasingManager: true } }));
  app.patch('/managers/:id/status', { preHandler: allowRoles('ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status, reason } = z.object({ status: z.enum(['ACTIVE', 'REJECTED', 'SUSPENDED']), reason: z.string().min(3).max(500) }).parse(request.body);
    const user = await prisma.user.findFirst({ where: { id, role: 'LEASING_MANAGER' } });
    if (!user) return reply.notFound('Manager not found');
    const updated = await prisma.user.update({ where: { id }, data: { status } });
    await audit(request, `MANAGER_${status}`, 'User', id, { status, reason }); return updated;
  });
  app.get('/audit', { preHandler: allowRoles('ADMIN') }, () => prisma.auditEvent.findMany({ take: 200, orderBy: { createdAt: 'desc' } }));
};
