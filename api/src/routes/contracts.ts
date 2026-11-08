import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { caseContractScope, caseContractSelect } from '../case-data.js';
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
  app.get('/', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request) => {
    if (request.user.role === 'TENANT')
      return prisma.contract.findMany({
        where: caseContractScope(request.user),
        include: {
          rentalSpace: caseContractSelect.rentalSpace,
          payments: true,
          requests: { select: { id: true, type: true, title: true, status: true } },
        },
      });
    return prisma.contract.findMany({
      where: caseContractScope(request.user),
      include: {
        tenant: { select: { id: true, fullName: true } },
        rentalSpace: { include: { unit: true } },
      },
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
