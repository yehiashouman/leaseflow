import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';
import { activeAccount } from '../account-data.js';
import { sealIdentity } from '../account-policy.js';
import {
  contractCreateSchema,
  occupantSelect,
  occupantDto,
  proratedRentDecimal,
} from '../contract-policy.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
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
  return proratedRentDecimal(monthlyRent, startDate).toNumber();
}

export const contractRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const visibleScope = (
    actor: Parameters<typeof caseContractScope>[0],
  ): Prisma.ContractWhereInput => ({
    ...caseContractScope(actor),
    ...(actor.role === 'TENANT' ? { status: { not: 'DRAFT' } } : {}),
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
    occupants: { select: occupantSelect, orderBy: { role: 'asc' } },
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
  const dto = (row: Prisma.ContractGetPayload<{ select: typeof select }>) => ({
    ...row,
    occupants: row.occupants?.map((entry) => occupantDto(entry)) ?? [],
  });
  app.get('/options', { preHandler: allowRoles('LEASING_MANAGER') }, async (request) => {
    const owner = await managerProfile(request.user.sub);
    const [tenants, spaces] = await Promise.all([
      prisma.tenantProfile.findMany({
        where: { managerId: owner.id, user: { status: 'ACTIVE' } },
        select: { id: true, fullName: true },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
      prisma.rentalSpace.findMany({
        where: {
          enabled: true,
          type: { in: ['ROOM', 'MASTER_ROOM'] },
          status: { notIn: ['MAINTENANCE', 'INACTIVE'] },
          unit: { managerId: owner.id, active: true, archivedAt: null },
        },
        select: {
          id: true,
          name: true,
          capacity: true,
          askingRent: true,
          unit: { select: { name: true, currency: true, defaultDeposit: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
    ]);
    return {
      tenants,
      spaces,
      activationEnabled: env.NODE_ENV !== 'production',
      limit: 500,
      policy: 'Production activation requires approved financial and acknowledgement policies.',
    };
  });
  app.get('/', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request) => {
    const rows = await prisma.contract.findMany({
      where: visibleScope(request.user),
      select,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
    return rows.map(dto);
  });
  app.get('/:id', { preHandler: participants }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const row = await prisma.contract.findFirst({
      where: { id, ...visibleScope(request.user) },
      select,
    });
    if (!row) throw app.httpErrors.notFound('Contract not found');
    return dto(row);
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
      const scope = visibleScope(request.user);
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
    if (env.NODE_ENV === 'production')
      throw app.httpErrors.conflict(
        'Contract activation requires approved financial and acknowledgement policies.',
      );
    const body = contractCreateSchema.parse(request.body);
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const manager = await managerProfile(request.user.sub);
    const contract = await prisma
      .$transaction(async (tx) => {
        if (!(await activeAccount(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        const tenant = await tx.tenantProfile.findFirst({
          where: { id: body.tenantId, managerId: manager.id, user: { status: 'ACTIVE' } },
        });
        if (!tenant) throw app.httpErrors.notFound('Tenant or enabled rental space not found');
        const existing = await tx.contract.findUnique({
          where: { tenantId_clientId: { tenantId: body.tenantId, clientId: body.clientId } },
          select: { id: true, payloadHash: true },
        });
        if (existing) {
          if (existing.payloadHash !== hash)
            throw app.httpErrors.conflict('Contract key reused with different content');
          const visible = await tx.contract.findFirst({
            where: { id: existing.id, ...visibleScope(request.user) },
            select,
          });
          if (!visible) throw app.httpErrors.notFound('Contract not found');
          return visible;
        }

        if (!(await lockOwnedSpace(tx, body.rentalSpaceId, manager.id)))
          throw app.httpErrors.notFound('Tenant or enabled rental space not found');
        const space = await tx.rentalSpace.findFirst({
          include: { unit: { select: { currency: true, defaultDeposit: true } } },
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
        if (body.depositAmount === undefined && space.unit.currency !== body.currency)
          throw app.httpErrors.unprocessableEntity(
            'Enter an explicit deposit amount in the contract currency',
          );
        const depositAmount =
          body.depositAmount ?? new Prisma.Decimal(space.unit.defaultDeposit).toFixed(2);
        const startDate = new Date(body.startDate + 'T00:00:00Z');
        const primaryCipher = tenant.emiratesIdNumber
          ? tenant.emiratesIdNumber.startsWith('sealed:')
            ? tenant.emiratesIdNumber
            : sealIdentity(tenant.emiratesIdNumber)
          : null;
        const occupantRows: Prisma.ContractOccupantCreateWithoutContractInput[] = [
          {
            role: 'PRIMARY',
            fullName: tenant.fullName,
            dateOfBirth: tenant.dateOfBirth,
            nationality: tenant.nationality,
            identityCipher: primaryCipher,
            identityExpiry: tenant.emiratesIdExpiry,
            effectiveFrom: startDate,
          },
        ];
        if (body.secondaryOccupant)
          occupantRows.push({
            role: 'SECONDARY',
            fullName: body.secondaryOccupant.fullName,
            dateOfBirth: new Date(body.secondaryOccupant.dateOfBirth),
            nationality: body.secondaryOccupant.nationality,
            identityCipher: sealIdentity(body.secondaryOccupant.emiratesIdNumber),
            identityExpiry: new Date(body.secondaryOccupant.emiratesIdExpiry),
            effectiveFrom: startDate,
          });
        const created = await tx.contract.create({
          data: {
            clientId: body.clientId,
            payloadHash: hash,
            tenantId: body.tenantId,
            rentalSpaceId: body.rentalSpaceId,
            startDate,
            monthlyRent: body.monthlyRent,
            currency: body.currency,
            dueDay: body.dueDay,
            noticeDays: body.noticeDays,
            depositAmount,
            ...(body.secondaryOccupant
              ? { secondaryOccupant: { fullName: body.secondaryOccupant.fullName } }
              : {}),
            status: 'ACTIVE',
            occupants: { create: occupantRows },
          },
          select,
        });
        const firstAmount = proratedRentDecimal(body.monthlyRent, startDate).toFixed(2);
        await tx.payment.create({
          data: {
            contractId: created.id,
            periodStart: startDate,
            dueDate: startDate,
            amountDue: firstAmount,
            currency: body.currency,
            status: 'DUE',
          },
        });
        await tx.rentalSpace.update({
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
            newValue: {
              contractId: created.id,
              monthlyRent: body.monthlyRent,
              currency: body.currency,
              dueDay: body.dueDay,
              noticeDays: body.noticeDays,
              depositAmount,
              primaryTenantId: body.tenantId,
              occupantCount: occupantRows.length,
            },
          },
        });
        return created;
      })
      .catch((cause: unknown) => {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034')
          throw app.httpErrors.conflict(
            'Concurrent contract change. Reload availability and retry',
          );
        throw cause;
      });
    return reply.code(201).send(dto(contract));
  });
};
