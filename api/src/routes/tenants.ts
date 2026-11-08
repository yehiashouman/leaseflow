import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { caseContractScope } from '../case-data.js';

const select = {
  id: true,
  fullName: true,
  nationality: true,
  gender: true,
  emiratesIdExpiry: true,
  user: {
    select: {
      email: true,
      phone: true,
      status: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
    },
  },
} as const;
export const tenantRoutes: FastifyPluginAsync = async (app) => {
  const managerOnly = allowRoles('LEASING_MANAGER');
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/', { preHandler: managerOnly }, async (request) => {
    const { q, page } = z
      .object({
        q: z.string().trim().max(150).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(request.query);
    const where = {
      manager: { userId: request.user.sub },
      ...(q ? { OR: [{ fullName: { contains: q } }, { user: { email: { contains: q } } }] } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.tenantProfile.findMany({
        where,
        select,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.tenantProfile.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  });
  app.get('/:id', { preHandler: managerOnly }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const tenant = await prisma.tenantProfile.findFirst({
      where: { id, manager: { userId: request.user.sub } },
      select,
    });
    if (!tenant) throw app.httpErrors.notFound('Tenant not found');
    const contracts = await prisma.contract.findMany({
      where: { tenantId: id, ...caseContractScope(request.user) },
      select: {
        id: true,
        status: true,
        startDate: true,
        rentalSpace: { select: { name: true, unit: { select: { name: true } } } },
      },
      orderBy: { startDate: 'desc' },
    });
    return { ...tenant, contracts };
  });
};
