import type { FastifyRequest } from 'fastify';
import { prisma } from './db.js';
export async function audit(request: FastifyRequest, action: string, entityType: string, entityId?: string, newValue?: unknown) {
  await prisma.auditEvent.create({ data: { actorUserId: request.user?.sub, action, entityType, entityId, newValue: newValue as object | undefined, ip: request.ip, userAgent: request.headers['user-agent'] } });
}
