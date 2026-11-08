import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, hashPassword, hashToken, verifyPassword } from '../auth.js';
import {
  clearRefreshCookie,
  createSession,
  lockUser,
  refreshCookieName,
  revokeSessions,
  sendSession,
  sessionAudit,
  sessionTokens,
  verifySessionRequest,
} from '../sessions.js';

const loginSchema = z.object({ email: z.email().max(191), password: z.string().min(1) }).strict();

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/me', { preHandler: authenticate }, async (request) => {
    return prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        leasingManager: { select: { fullName: true } },
        tenant: { select: { fullName: true } },
      },
    });
  });
  app.post(
    '/login',
    {
      preHandler: verifySessionRequest,
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const account = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
        select: { id: true },
      });
      if (!account) return reply.unauthorized('Invalid credentials or inactive account');
      const tokens = await prisma.$transaction(async (tx) => {
        await lockUser(tx, account.id);
        const user = await tx.user.findUnique({ where: { id: account.id } });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !(await verifyPassword(user.passwordHash, body.password))
        )
          return null;
        return createSession(tx, app, user, request);
      });
      if (!tokens) return reply.unauthorized('Invalid credentials or inactive account');
      return sendSession(reply, tokens);
    },
  );

  app.post(
    '/refresh',
    {
      preHandler: verifySessionRequest,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = request.cookies[refreshCookieName];
      const record =
        token && /^[A-Za-z0-9_-]{64}$/.test(token)
          ? await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } })
          : null;
      const tokens = record?.sessionId
        ? await prisma.$transaction(async (tx) => {
            await lockUser(tx, record.userId);
            const current = await tx.refreshToken.findUnique({
              where: { id: record.id },
              include: { user: true, session: true },
            });
            if (!current?.session) return null;
            if (current.revokedAt) {
              await revokeSessions(tx, current.userId, current.session.id);
              await sessionAudit(
                tx,
                request,
                current.userId,
                'SESSION_REPLAY_REVOKE',
                current.session.id,
              );
              return null;
            }
            if (
              current.expiresAt <= new Date() ||
              current.session.expiresAt <= new Date() ||
              current.session.revokedAt ||
              current.user.status !== 'ACTIVE'
            )
              return null;
            await tx.refreshToken.update({
              where: { id: current.id },
              data: { revokedAt: new Date() },
            });
            await tx.authSession.update({
              where: { id: current.session.id },
              data: { lastUsedAt: new Date() },
            });
            return sessionTokens(tx, app, current.user, current.session);
          })
        : null;
      if (!tokens) {
        clearRefreshCookie(reply);
        return reply.unauthorized('Session expired or revoked');
      }
      return sendSession(reply, tokens);
    },
  );

  app.post('/logout', { preHandler: verifySessionRequest }, async (request, reply) => {
    const token = request.cookies[refreshCookieName];
    const record =
      token && /^[A-Za-z0-9_-]{64}$/.test(token)
        ? await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } })
        : null;
    let identity = record?.sessionId
      ? { userId: record.userId, sessionId: record.sessionId }
      : null;
    if (!identity) {
      try {
        await request.jwtVerify();
        if (request.user.sid) identity = { userId: request.user.sub, sessionId: request.user.sid };
      } catch {
        /* Logout remains idempotent after expiry. */
      }
    }
    if (identity) {
      const { userId, sessionId } = identity;
      await prisma.$transaction(async (tx) => {
        await lockUser(tx, userId);
        if (!(await tx.authSession.findFirst({ where: { id: sessionId, userId } }))) return;
        await revokeSessions(tx, userId, sessionId);
        await sessionAudit(tx, request, userId, 'SESSION_LOGOUT', sessionId);
      });
    }
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.get('/sessions', { preHandler: authenticate }, async (request) => {
    const sessions = await prisma.authSession.findMany({
      where: { userId: request.user.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
        ip: true,
      },
    });
    return sessions.map((session) => ({ ...session, current: session.id === request.user.sid }));
  });

  app.delete('/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const found = await prisma.$transaction(async (tx) => {
      await lockUser(tx, request.user.sub);
      const session = await tx.authSession.findFirst({ where: { id, userId: request.user.sub } });
      if (!session) return false;
      await revokeSessions(tx, request.user.sub, id);
      await sessionAudit(tx, request, request.user.sub, 'SESSION_REVOKE', id);
      return true;
    });
    if (!found) return reply.notFound('Session not found');
    if (id === request.user.sid) clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.post('/logout-all', { preHandler: authenticate }, async (request, reply) => {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, request.user.sub);
      await revokeSessions(tx, request.user.sub);
      await sessionAudit(tx, request, request.user.sub, 'SESSION_LOGOUT_ALL');
    });
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.post(
    '/password',
    { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: z.string().min(12).max(128),
        })
        .strict()
        .refine(
          (value) => value.currentPassword !== value.newPassword,
          'Choose a different password.',
        )
        .parse(request.body);
      const updated = await prisma.$transaction(async (tx) => {
        await lockUser(tx, request.user.sub);
        const user = await tx.user.findUnique({ where: { id: request.user.sub } });
        if (!user || !(await verifyPassword(user.passwordHash, body.currentPassword))) return false;
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(body.newPassword) },
        });
        await revokeSessions(tx, user.id);
        await sessionAudit(tx, request, user.id, 'PASSWORD_CHANGE');
        return true;
      });
      if (!updated) return reply.unprocessableEntity('Current password is incorrect');
      clearRefreshCookie(reply);
      return reply.code(204).send();
    },
  );
};
