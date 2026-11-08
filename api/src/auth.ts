import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from './db.js';

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.unauthorized('Authentication required');
  }
  if (request.user.onboarding) return reply.unauthorized('Use the account setup session');
  if (!request.user.sid) return reply.unauthorized('Session is no longer active');
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { status: true, role: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.role !== request.user.role)
    return reply.unauthorized('Session is no longer active');
  const session = await prisma.authSession.findFirst({
    where: {
      id: request.user.sid,
      userId: request.user.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!session) return reply.unauthorized('Session is no longer active');
}

export function allowRoles(...roles: Array<'ADMIN' | 'LEASING_MANAGER' | 'TENANT'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!roles.includes(request.user.role)) return reply.forbidden('Insufficient permissions');
  };
}
