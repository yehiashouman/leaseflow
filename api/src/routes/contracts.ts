import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { caseContractScope } from '../case-data.js';
import {
  lockOwnedSpace,
  occupantCount,
  occupiedStatus,
  openContractStatuses,
} from '../space-availability.js';

const managerProfile = (userId: string) =>
  prisma.leasingManagerProfile.findUniqueOrThrow({ where: { userId } });
export function proratedRent(monthlyRent: number, startDate: Date) {
  const days = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Math.round((monthlyRent / days) * (days - startDate.getUTCDate() + 1) * 100) / 100;
}

export const contractRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const participants = allowRoles('LEASING_MANAGER', 'TENANT');
  const select = {
    id: true,
    status: true,
    startDate: true,
    endDate: true,
    monthlyRent: true,
    currency: true,
    dueDay: true,
    noticeDays: true,
    depositAmount: true,
    tenant: { select: { id: true, fullName: true } },
    rentalSpace: {
      select: {
        id: true,
        name: true,
        type: true,
        unit: { select: { id: true, name: true, area: true } },
      },
    },
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.ContractSelect;
  app.get('/', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request) => {
    return prisma.contract.findMany({
      where: caseContractScope(request.user),
      select,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
  });
  app.get('/:id', { preHandler: participants }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const row = await prisma.contract.findFirst({
      where: { id, ...caseContractScope(request.user) },
      select,
    });
    if (!row) throw app.httpErrors.notFound('Contract not found');
    return row;
  });
  app.get('/:id/records', { preHandler: participants }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const { section, page } = z
      .object({
        section: z.enum(['payments', 'deposits', 'requests']),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(request.query);
    return prisma.$transaction(async (tx) => {
      const scope = caseContractScope(request.user);
      if (!(await tx.contract.findFirst({ where: { id, ...scope }, select: { id: true } })))
        throw app.httpErrors.notFound('Contract not found');
      const where = { contractId: id, contract: scope };
      const pagination = { skip: (page - 1) * 20, take: 20 };
      if (section === 'payments') {
        const items = await tx.payment.findMany({
          where,
          select: {
            id: true,
            periodStart: true,
            dueDate: true,
            amountDue: true,
            amountPaid: true,
            currency: true,
            status: true,
            paidAt: true,
            method: true,
            reference: true,
          },
          orderBy: [{ dueDate: 'desc' }, { id: 'desc' }],
          ...pagination,
        });
        return { items, total: await tx.payment.count({ where }), page, pageSize: 20 };
      }
      if (section === 'deposits') {
        const items = await tx.depositEntry.findMany({
          where,
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            createdAt: true,
            tenantAcceptedAt: true,
            tenantDisputedAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...pagination,
        });
        return { items, total: await tx.depositEntry.count({ where }), page, pageSize: 20 };
      }
      const visible = {
        ...where,
        ...(request.user.role === 'LEASING_MANAGER' ? { status: { not: 'DRAFT' as const } } : {}),
      };
      const items = await tx.request.findMany({
        where: visible,
        select: { id: true, type: true, title: true, status: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pagination,
      });
      return { items, total: await tx.request.count({ where: visible }), page, pageSize: 20 };
    });
  });
  app.post('/', { preHandler: allowRoles('LEASING_MANAGER') }, async (request, reply) => {
    const body = z
      .object({
        tenantId: z.string(),
        rentalSpaceId: z.string(),
        startDate: z.coerce.date(),
        monthlyRent: z.coerce.number().positive(),
        currency: z.enum(['AED', 'USD']).default('AED'),
        dueDay: z.number().int().min(1).max(28).default(1),
        noticeDays: z.number().int().min(0).max(90).default(30),
        depositAmount: z.coerce.number().min(0),
        secondaryOccupant: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);
    const manager = await managerProfile(request.user.sub);
    const tenant = await prisma.tenantProfile.findFirst({
      where: { id: body.tenantId, managerId: manager.id },
    });
    if (!tenant) return reply.notFound('Tenant or enabled rental space not found');
    const contract = await prisma
      .$transaction(async (tx) => {
        if (!(await lockOwnedSpace(tx, body.rentalSpaceId, manager.id)))
          throw app.httpErrors.notFound('Tenant or enabled rental space not found');
        const space = await tx.rentalSpace.findFirst({
          where: {
            id: body.rentalSpaceId,
            enabled: true,
            status: { notIn: ['INACTIVE', 'MAINTENANCE'] },
            unit: { managerId: manager.id, active: true, archivedAt: null },
            type: { in: ['ROOM', 'MASTER_ROOM'] },
          },
        });
        if (!space) throw app.httpErrors.notFound('Tenant or enabled rental space not found');
        const contracts = await tx.contract.findMany({
          where: { rentalSpaceId: space.id, status: { in: [...openContractStatuses] } },
          select: { secondaryOccupant: true },
        });
        const occupants = occupantCount(contracts) + (body.secondaryOccupant ? 2 : 1);
        if (occupants > space.capacity)
          throw app.httpErrors.conflict('Rental space capacity reached');
        const created = await tx.contract.create({
          data: { ...body, status: 'ACTIVE' } as never,
          include: { rentalSpace: true },
        });
        const firstAmount = proratedRent(body.monthlyRent, body.startDate);
        await tx.payment.create({
          data: {
            contractId: created.id,
            periodStart: body.startDate,
            dueDate: body.startDate,
            amountDue: firstAmount,
            currency: body.currency,
            status: 'DUE',
          },
        });
        const updatedSpace = await tx.rentalSpace.update({
          where: { id: space.id },
          data: { status: occupiedStatus(occupants, space.capacity) },
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            action: 'CREATE',
            entityType: 'Contract',
            entityId: created.id,
            newValue: JSON.parse(JSON.stringify(created)),
          },
        });
        return { ...created, rentalSpace: updatedSpace };
      })
      .catch((cause: unknown) => {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034')
          throw app.httpErrors.conflict(
            'Concurrent contract change. Reload availability and retry',
          );
        throw cause;
      });
    return reply.code(201).send(contract);
  });
};
