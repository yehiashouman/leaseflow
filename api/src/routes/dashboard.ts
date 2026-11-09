import { occupantDto, occupantSelect } from '../contract-policy.js';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { caseContractScope, caseContractSelect, caseScope } from '../case-data.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/admin', { preHandler: allowRoles('ADMIN') }, async () => {
    const [managers, pendingApproval, suspended, tenants] = await Promise.all([
      prisma.user.count({ where: { role: 'LEASING_MANAGER' } }),
      prisma.user.count({ where: { role: 'LEASING_MANAGER', status: 'PENDING_APPROVAL' } }),
      prisma.user.count({ where: { role: 'LEASING_MANAGER', status: 'SUSPENDED' } }),
      prisma.user.count({ where: { role: 'TENANT' } }),
    ]);
    return { managers, pendingApproval, suspended, tenants };
  });
  app.get('/tenant', { preHandler: allowRoles('TENANT') }, async (request) => {
    const contracts = await prisma.contract.findMany({
      where: { ...caseContractScope(request.user), status: { not: 'DRAFT' } },
      select: {
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
        rentalSpace: caseContractSelect.rentalSpace,
        payments: {
          select: { id: true, dueDate: true, amountDue: true, amountPaid: true, status: true },
          orderBy: [{ dueDate: 'desc' }, { id: 'desc' }],
          take: 20,
        },
        requests: {
          where: { status: { notIn: ['DRAFT', 'ACCEPTED', 'CLOSED', 'REJECTED'] } },
          select: {
            id: true,
            type: true,
            title: true,
            status: true,
            decisionDueAt: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 20,
        },
      },
      take: 20,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
    const unresolvedScope = {
      ...caseScope(request.user),
      status: {
        notIn: [
          'DRAFT',
          'ACCEPTED',
          'CLOSED',
          'REJECTED',
        ] as import('@prisma/client').RequestStatus[],
      },
    };
    const [unresolvedRequests, unresolvedCount, pendingAcknowledgements] = await Promise.all([
      prisma.request.findMany({
        where: unresolvedScope,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          events: {
            where: { kind: 'MESSAGE' },
            select: { id: true, actorName: true, actorRole: true, message: true, createdAt: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      prisma.request.count({ where: unresolvedScope }),
      prisma.request.count({ where: { ...unresolvedScope, status: 'RESOLVED' } }),
    ]);
    return {
      unresolvedRequests,
      unresolvedCount,
      pendingAcknowledgements,
      contracts: contracts.map((row) => ({
        ...row,
        occupants: row.occupants?.map((entry) => occupantDto(entry)) ?? [],
      })),
    };
  });
  app.get('/manager', { preHandler: allowRoles('LEASING_MANAGER') }, async (request) => {
    const manager = await prisma.leasingManagerProfile.findUniqueOrThrow({
      where: { userId: request.user.sub },
    });
    const unitScope = { managerId: manager.id, archivedAt: null };
    const contractScope = caseContractScope(request.user);
    const requestScope = caseScope(request.user);
    const open = {
      ...requestScope,
      status: {
        notIn: [
          'DRAFT',
          'ACCEPTED',
          'CLOSED',
          'REJECTED',
        ] as import('@prisma/client').RequestStatus[],
      },
    };
    const result = await prisma.$transaction(
      async (tx) => {
        const [units, spaceGroups, requestGroups, awaitingManager, deadlines, payments, expenses] =
          await Promise.all([
            tx.unit.count({ where: unitScope }),
            tx.rentalSpace.groupBy({
              by: ['status'],
              where: { unit: { ...unitScope, active: true }, enabled: true },
              _count: { _all: true },
            }),
            tx.request.groupBy({ by: ['type'], where: open, _count: { _all: true } }),
            tx.request.count({
              where: {
                ...requestScope,
                status: { in: ['SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'REOPENED'] },
              },
            }),
            tx.request.findMany({
              where: { ...open, decisionDueAt: { not: null } },
              select: { id: true, title: true, type: true, status: true, decisionDueAt: true },
              orderBy: [{ decisionDueAt: 'asc' }, { id: 'asc' }],
              take: 10,
            }),
            tx.payment.findMany({
              where: { contract: contractScope },
              select: { currency: true, amountDue: true, amountPaid: true, status: true },
            }),
            tx.expense.groupBy({
              by: ['currency'],
              where: { managerId: manager.id, void: { is: null } },
              _sum: { amount: true },
            }),
          ]);
        const count = (status: string) =>
          spaceGroups.find((g) => g.status === status)?._count._all ?? 0;
        const totals = new Map<
          string,
          {
            outstanding: Prisma.Decimal;
            overdue: Prisma.Decimal;
            received: Prisma.Decimal;
            expenses: Prisma.Decimal;
          }
        >();
        const currency = (key: string) => {
          if (!totals.has(key))
            totals.set(key, {
              outstanding: new Prisma.Decimal(0),
              overdue: new Prisma.Decimal(0),
              received: new Prisma.Decimal(0),
              expenses: new Prisma.Decimal(0),
            });
          return totals.get(key)!;
        };
        for (const payment of payments) {
          const row = currency(payment.currency);
          const balance = Prisma.Decimal.max(
            new Prisma.Decimal(payment.amountDue).minus(payment.amountPaid),
            0,
          );
          row.outstanding = row.outstanding.plus(balance);
          if (payment.status === 'LATE') row.overdue = row.overdue.plus(balance);
          row.received = row.received.plus(payment.amountPaid);
        }
        for (const expense of expenses)
          currency(expense.currency).expenses = new Prisma.Decimal(expense._sum.amount ?? 0);
        const spaces = spaceGroups.reduce((sum, g) => sum + g._count._all, 0);
        return {
          units,
          spaces,
          occupied: count('OCCUPIED') + count('PARTIAL'),
          vacant: count('AVAILABLE'),
          partial: count('PARTIAL'),
          maintenance: count('MAINTENANCE'),
          inactive: count('INACTIVE'),
          openRequests: requestGroups.reduce((sum, g) => sum + g._count._all, 0),
          requestsByType: Object.fromEntries(requestGroups.map((g) => [g.type, g._count._all])),
          awaitingManager,
          deadlines,
          financialRecords: [...totals.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, row]) => ({
              currency,
              ...Object.fromEntries(
                Object.entries(row).map(([key, amount]) => [key, amount.toFixed(2)]),
              ),
            })),
          financialBasis:
            'Recorded amounts across all dates; currencies remain separate; no conversion or profit calculation.',
          depositLiability: null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    return result;
  });
};
