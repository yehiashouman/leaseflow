import type { FastifyPluginAsync } from 'fastify';
import { UserStatus } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';

const summary = {
  id: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  leasingManager: { select: { fullName: true, declarationAcceptedAt: true } },
} as const;
const auditSummary = {
  id: true,
  actorUserId: true,
  action: true,
  entityType: true,
  entityId: true,
  createdAt: true,
} as const;
const pageNumber = z.coerce.number().int().min(1).max(10000).default(1);
const mask = (value: string | null) => (value ? '****' + value.slice(-4) : null);

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = allowRoles('ADMIN');
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/managers', { preHandler: adminOnly }, async (request) => {
    const { status, q, page } = z
      .object({
        status: z.enum(UserStatus).optional(),
        q: z.string().trim().max(150).default(''),
        page: pageNumber,
      })
      .strict()
      .parse(request.query);
    const where = {
      role: 'LEASING_MANAGER' as const,
      ...(status ? { status } : {}),
      ...(q
        ? { OR: [{ email: { contains: q } }, { leasingManager: { fullName: { contains: q } } }] }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: summary,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  });
  app.get('/managers/:id', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const user = await prisma.user.findFirst({
      where: { id, role: 'LEASING_MANAGER' },
      select: {
        ...summary,
        leasingManager: {
          select: {
            fullName: true,
            nationality: true,
            dateOfBirth: true,
            emiratesIdNumber: true,
            emiratesIdExpiry: true,
            licenseType: true,
            licenseIssuer: true,
            licenseNumber: true,
            licenseExpiry: true,
            declarationAcceptedAt: true,
          },
        },
      },
    });
    if (!user) throw app.httpErrors.notFound('Manager not found');
    const history = await prisma.auditEvent.findMany({
      where: { entityType: 'User', entityId: id, action: { startsWith: 'MANAGER_' } },
      select: auditSummary,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return {
      ...user,
      leasingManager: user.leasingManager
        ? {
            ...user.leasingManager,
            emiratesIdNumber: mask(user.leasingManager.emiratesIdNumber),
            licenseNumber: mask(user.leasingManager.licenseNumber),
          }
        : null,
      history,
      moderationAvailable: false,
      documentsAvailable: false,
    };
  });
  app.patch('/managers/:id/status', { preHandler: adminOnly }, async () => {
    throw app.httpErrors.conflict(
      'Account moderation requires approved MFA and identity/document policies',
    );
  });
  app.get('/audit', { preHandler: adminOnly }, async (request) => {
    const { page, entityType, action } = z
      .object({
        page: pageNumber,
        entityType: z.string().trim().max(100).optional(),
        action: z.string().trim().max(100).optional(),
      })
      .strict()
      .parse(request.query);
    const where = { ...(entityType ? { entityType } : {}), ...(action ? { action } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.auditEvent.findMany({
        where,
        select: auditSummary,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.auditEvent.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  });
};
