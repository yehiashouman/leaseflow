import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles, hashPassword, hashToken } from '../auth.js';
import { activeAccount } from '../account-data.js';
import { accountConfig, canonicalEmail, emailLink, securityLimits } from '../account-policy.js';
import { queueAccountEmail } from '../account-email.js';
import { lockUser } from '../sessions.js';
const tokenInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const params = z.object({ id: z.string().min(1).max(191) }).strict();
const selected = {
  id: true,
  email: true,
  fullName: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  resendCount: true,
  lastSentAt: true,
  createdAt: true,
} as const;
function state(row: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }) {
  return row.acceptedAt
    ? 'ACCEPTED'
    : row.revokedAt
      ? 'REVOKED'
      : row.expiresAt <= new Date()
        ? 'EXPIRED'
        : 'PENDING';
}
export const invitationRoutes: FastifyPluginAsync = async (app) => {
  const managerOnly = allowRoles('LEASING_MANAGER');
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  const requireEmail = () => {
    if (accountConfig.ACCOUNT_EMAIL_ENABLED !== 'true')
      throw app.httpErrors.serviceUnavailable('Account email is not enabled');
  };
  const notify = (
    tx: Prisma.TransactionClient,
    row: { email: string; fullName: string },
    token: string,
  ) =>
    queueAccountEmail(tx, {
      recipient: row.email,
      template: 'TENANT_INVITATION',
      subject: 'Your LeaseFlow tenant invitation',
      text:
        'You received a LeaseFlow tenant invitation. Accept it at ' +
        emailLink('invitation', token) +
        '\nThe invitation expires in seven days. If this invitation was unexpected, ignore it.',
    });
  app.get('/', { preHandler: managerOnly }, async (request) => {
    const { page, status } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']).optional(),
      })
      .strict()
      .parse(request.query);
    const now = new Date();
    const where = {
      manager: { userId: request.user.sub },
      ...(status === 'ACCEPTED'
        ? { acceptedAt: { not: null } }
        : status === 'REVOKED'
          ? { revokedAt: { not: null }, acceptedAt: null }
          : status === 'EXPIRED'
            ? { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }
            : status === 'PENDING'
              ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }
              : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.tenantInvitation.findMany({
        where,
        select: selected,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.tenantInvitation.count({ where }),
    ]);
    return {
      items: items.map((row) => ({ ...row, status: state(row) })),
      total,
      page,
      pageSize: 20,
    };
  });
  app.post(
    '/',
    { preHandler: managerOnly, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = z
        .object({
          email: canonicalEmail,
          fullName: z.string().trim().min(2).max(150),
          clientId: z.uuid(),
        })
        .strict()
        .parse(request.body);
      requireEmail();
      const result = await prisma.$transaction(async (tx) => {
        if (!(await activeAccount(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        const manager = await tx.leasingManagerProfile.findUniqueOrThrow({
          where: { userId: request.user.sub },
        });
        const previous = await tx.tenantInvitation.findUnique({
          where: { managerId_clientId: { managerId: manager.id, clientId: body.clientId } },
          select: selected,
        });
        if (previous) {
          if (previous.email !== body.email || previous.fullName !== body.fullName)
            throw app.httpErrors.conflict('Invitation key reused with different content');
          return previous;
        }
        if (await tx.user.findUnique({ where: { email: body.email }, select: { id: true } }))
          throw app.httpErrors.conflict('This email already has an account');
        if (
          await tx.tenantInvitation.findFirst({
            where: {
              managerId: manager.id,
              email: body.email,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          })
        )
          throw app.httpErrors.conflict('A current invitation already exists for this email');
        const token = randomBytes(32).toString('base64url');
        const row = await tx.tenantInvitation.create({
          data: {
            managerId: manager.id,
            email: body.email,
            fullName: body.fullName,
            clientId: body.clientId,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + securityLimits.invitationDays * 86400000),
          },
          select: selected,
        });
        await notify(tx, row, token);
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'TENANT_INVITATION_CREATE',
            entityType: 'TenantInvitation',
            entityId: row.id,
          },
        });
        return row;
      });
      return reply.code(201).send({ ...result, status: state(result) });
    },
  );
  for (const command of ['resend', 'revoke'] as const)
    app.post(
      '/:id/' + command,
      { preHandler: managerOnly, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
      async (request) => {
        const { id } = params.parse(request.params);
        z.object({})
          .strict()
          .parse(request.body ?? {});
        if (command === 'resend') requireEmail();
        const row = await prisma.$transaction(async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const current = await tx.tenantInvitation.findFirst({
            where: { id, manager: { userId: request.user.sub } },
            select: selected,
          });
          if (!current) throw app.httpErrors.notFound('Invitation not found');
          if (command === 'revoke' && current.revokedAt) return current;
          if (current.acceptedAt || current.revokedAt)
            throw app.httpErrors.conflict('Invitation already accepted or revoked');
          const token = randomBytes(32).toString('base64url');
          if (
            command === 'resend' &&
            (Date.now() - current.lastSentAt.getTime() < 60000 ||
              current.resendCount >= securityLimits.invitationResends)
          )
            throw app.httpErrors.tooManyRequests(
              'Invitation resend limit reached. Wait or create a new invitation after revocation',
            );
          const changed = await tx.tenantInvitation.update({
            where: { id },
            data:
              command === 'revoke'
                ? { revokedAt: new Date() }
                : {
                    tokenHash: hashToken(token),
                    expiresAt: new Date(Date.now() + securityLimits.invitationDays * 86400000),
                    lastSentAt: new Date(),
                    resendCount: { increment: 1 },
                  },
            select: selected,
          });
          if (command === 'resend') await notify(tx, changed, token);
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              action: 'TENANT_INVITATION_' + command.toUpperCase(),
              entityType: 'TenantInvitation',
              entityId: id,
            },
          });
          return changed;
        });
        return { ...row, status: state(row) };
      },
    );
  app.post(
    '/inspect',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (request) => {
      const { token } = tokenInput.parse(request.body);
      const row = await prisma.tenantInvitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { manager: { select: { fullName: true, user: { select: { status: true } } } } },
      });
      if (!row || state(row) !== 'PENDING' || row.manager.user.status !== 'ACTIVE')
        throw app.httpErrors.unprocessableEntity('Invitation is invalid or expired');
      return {
        email: row.email,
        fullName: row.fullName,
        managerName: row.manager.fullName,
        expiresAt: row.expiresAt,
      };
    },
  );
  app.post(
    '/accept',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = tokenInput
        .extend({
          email: canonicalEmail,
          password: z.string().min(12).max(128),
          fullName: z.string().trim().min(2).max(150),
        })
        .parse(request.body);
      const candidate = await prisma.tenantInvitation.findUnique({
        where: { tokenHash: hashToken(body.token) },
        include: { manager: { select: { userId: true } } },
      });
      if (!candidate) throw app.httpErrors.unprocessableEntity('Invitation is invalid or expired');
      const passwordHash = await hashPassword(body.password);
      try {
        const result = await prisma.$transaction(async (tx) => {
          await lockUser(tx, candidate.manager.userId);
          await tx.$queryRaw`SELECT id FROM TenantInvitation WHERE id = ${candidate.id} FOR UPDATE`;
          const row = await tx.tenantInvitation.findUniqueOrThrow({
            where: { id: candidate.id },
            include: { manager: { select: { user: { select: { status: true } } } } },
          });
          if (
            state(row) !== 'PENDING' ||
            row.tokenHash !== hashToken(body.token) ||
            row.email !== body.email ||
            row.manager.user.status !== 'ACTIVE'
          )
            throw app.httpErrors.unprocessableEntity('Invitation is invalid or expired');
          const user = await tx.user.create({
            data: {
              email: row.email,
              passwordHash,
              role: 'TENANT',
              status: 'PENDING_PHONE',
              emailVerifiedAt: new Date(),
              tenant: { create: { managerId: row.managerId, fullName: body.fullName } },
            },
          });
          await tx.tenantInvitation.update({
            where: { id: row.id },
            data: { acceptedAt: new Date() },
          });
          const session = await tx.authSession.create({
            data: { userId: user.id, expiresAt: new Date(Date.now() + 1800000), ip: request.ip },
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: user.id,
              action: 'TENANT_INVITATION_ACCEPT',
              entityType: 'TenantInvitation',
              entityId: row.id,
            },
          });
          return {
            id: user.id,
            status: user.status,
            accessToken: app.jwt.sign(
              { sub: user.id, role: 'TENANT', sid: session.id, onboarding: true },
              { expiresIn: 1800 },
            ),
          };
        });
        return reply.code(201).send(result);
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
          throw app.httpErrors.conflict('Email already has an account. Sign in instead');
        throw cause;
      }
    },
  );
};
