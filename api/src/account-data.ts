import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { lockUser } from './sessions.js';

export async function activeAccount(tx: Prisma.TransactionClient, request: FastifyRequest) {
  await lockUser(tx, request.user.sub);
  if (!request.user.sid) return false;
  return Boolean(
    await tx.user.findFirst({
      where: {
        id: request.user.sub,
        status: 'ACTIVE',
        role: request.user.role,
        authSessions: {
          some: { id: request.user.sid, revokedAt: null, expiresAt: { gt: new Date() } },
        },
      },
      select: { id: true },
    }),
  );
}
