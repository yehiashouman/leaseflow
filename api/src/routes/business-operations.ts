import { businessHealth } from '../business-health.js';
import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BusinessJobKind, BusinessJobState } from '@prisma/client';
import { allowRoles } from '../auth.js';
import { activeAccount } from '../account-data.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
const select = {
  id: true,
  kind: true,
  state: true,
  nextRunAt: true,
  attempts: true,
  retryCount: true,
  failureCode: true,
  processed: true,
  lastRunAt: true,
  lastSuccessAt: true,
  createdAt: true,
} as const;
export const businessOperationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', allowRoles('ADMIN'));
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/business-jobs', async (request) => {
    const { page, state, kind } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        state: z.enum(BusinessJobState).optional(),
        kind: z.enum(BusinessJobKind).optional(),
      })
      .strict()
      .parse(request.query);
    const where = { ...(state ? { state } : {}), ...(kind ? { kind } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.businessJob.findMany({
        where,
        select,
        orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
        take: 20,
        skip: (page - 1) * 20,
      }),
      prisma.businessJob.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize: 20,
      workers: await businessHealth(prisma),
      recoveryEnabled: env.NODE_ENV !== 'production',
    };
  });
  app.post(
    '/business-jobs/:id/retry',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request) => {
      if (env.NODE_ENV === 'production')
        throw app.httpErrors.conflict(
          'Production job recovery requires approved administrator MFA and policy controls',
        );
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      const body = z
        .object({
          clientId: z.uuid(),
          expectedRetryCount: z.number().int().min(0),
          reason: z.string().trim().min(5).max(1000),
        })
        .strict()
        .parse(request.body);
      const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      return prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          await tx.$queryRaw`SELECT id FROM BusinessJob WHERE id = ${id} FOR UPDATE`;
          const row = await tx.businessJob.findUnique({ where: { id } });
          if (!row) throw app.httpErrors.notFound('Job not found');
          const previous = await tx.businessJobRetry.findUnique({
            where: { jobId_clientId: { jobId: id, clientId: body.clientId } },
          });
          if (previous) {
            if (previous.actorUserId !== request.user.sub || previous.payloadHash !== hash)
              throw app.httpErrors.conflict('Retry key reused with different content');
            return tx.businessJob.findUniqueOrThrow({ where: { id }, select });
          }
          if (
            !['FAILED', 'PAUSED'].includes(row.state) ||
            row.retryCount !== body.expectedRetryCount ||
            row.retryCount >= 2
          )
            throw app.httpErrors.conflict('This job cannot be retried; verify its latest state');
          await tx.businessJobRetry.create({
            data: {
              jobId: id,
              actorUserId: request.user.sub,
              clientId: body.clientId,
              payloadHash: hash,
              reason: body.reason,
            },
          });
          const updated = await tx.businessJob.update({
            where: { id },
            data: {
              state: 'QUEUED',
              nextRunAt: new Date(),
              attempts: 0,
              retryCount: { increment: 1 },
              failureCode: null,
              leaseToken: null,
              leaseExpiresAt: null,
            },
            select,
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              action: 'BUSINESS_JOB_RETRY',
              entityType: 'BusinessJob',
              entityId: id,
              ip: request.ip,
              newValue: {
                reason: body.reason,
                retryCount: updated.retryCount,
                cursorChanged: false,
              },
            },
          });
          return updated;
        },
        { isolationLevel: 'ReadCommitted' },
      );
    },
  );
};
