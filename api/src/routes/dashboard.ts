import { calendarDate } from '../business-calendar.js';
import { effectiveRent } from '../rent-amendments.js';
import { depositBalance } from '../deposit-ledger.js';
import { occupantDto, occupantSelect } from '../contract-policy.js';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import {
  openRentContractStatuses,
  rentBalance,
  rentDashboardTotals,
  rentWindows,
} from '../rent-dashboard.js';
import { managerDashboardActivity } from '../dashboard-activity.js';
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
    const windows = rentWindows(new Date());
    const paymentScope = caseContractScope(request.user);
    const { contracts, rentSummary } = await prisma.$transaction(
      async (tx) => {
        const contracts = await tx.contract.findMany({
          where: { ...paymentScope, status: { not: 'DRAFT' } },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            monthlyRent: true,
            amendments: {
              where: { status: 'CONFIRMED', effectiveDate: { lte: calendarDate(windows.now) } },
              select: { effectiveDate: true, confirmedAt: true, changes: true },
            },
            currency: true,
            dueDay: true,
            noticeDays: true,
            tenant: { select: { lateRequestWindowDays: true, maxLateExtensionDays: true } },
            depositAmount: true,
            occupants: { select: occupantSelect, orderBy: { role: 'asc' } },
            rentalSpace: caseContractSelect.rentalSpace,
            payments: {
              select: {
                id: true,
                dueDate: true,
                expectedDate: true,
                amountDue: true,
                amountPaid: true,
                status: true,
              },
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
          orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { id: 'desc' }],
        });
        const contract = contracts.find((row) =>
          openRentContractStatuses.some((status) => status === row.status),
        );
        if (!contract) return { contracts, rentSummary: null };
        const unpaid = {
          contractId: contract.id,
          contract: { ...paymentScope, status: { in: [...openRentContractStatuses] } },
          amountPaid: { lt: tx.payment.fields.amountDue },
          currency: contract.currency,
        };
        const [due, original, extended] = await Promise.all([
          tx.payment.aggregate({
            where: {
              ...unpaid,
              OR: [
                { expectedDate: null, dueDate: { lt: windows.tomorrow } },
                { expectedDate: { lt: windows.tomorrow } },
              ],
            },
            _sum: { amountDue: true, amountPaid: true },
          }),
          tx.payment.findFirst({
            where: { ...unpaid, expectedDate: null, dueDate: { gte: windows.today } },
            orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
            select: { dueDate: true, amountDue: true, amountPaid: true },
          }),
          tx.payment.findFirst({
            where: { ...unpaid, expectedDate: { gte: windows.today } },
            orderBy: [{ expectedDate: 'asc' }, { id: 'asc' }],
            select: { expectedDate: true, amountDue: true, amountPaid: true },
          }),
        ]);
        const expected = extended?.expectedDate
          ? { ...extended, dueDate: extended.expectedDate }
          : null;
        const next =
          expected && (!original || expected.dueDate < original.dueDate) ? expected : original;
        const zero = new Prisma.Decimal(0);
        return {
          contracts,
          rentSummary: {
            contractId: contract.id,
            currency: contract.currency,
            balanceDue: rentBalance(
              due._sum.amountDue ?? zero,
              due._sum.amountPaid ?? zero,
            ).toFixed(2),
            nextDue: next
              ? {
                  date: next.dueDate,
                  amount: rentBalance(next.amountDue, next.amountPaid).toFixed(2),
                }
              : null,
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
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
      rentSummary,
      unresolvedCount,
      pendingAcknowledgements,
      contracts: contracts.map(({ tenant, amendments, ...row }) => ({
        ...row,
        monthlyRent: effectiveRent(
          row.monthlyRent,
          row.currency,
          amendments,
          calendarDate(windows.now),
        ),
        lateRequestLimits: tenant,
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
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 86400000);
    const windows = rentWindows(now);
    const result = await prisma.$transaction(
      async (tx) => {
        const [
          units,
          spaceGroups,
          requestGroups,
          awaitingManager,
          deadlines,
          payments,
          expenses,
          monthlyReceipts,
          deposits,
          activity,
        ] = await Promise.all([
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
            select: {
              currency: true,
              amountDue: true,
              amountPaid: true,
              status: true,
              dueDate: true,
              expectedDate: true,
              contract: { select: { status: true } },
            },
          }),
          tx.expense.groupBy({
            by: ['currency'],
            where: { managerId: manager.id, void: { is: null } },
            _sum: { amount: true },
          }),
          tx.paymentReceipt.groupBy({
            by: ['currency'],
            where: {
              payment: {
                contract: { ...contractScope, status: { notIn: ['DRAFT', 'CANCELLED'] } },
              },
              paidAt: { gte: windows.monthStart, lte: windows.now },
            },
            _sum: { amount: true },
          }),
          tx.contract.findMany({
            where: {
              ...contractScope,
              status: { notIn: ['DRAFT', 'CANCELLED'] },
              depositEntries: { some: {} },
            },
            select: {
              currency: true,
              depositAmount: true,
              status: true,
              depositEntries: {
                select: {
                  type: true,
                  amount: true,
                  category: true,
                  events: {
                    orderBy: { sequence: 'asc' },
                    select: { action: true, amount: true, category: true },
                  },
                },
              },
            },
          }),
          managerDashboardActivity(tx, request.user, now),
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
        const liabilities = new Map<
          string,
          {
            held: Prisma.Decimal;
            refundable: Prisma.Decimal;
            reserved: Prisma.Decimal;
            disputed: number;
            reconciliationRequired: number;
          }
        >();
        for (const contract of deposits ?? []) {
          const balance = depositBalance(
            contract.depositEntries ?? [],
            contract.depositAmount,
            contract.status,
          );
          const zero = new Prisma.Decimal(0);
          const row = liabilities.get(contract.currency) ?? {
            held: zero,
            refundable: zero,
            reserved: zero,
            disputed: 0,
            reconciliationRequired: 0,
          };
          if (balance.reconciled) {
            row.held = row.held.plus(balance.held);
            row.refundable = row.refundable.plus(balance.refundable);
            row.reserved = row.reserved.plus(balance.reserved);
          } else row.reconciliationRequired++;
          if (balance.disputed) row.disputed++;
          liabilities.set(contract.currency, row);
        }
        const spaces = spaceGroups.reduce((sum, g) => sum + g._count._all, 0);
        const [overdueDeadlines, approachingDeadlines] = await Promise.all([
          tx.request.count({ where: { ...open, decisionDueAt: { lt: now } } }),
          tx.request.count({ where: { ...open, decisionDueAt: { gte: now, lte: horizon } } }),
        ]);
        return {
          deadlineSummary: { overdue: overdueDeadlines, approaching: approachingDeadlines },
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
          activity,
          rentSummary: rentDashboardTotals(
            payments.filter(
              (payment) =>
                openRentContractStatuses.some((status) => status === payment.contract.status) &&
                payment.amountPaid.lt(payment.amountDue),
            ),
            monthlyReceipts,
            windows,
          ),
          financialRecords: [...totals.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, row]) => ({
              currency,
              ...Object.fromEntries(
                Object.entries(row).map(([key, amount]) => [key, amount.toFixed(2)]),
              ),
            })),
          financialBasis:
            'Operational totals across all dates. Recorded expenses can include unpaid costs. Each currency appears separately.',
          depositLiability: liabilities.size
            ? [...liabilities]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([currency, row]) => ({
                  currency,
                  held: row.held.toFixed(2),
                  refundable: row.refundable.toFixed(2),
                  reserved: row.reserved.toFixed(2),
                  disputed: row.disputed,
                  reconciliationRequired: row.reconciliationRequired,
                }))
            : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    return result;
  });
};
