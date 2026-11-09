import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { activeAccount } from '../account-data.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { caseContractScope } from '../case-data.js';
import {
  expenseCategories,
  expenseSchema,
  expenseMoney,
  expensePayloadHash,
  csvCell,
} from '../expense-policy.js';
const idSchema = z.object({ id: z.string().min(1).max(191) });
const select = {
  id: true,
  category: true,
  amount: true,
  currency: true,
  incurredAt: true,
  vendor: true,
  description: true,
  scopeKind: true,
  createdAt: true,
  landlord: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  rentalSpace: { select: { id: true, name: true } },
  contract: { select: { id: true } },
  void: { select: { reason: true, createdAt: true } },
  recoveries: {
    select: {
      id: true,
      amount: true,
      paidAt: true,
      method: true,
      reference: true,
      payerTenantId: true,
      payerName: true,
      notes: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ExpenseSelect;
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    category: z.enum(expenseCategories).optional(),
    currency: z.enum(['AED', 'USD']).optional(),
    status: z.enum(['ACTIVE', 'VOID', 'ALL']).default('ACTIVE'),
    q: z.string().trim().max(150).default(''),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'The start date must precede the end date',
  );
type Expense = Prisma.ExpenseGetPayload<{ select: typeof select }>;
function dto(row: Expense) {
  const recovered = row.recoveries.reduce(
    (total, entry) => total.plus(entry.amount),
    new Prisma.Decimal(0),
  );
  return {
    ...row,
    recovered: recovered.toFixed(2),
    unrecovered: new Prisma.Decimal(row.amount).minus(recovered).toFixed(2),
  };
}
export const expenseRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', allowRoles('LEASING_MANAGER'));
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const owner = async (request: FastifyRequest) => {
    const manager = await prisma.leasingManagerProfile.findUnique({
      where: { userId: request.user.sub },
      select: { id: true },
    });
    if (!manager) throw app.httpErrors.forbidden('Manager profile required');
    return manager.id;
  };
  const write = async (tx: Prisma.TransactionClient, request: FastifyRequest) => {
    if (env.NODE_ENV === 'production')
      throw app.httpErrors.conflict(
        'Expense writes require approved financial, retention, and deployment policies',
      );
    if (!(await activeAccount(tx, request)))
      throw app.httpErrors.unauthorized('Session is no longer active');
  };
  async function lock(tx: Prisma.TransactionClient, id: string, managerId: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM Expense WHERE id = ${id} AND managerId = ${managerId} FOR UPDATE`;
    if (!rows.length) throw app.httpErrors.notFound('Expense not found');
    return tx.expense.findUniqueOrThrow({ where: { id }, select });
  }
  async function audit(
    tx: Prisma.TransactionClient,
    request: FastifyRequest,
    action: string,
    id: string,
    detail: Prisma.InputJsonObject,
  ) {
    await tx.auditEvent.create({
      data: {
        actorUserId: request.user.sub,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        action,
        entityType: 'Expense',
        entityId: id,
        newValue: detail,
      },
    });
  }
  app.get('/options', async (request) => {
    const managerId = await owner(request);
    const [landlords, units, spaces, contracts, tenants] = await Promise.all([
      prisma.landlord.findMany({
        where: { managerId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
      prisma.unit.findMany({
        where: { managerId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
      prisma.rentalSpace.findMany({
        where: { unit: { managerId, archivedAt: null } },
        select: { id: true, name: true, unit: { select: { name: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
      prisma.contract.findMany({
        where: caseContractScope(request.user),
        select: {
          id: true,
          tenant: { select: { fullName: true } },
          rentalSpace: { select: { name: true } },
        },
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        take: 500,
      }),
      prisma.tenantProfile.findMany({
        where: { managerId },
        select: { id: true, fullName: true },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        take: 500,
      }),
    ]);
    return {
      categories: expenseCategories,
      landlords,
      units,
      spaces,
      contracts,
      tenants,
      limit: 500,
    };
  });
  async function listWhere(request: FastifyRequest) {
    const query = listSchema.parse(request.query),
      managerId = await owner(request);
    const where: Prisma.ExpenseWhereInput = {
      managerId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.status === 'ACTIVE'
        ? { void: { is: null } }
        : query.status === 'VOID'
          ? { void: { isNot: null } }
          : {}),
      ...(query.q
        ? { OR: [{ vendor: { contains: query.q } }, { description: { contains: query.q } }] }
        : {}),
      ...(query.from || query.to
        ? {
            incurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(new Date(query.to).getTime() + 86400000) } : {}),
            },
          }
        : {}),
    };
    return { query, where };
  }
  app.get('/', async (request) => {
    const { query, where } = await listWhere(request);
    return prisma.$transaction(
      async (tx) => {
        const [rows, total, sums] = await Promise.all([
          tx.expense.findMany({
            where,
            select,
            orderBy: [{ incurredAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * 20,
            take: 20,
          }),
          tx.expense.count({ where }),
          tx.expense.groupBy({ by: ['currency'], where, _sum: { amount: true } }),
        ]);
        return {
          items: rows.map(dto),
          total,
          page: query.page,
          pageSize: 20,
          totals: sums.map((row) => ({
            currency: row.currency,
            grossAmount: row._sum.amount?.toFixed(2) ?? '0.00',
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  });
  app.get('/export.csv', async (request, reply) => {
    const { where } = await listWhere(request);
    const rows = await prisma.expense.findMany({
      where,
      select,
      orderBy: [{ incurredAt: 'desc' }, { id: 'desc' }],
      take: 1001,
    });
    if (rows.length > 1000)
      throw app.httpErrors.conflict('Narrow the filters to 1000 records or fewer');
    await audit(prisma, request, 'EXPENSE_EXPORT', 'portfolio', { rows: rows.length });
    const columns = [
      'Record ID',
      'Date (UTC)',
      'Category',
      'Vendor',
      'Currency',
      'Gross expense',
      'Recovered',
      'Scope',
      'Status',
      'Notes',
    ];
    const data = [
      columns,
      ...rows.map((row) => [
        row.id,
        row.incurredAt.toISOString().slice(0, 10),
        row.category,
        row.vendor,
        row.currency,
        row.amount.toFixed(2),
        dto(row).recovered,
        row.scopeKind,
        row.void ? 'VOID' : 'ACTIVE',
        row.description,
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leaseflow-expenses.csv"')
      .header('X-Content-Type-Options', 'nosniff')
      .send(data);
  });
  app.get('/:id', async (request) => {
    const { id } = idSchema.parse(request.params),
      managerId = await owner(request);
    const row = await prisma.expense.findFirst({ where: { id, managerId }, select });
    if (!row) throw app.httpErrors.notFound('Expense not found');
    return dto(row);
  });
  app.post('/', async (request, reply) => {
    const body = expenseSchema.parse(request.body),
      managerId = await owner(request);
    const normalized = { ...body, amount: new Prisma.Decimal(body.amount).toFixed(2) },
      hash = expensePayloadHash(normalized);
    const row = await prisma.$transaction(
      async (tx) => {
        await write(tx, request);
        const existing = await tx.expense.findUnique({
          where: { managerId_clientId: { managerId, clientId: body.clientId } },
          select: { id: true, payloadHash: true },
        });
        if (existing) {
          if (existing.payloadHash !== hash)
            throw app.httpErrors.conflict('Expense key reused with different content');
          return tx.expense.findUniqueOrThrow({ where: { id: existing.id }, select });
        }
        const links: {
          landlordId?: string;
          unitId?: string;
          rentalSpaceId?: string;
          contractId?: string;
        } = {};
        if (body.scopeKind === 'LANDLORD') {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM Landlord WHERE id = ${body.targetId} AND managerId = ${managerId} AND archivedAt IS NULL FOR UPDATE`;
          if (!rows.length) throw app.httpErrors.notFound('Scope not found');
          links.landlordId = rows[0]!.id;
        } else if (body.scopeKind !== 'PORTFOLIO') {
          let unitId = body.targetId!;
          if (body.scopeKind === 'SPACE') {
            const space = await tx.rentalSpace.findFirst({
              where: { id: body.targetId!, unit: { managerId, archivedAt: null } },
              select: { unitId: true },
            });
            if (!space) throw app.httpErrors.notFound('Scope not found');
            unitId = space.unitId;
            links.rentalSpaceId = body.targetId!;
          }
          if (body.scopeKind === 'CONTRACT') {
            const contract = await tx.contract.findFirst({
              where: { id: body.targetId!, ...caseContractScope(request.user) },
              select: { rentalSpace: { select: { id: true, unitId: true } } },
            });
            if (!contract) throw app.httpErrors.notFound('Scope not found');
            unitId = contract.rentalSpace.unitId;
            links.rentalSpaceId = contract.rentalSpace.id;
            links.contractId = body.targetId!;
          }
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM Unit WHERE id = ${unitId} AND managerId = ${managerId} AND archivedAt IS NULL FOR UPDATE`;
          if (!rows.length) throw app.httpErrors.notFound('Scope not found');
          links.unitId = unitId;
        }
        const created = await tx.expense.create({
          data: {
            ...links,
            managerId,
            clientId: body.clientId,
            payloadHash: hash,
            scopeKind: body.scopeKind,
            category: body.category,
            amount: normalized.amount,
            currency: body.currency,
            vendor: body.vendor,
            description: body.description,
            incurredAt: new Date(body.incurredAt),
          },
          select,
        });
        await audit(tx, request, 'EXPENSE_RECORDED', created.id, {
          category: created.category,
          amount: normalized.amount,
          currency: created.currency,
          scopeKind: created.scopeKind,
        });
        return created;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(201).send(dto(row));
  });
  app.post('/:id/void', async (request) => {
    const { id } = idSchema.parse(request.params),
      managerId = await owner(request);
    const body = z
      .object({ clientId: z.uuid(), reason: z.string().trim().min(3).max(1000) })
      .strict()
      .parse(request.body);
    return prisma.$transaction(
      async (tx) => {
        await write(tx, request);
        const row = await lock(tx, id, managerId);
        const previous = await tx.expenseVoid.findUnique({ where: { expenseId: id } });
        if (previous) {
          if (
            previous.clientId !== body.clientId ||
            previous.reason !== body.reason ||
            previous.actorUserId !== request.user.sub
          )
            throw app.httpErrors.conflict('Expense already void; inspect its history');
          return dto(row);
        }
        if (row.recoveries.length)
          throw app.httpErrors.conflict(
            'Expense recovery history requires separate settlement; void is unavailable',
          );
        await tx.expenseVoid.create({
          data: { expenseId: id, actorUserId: request.user.sub, ...body },
        });
        await audit(tx, request, 'EXPENSE_VOID', id, { reason: body.reason });
        return dto(await tx.expense.findUniqueOrThrow({ where: { id }, select }));
      },
      { isolationLevel: 'ReadCommitted' },
    );
  });
  app.post('/:id/recoveries', async (request, reply) => {
    const { id } = idSchema.parse(request.params),
      managerId = await owner(request);
    const body = z
      .object({
        clientId: z.uuid(),
        amount: expenseMoney,
        paidAt: z.iso.date(),
        method: z.string().trim().min(2).max(80),
        reference: z.string().trim().max(200).default(''),
        notes: z.string().trim().max(5000).default(''),
        payerTenantId: z.string().min(1).max(191).optional(),
      })
      .strict()
      .parse(request.body);
    const normalized = { ...body, amount: new Prisma.Decimal(body.amount).toFixed(2) },
      hash = expensePayloadHash(normalized);
    const row = await prisma.$transaction(
      async (tx) => {
        await write(tx, request);
        const expense = await lock(tx, id, managerId);
        const previous = await tx.expenseRecovery.findUnique({
          where: { expenseId_clientId: { expenseId: id, clientId: body.clientId } },
        });
        if (previous) {
          if (previous.payloadHash !== hash)
            throw app.httpErrors.conflict('Recovery key reused with different content');
          return expense;
        }
        if (expense.void) throw app.httpErrors.conflict('A void expense cannot receive recoveries');
        const total = expense.recoveries.reduce(
          (sum, entry) => sum.plus(entry.amount),
          new Prisma.Decimal(0),
        );
        if (total.plus(body.amount).greaterThan(expense.amount))
          throw app.httpErrors.conflict('Recovery exceeds unrecovered expense');
        const payer = body.payerTenantId
          ? await tx.tenantProfile.findFirst({
              where: { id: body.payerTenantId, managerId },
              select: { fullName: true },
            })
          : null;
        if (body.payerTenantId && !payer) throw app.httpErrors.notFound('Payer tenant not found');
        const recovered = await tx.expenseRecovery.create({
          data: {
            ...normalized,
            expenseId: id,
            actorUserId: request.user.sub,
            paidAt: new Date(body.paidAt),
            payloadHash: hash,
            payerName: payer?.fullName ?? null,
          },
        });
        await audit(tx, request, 'EXPENSE_RECOVERY', id, {
          recoveryId: recovered.id,
          amount: normalized.amount,
          currency: expense.currency,
        });
        return tx.expense.findUniqueOrThrow({ where: { id }, select });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(201).send(dto(row));
  });
};
