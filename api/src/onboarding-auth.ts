import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { lockUser } from './sessions.js';
export async function authenticateOnboarding(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.unauthorized('Account session required');
  }
  if (
    !request.user.onboarding ||
    !request.user.sid ||
    !['LEASING_MANAGER', 'TENANT'].includes(request.user.role)
  )
    return reply.unauthorized('Account session required');
  const user = await prisma.user.findFirst({
    where: {
      id: request.user.sub,
      role: request.user.role,
      status: { in: ['PENDING_EMAIL', 'PENDING_PHONE', 'PENDING_APPROVAL', 'ACTIVE'] },
      authSessions: {
        some: { id: request.user.sid, revokedAt: null, expiresAt: { gt: new Date() } },
      },
    },
    select: { id: true },
  });
  if (!user) return reply.unauthorized('Account session expired or unavailable');
}
export async function onboardingAccount(tx: Prisma.TransactionClient, request: FastifyRequest) {
  await lockUser(tx, request.user.sub);
  return Boolean(
    request.user.onboarding &&
    request.user.sid &&
    (await tx.user.findFirst({
      where: {
        id: request.user.sub,
        role: request.user.role,
        status: { in: ['PENDING_EMAIL', 'PENDING_PHONE', 'PENDING_APPROVAL', 'ACTIVE'] },
        authSessions: {
          some: { id: request.user.sid, revokedAt: null, expiresAt: { gt: new Date() } },
        },
      },
      select: { id: true },
    })),
  );
}
