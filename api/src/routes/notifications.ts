import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../auth.js';
import {
  notificationScope,
  notificationTargetSelect,
  notificationTarget,
} from '../notification-data.js';
import { activeAccount } from '../account-data.js';

const scope = (request: FastifyRequest) => notificationScope(request.user);

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const participants = allowRoles('LEASING_MANAGER', 'TENANT');
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/count', { preHandler: participants }, async (request) => ({
    unread: await prisma.notification.count({ where: { ...scope(request), readAt: null } }),
  }));
  app.get('/', { preHandler: participants }, async (request) => {
    const { page, status } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        status: z.enum(['ALL', 'UNREAD', 'READ']).default('ALL'),
      })
      .strict()
      .parse(request.query);
    const where = {
      ...scope(request),
      ...(status === 'UNREAD'
        ? { readAt: null }
        : status === 'READ'
          ? { readAt: { not: null } }
          : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        select: {
          id: true,
          readAt: true,
          createdAt: true,
          ...notificationTargetSelect,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.notification.count({ where }),
    ]);
    return {
      items: items.map((row) => ({ ...row, subject: notificationTarget(row) })),
      total,
      page,
      pageSize: 20,
    };
  });
  for (const path of ['/read-all', '/:id/read']) {
    app.post(path, { preHandler: participants }, async (request) => {
      z.object({})
        .strict()
        .parse(request.body ?? {});
      const id = path.includes(':id')
        ? z.object({ id: z.string().min(1).max(191) }).parse(request.params).id
        : null;
      return prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const visible = await tx.notification.findMany({
            where: { ...(id ? { id } : {}), ...scope(request) },
            select: { id: true },
          });
          if (id && !visible.length) throw app.httpErrors.notFound('Notification not found');
          const result = await tx.notification.updateMany({
            where: {
              id: { in: visible.map((item) => item.id) },
              recipientUserId: request.user.sub,
              readAt: null,
            },
            data: { readAt: new Date() },
          });
          return { updated: result.count };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    });
  }
};
