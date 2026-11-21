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
import { ContractStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { calendarDate, dubaiMidnight } from '../business-calendar.js';
import { amendmentRent, effectiveRent } from '../rent-amendments.js';
import { caseContractScope } from '../case-data.js';
import { listPageSize, optionalPage, pageWindow } from '../list-page.js';
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
    ...(actor.role === 'TENANT'
      ? { OR: [{ status: { not: 'DRAFT' } }, { offeredAt: { not: null } }] }
      : {}),
  });
  const participants = allowRoles('LEASING_MANAGER', 'TENANT');
  const select = {
    id: true,
    status: true,
    startDate: true,
    endDate: true,
    monthlyRent: true,
    amendments: {
      where: { status: { in: ['PROPOSED', 'CONFIRMED'] } },
      select: {
        id: true,
        effectiveDate: true,
        changes: true,
        reason: true,
        status: true,
        confirmedAt: true,
      },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    },
    offeredAt: true,
    confirmedAt: true,
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
        status: true,
        unit: { select: { id: true, name: true, area: true } },
      },
    },
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.ContractSelect;
  const dto = ({ amendments, ...row }: Prisma.ContractGetPayload<{ select: typeof select }>) => {
    const today = calendarDate(new Date());
    const rent = effectiveRent(row.monthlyRent, row.currency, amendments ?? [], today);
    return {
      ...row,
      originalMonthlyRent: row.monthlyRent,
      monthlyRent: rent,
      amendments: (amendments ?? []).flatMap(({ changes, ...entry }) => {
        const amount = amendmentRent(changes, row.currency);
        return amount
          ? [
              {
                ...entry,
                monthlyRent: amount,
                currency: row.currency,
                canConfirm:
                  row.status === 'ACTIVE' &&
                  entry.status === 'PROPOSED' &&
                  today < entry.effectiveDate,
              },
            ]
          : [];
      }),
      occupants: row.occupants?.map((entry) => occupantDto(entry)) ?? [],
    };
  };
  async function verifyAdmission(
    tx: Prisma.TransactionClient,
    spaceId: string,
    tenant: { userId: string; emiratesIdExpiry: Date | null },
    manager: {
      id: string;
      userId: string;
      emiratesIdExpiry: Date | null;
      licenseExpiry: Date | null;
    },
    incomingOccupants: number,
    secondaryExpiry: Date | null,
    startDate: Date,
  ) {
    if (!(await lockOwnedSpace(tx, spaceId, manager.id)))
      throw app.httpErrors.notFound('Tenant or enabled rental space not found');
    const space = await tx.rentalSpace.findFirst({
      include: { unit: { select: { currency: true, defaultDeposit: true } } },
      where: {
        id: spaceId,
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
    const occupants = occupantCount(contracts) + incomingOccupants;
    if (occupants > space.capacity) throw app.httpErrors.conflict('Rental space capacity reached');
    const validAt = new Date(Math.max(Date.now(), startDate.getTime()));
    const isExpired = (expiry: Date | null | undefined) => !!expiry && expiry <= validAt;
    if (isExpired(manager.emiratesIdExpiry) || isExpired(manager.licenseExpiry))
      throw app.httpErrors.conflict(
        'Renew the expired manager identity or licence before creating this contract',
      );
    if (isExpired(tenant.emiratesIdExpiry) || isExpired(secondaryExpiry))
      throw app.httpErrors.conflict(
        'Renew the expired occupant identity before creating this contract',
      );

    const evidence = await tx.documentSeries.findMany({
      where: {
        OR: [
          { ownerUserId: manager.userId, purpose: { in: ['IDENTITY', 'LICENSE'] } },
          { ownerUserId: tenant.userId, purpose: 'IDENTITY' },
          { unitId: space.unitId, purpose: { in: ['PROPERTY_DOCUMENT', 'CONSENT'] } },
        ],
      },
      select: {
        ownerUserId: true,
        purpose: true,
        versions: {
          where: { status: 'CLEAN' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { expiresAt: true },
        },
      },
    });
    const evidenceByPurpose = new Map<string, boolean>();
    for (const { ownerUserId, purpose, versions } of evidence) {
      if (!versions[0]) continue;
      const key = purpose === 'IDENTITY' ? purpose + ':' + ownerUserId : purpose;
      if (!evidenceByPurpose.get(key))
        evidenceByPurpose.set(key, !isExpired(versions[0].expiresAt));
    }
    if ([...evidenceByPurpose.values()].includes(false))
      throw app.httpErrors.conflict(
        'Replace the expired identity, licence, property, or consent document before creating this contract',
      );

    return { space, occupants };
  }

  async function activate(
    tx: Prisma.TransactionClient,
    contract: {
      id: string;
      startDate: Date;
      monthlyRent: Prisma.Decimal;
      currency: string;
    },
    space: { id: string; capacity: number },
    occupants: number,
  ) {
    const now = new Date();
    const dueAt = dubaiMidnight(contract.startDate);
    await tx.payment.create({
      data: {
        contractId: contract.id,
        periodStart: contract.startDate,
        dueDate: dueAt,
        amountDue: proratedRentDecimal(contract.monthlyRent, contract.startDate),
        currency: contract.currency,
        status:
          dueAt < dubaiMidnight(calendarDate(now)) ? 'LATE' : dueAt <= now ? 'DUE' : 'UPCOMING',
      },
    });
    return tx.rentalSpace.update({
      where: { id: space.id },
      data: { status: occupiedStatus(occupants, space.capacity) },
    });
  }
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
      activationEnabled: true,
      limit: 500,
      policy: 'The primary tenant confirms the offered terms before activation.',
    };
  });
  app.get('/', { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') }, async (request) => {
    const { page, q, status, sort } = z
      .object({
        page: optionalPage,
        q: z.string().trim().max(150).default(''),
        status: z.enum(ContractStatus).optional(),
        sort: z.enum(['NEWEST', 'OLDEST']).default('NEWEST'),
      })
      .strict()
      .parse(request.query);
    const where: Prisma.ContractWhereInput = {
      AND: [
        visibleScope(request.user),
        ...(status ? [{ status }] : []),
        ...(q
          ? [
              {
                OR: [
                  { tenant: { fullName: { contains: q } } },
                  { rentalSpace: { name: { contains: q } } },
                  { rentalSpace: { unit: { name: { contains: q } } } },
                ],
              },
            ]
          : []),
      ],
    };
    const list = {
      where,
      select,
      orderBy: [{ startDate: sort === 'OLDEST' ? 'asc' : 'desc' }, { id: 'desc' }],
    } satisfies Prisma.ContractFindManyArgs;
    if (page === undefined) return (await prisma.contract.findMany(list)).map(dto);
    const [rows, total] = await prisma.$transaction([
      prisma.contract.findMany({ ...list, ...pageWindow(page) }),
      prisma.contract.count({ where }),
    ]);
    return { items: rows.map(dto), total, page, pageSize: listPageSize };
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
            expectedDate: true,
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
    const confirmationOffer = z
      .object({ offerForConfirmation: z.literal(true) })
      .safeParse(request.body);
    if (env.NODE_ENV === 'production' && !confirmationOffer.success)
      throw app.httpErrors.conflict(
        'Direct activation requires approved financial controls. Offer the terms for tenant confirmation.',
      );
    const body = contractCreateSchema.parse(request.body);
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const contract = await prisma
      .$transaction(async (tx) => {
        if (!(await activeAccount(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        const manager = await tx.leasingManagerProfile.findUniqueOrThrow({
          where: { userId: request.user.sub },
        });
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

        const startDate = new Date(body.startDate + 'T00:00:00Z');
        const secondaryExpiry = body.secondaryOccupant
          ? new Date(body.secondaryOccupant.emiratesIdExpiry)
          : null;
        const { space, occupants } = await verifyAdmission(
          tx,
          body.rentalSpaceId,
          tenant,
          manager,
          body.secondaryOccupant ? 2 : 1,
          secondaryExpiry,
          startDate,
        );
        if (body.depositAmount === undefined && space.unit.currency !== body.currency)
          throw app.httpErrors.unprocessableEntity(
            'Enter an explicit deposit amount in the contract currency',
          );
        const depositAmount =
          body.depositAmount ?? new Prisma.Decimal(space.unit.defaultDeposit).toFixed(2);
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
            identityExpiry: secondaryExpiry,
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
            status: body.offerForConfirmation ? 'DRAFT' : 'ACTIVE',
            offeredAt: body.offerForConfirmation ? new Date() : null,
            occupants: { create: occupantRows },
          },
          select,
        });
        const updatedSpace = body.offerForConfirmation
          ? null
          : await activate(
              tx,
              {
                id: created.id,
                startDate,
                monthlyRent: new Prisma.Decimal(body.monthlyRent),
                currency: body.currency,
              },
              space,
              occupants,
            );
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            action: body.offerForConfirmation ? 'OFFER_CONTRACT' : 'CREATE',
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
        return updatedSpace
          ? { ...created, rentalSpace: { ...created.rentalSpace, status: updatedSpace.status } }
          : created;
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
  app.post('/:id/confirm', { preHandler: allowRoles('TENANT') }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(request.body);
    return prisma.$transaction(
      async (tx) => {
        if (!(await activeAccount(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        const ownership = { id, ...caseContractScope(request.user), offeredAt: { not: null } };
        const offer = await tx.contract.findFirst({
          where: ownership,
          include: {
            tenant: { include: { manager: { include: { user: true } } } },
            occupants: true,
          },
        });
        if (!offer) throw app.httpErrors.notFound('Contract offer not found');
        if (offer.confirmedAt)
          return dto(await tx.contract.findFirstOrThrow({ where: ownership, select }));
        if (!(await lockOwnedSpace(tx, offer.rentalSpaceId, offer.tenant.managerId)))
          throw app.httpErrors.conflict('The offered space is unavailable.');
        await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${id} FOR UPDATE`;
        const locked = await tx.contract.findFirst({ where: ownership, select });
        if (!locked) throw app.httpErrors.notFound('Contract offer not found');
        if (locked.confirmedAt) return dto(locked);
        if (locked.status !== 'DRAFT' || offer.tenant.manager.user.status !== 'ACTIVE')
          throw app.httpErrors.conflict('The offer is unavailable for confirmation.');
        const secondary = offer.occupants.find((row) => row.role === 'SECONDARY');
        const { space, occupants } = await verifyAdmission(
          tx,
          offer.rentalSpaceId,
          offer.tenant,
          offer.tenant.manager,
          secondary ? 2 : 1,
          secondary?.identityExpiry ?? null,
          offer.startDate,
        );
        const confirmedAt = new Date();
        await activate(tx, locked, space, occupants);
        const updated = await tx.contract.update({
          where: { id },
          data: { confirmedAt, status: 'ACTIVE' },
          select,
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'CONFIRM_CONTRACT',
            entityType: 'Contract',
            entityId: id,
            newValue: { confirmedAt: confirmedAt.toISOString() },
          },
        });
        return dto(updated);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  });

  app.post(
    '/:id/amendments/:amendmentId/confirm',
    { preHandler: allowRoles('TENANT') },
    async (request) => {
      const identifier = z.string().min(1).max(191);
      const { id, amendmentId } = z
        .object({ id: identifier, amendmentId: identifier })
        .parse(request.params);
      z.object({ confirmed: z.literal(true) })
        .strict()
        .parse(request.body);
      return prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const where = { id, ...caseContractScope(request.user) };
          const contract = await tx.contract.findFirst({ where, select: { id: true } });
          if (!contract) throw app.httpErrors.notFound('Contract not found');
          await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${id} FOR UPDATE`;
          const terms = await tx.contract.findFirst({
            where,
            select: { id: true, status: true, currency: true, startDate: true },
          });
          if (!terms) throw app.httpErrors.notFound('Contract not found');
          const amendment = await tx.contractAmendment.findFirst({
            where: { id: amendmentId, contractId: id },
          });
          if (!amendment) throw app.httpErrors.notFound('Rent proposal not found');
          const result = () => tx.contract.findUniqueOrThrow({ where: { id }, select }).then(dto);
          if (amendment.confirmedAt && amendment.status === 'CONFIRMED') return result();
          const now = new Date();
          if (
            terms.status !== 'ACTIVE' ||
            amendment.status !== 'PROPOSED' ||
            !amendmentRent(amendment.changes, terms.currency) ||
            amendment.effectiveDate.getUTCDate() !== 1 ||
            amendment.effectiveDate <= terms.startDate ||
            now >= dubaiMidnight(amendment.effectiveDate)
          )
            throw app.httpErrors.conflict('The rent proposal is unavailable for confirmation.');
          const [posted, overlapping] = await Promise.all([
            tx.payment.findFirst({
              where: { contractId: id, periodStart: { gte: amendment.effectiveDate } },
              select: { id: true },
            }),
            tx.contractAmendment.findFirst({
              where: {
                contractId: id,
                effectiveDate: amendment.effectiveDate,
                status: 'CONFIRMED',
              },
              select: { id: true },
            }),
          ]);
          if (posted || overlapping)
            throw app.httpErrors.conflict('Rent terms for this period already exist.');
          await tx.contractAmendment.update({
            where: { id: amendmentId },
            data: { status: 'CONFIRMED', confirmedAt: now },
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              action: 'CONFIRM_RENT_AMENDMENT',
              entityType: 'ContractAmendment',
              entityId: amendmentId,
              newValue: { contractId: id, confirmedAt: now.toISOString() },
            },
          });
          return result();
        },
        { isolationLevel: 'ReadCommitted' },
      );
    },
  );
};
