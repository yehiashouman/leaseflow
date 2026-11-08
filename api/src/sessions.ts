import { randomBytes } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashToken } from './auth.js';
import { durationSeconds, env, isOriginAllowed } from './config.js';

export const refreshCookieName =
  env.NODE_ENV === 'production' ? '__Host-leaseflow_refresh' : 'leaseflow_refresh';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

export async function verifySessionRequest(request: FastifyRequest, reply: FastifyReply) {
  if (
    request.headers['x-leaseflow-session'] !== '1' ||
    request.headers['sec-fetch-site'] === 'cross-site' ||
    !isOriginAllowed(request.headers.origin)
  )
    return reply.forbidden('Session request rejected');
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(refreshCookieName, cookieOptions);
}

export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
}

export async function sessionAudit(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  userId: string,
  action: string,
  sessionId?: string,
) {
  await tx.auditEvent.create({
    data: {
      actorUserId: userId,
      action,
      entityType: 'AuthSession',
      entityId: sessionId,
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 500),
    },
  });
}

export async function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId?: string,
) {
  const now = new Date();
  await tx.authSession.updateMany({
    where: { userId, ...(sessionId ? { id: sessionId } : {}), revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.refreshToken.updateMany({
    where: { userId, ...(sessionId ? { sessionId } : {}), revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function sessionTokens(
  tx: Prisma.TransactionClient,
  app: FastifyInstance,
  user: Pick<User, 'id' | 'role'>,
  session: { id: string; expiresAt: Date },
) {
  const refreshToken = randomBytes(48).toString('base64url');
  await tx.refreshToken.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: session.expiresAt,
    },
  });
  const accessToken = app.jwt.sign(
    { sub: user.id, role: user.role, sid: session.id },
    { expiresIn: durationSeconds(env.ACCESS_TOKEN_TTL) },
  );
  return { accessToken, refreshToken, expiresAt: session.expiresAt, userId: user.id };
}

export async function createSession(
  tx: Prisma.TransactionClient,
  app: FastifyInstance,
  user: Pick<User, 'id' | 'role'>,
  request: FastifyRequest,
) {
  const session = await tx.authSession.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + durationSeconds(env.REFRESH_TOKEN_TTL) * 1000),
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 500),
    },
  });
  await sessionAudit(tx, request, user.id, 'SESSION_CREATE', session.id);
  return sessionTokens(tx, app, user, session);
}

export function sendSession(
  reply: FastifyReply,
  tokens: Awaited<ReturnType<typeof sessionTokens>>,
) {
  reply.setCookie(refreshCookieName, tokens.refreshToken, {
    ...cookieOptions,
    expires: tokens.expiresAt,
  });
  return { accessToken: tokens.accessToken, userId: tokens.userId };
}
