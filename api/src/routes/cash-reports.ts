import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { calendarDate, dubaiMidnight, monthStart } from '../business-calendar.js';
import { caseContractScope } from '../case-data.js';
import { prisma } from '../db.js';
import { csvCell } from '../expense-policy.js';

const maxRows = 10_000;
const currency = z.enum(['AED', 'USD']);
const day = (date: Date) => date.toISOString().slice(0, 10);
const scope = { unitId: true, rentalSpaceId: true, contractId: true } as const;
type Line = {
  id: string;
  date: string;
  kind: 'RENT_RECEIPT' | 'RENT_REVERSAL' | 'EXPENSE_RECOVERY' | 'EXPENSE_PAYMENT';
  amount: Prisma.Decimal;
  category: string | null;
  unitId: string | null;
  rentalSpaceId: string | null;
  contractId: string | null;
};
type Totals = {
  rent: Prisma.Decimal;
  rentReversals: Prisma.Decimal;
  recoveries: Prisma.Decimal;
  ownerRent: Prisma.Decimal;
  otherExpenses: Prisma.Decimal;
};
function totals() {
  const zero = new Prisma.Decimal(0);
  return {
    rent: zero,
    rentReversals: zero,
    recoveries: zero,
    ownerRent: zero,
    otherExpenses: zero,
  };
}
function add(total: Totals, line: Line) {
  const field =
    line.kind === 'RENT_RECEIPT'
      ? 'rent'
      : line.kind === 'RENT_REVERSAL'
        ? 'rentReversals'
        : line.kind === 'EXPENSE_RECOVERY'
          ? 'recoveries'
          : line.category === 'OWNER_RENT'
            ? 'ownerRent'
            : 'otherExpenses';
  total[field] = total[field].plus(line.amount);
}
function amounts(total: Totals) {
  return {
    rent: total.rent.toFixed(2),
    rentReversals: total.rentReversals.toFixed(2),
    recoveries: total.recoveries.toFixed(2),
    ownerRent: total.ownerRent.toFixed(2),
    otherExpenses: total.otherExpenses.toFixed(2),
    cashResult: total.rent
      .minus(total.rentReversals)
      .plus(total.recoveries)
      .minus(total.ownerRent)
      .minus(total.otherExpenses)
      .toFixed(2),
  };
}

export const cashReportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', allowRoles('LEASING_MANAGER'));
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  async function report(request: FastifyRequest) {
    const filter = z
      .strictObject({
        month: z
          .string()
          .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
          .default(day(calendarDate(new Date())).slice(0, 7)),
        currency: currency.default('AED'),
        unitId: z.string().min(1).max(191).optional(),
        contractId: z.string().min(1).max(191).optional(),
      })
      .parse(request.query);
    const start = new Date(filter.month + '-01');
    const end = monthStart(start, 1);
    const dateOnly = { gte: start, lt: end };
    const instant = { gte: dubaiMidnight(start), lt: dubaiMidnight(end) };
    return prisma.$transaction(
      async (tx) => {
        const manager = await tx.leasingManagerProfile.findUnique({
          where: { userId: request.user.sub },
          select: { id: true },
        });
        if (!manager) throw app.httpErrors.forbidden('Manager profile required.');
        const units = await tx.unit.findMany({
          where: { managerId: manager.id, ...(filter.unitId ? { id: filter.unitId } : {}) },
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        if (filter.unitId && !units.length) throw app.httpErrors.notFound('Unit not found.');
        const contracts = {
          ...caseContractScope(request.user),
          status: { notIn: ['DRAFT', 'CANCELLED'] as ('DRAFT' | 'CANCELLED')[] },
          ...(filter.unitId
            ? { rentalSpace: { unitId: filter.unitId, unit: { managerId: manager.id } } }
            : {}),
          ...(filter.contractId ? { id: filter.contractId } : {}),
        } satisfies Prisma.ContractWhereInput;
        if (filter.contractId && !(await tx.contract.count({ where: contracts })))
          throw app.httpErrors.notFound('Contract not found.');
        const expenses = {
          managerId: manager.id,
          currency: filter.currency,
          void: null,
          ...(filter.unitId ? { unitId: filter.unitId } : {}),
          ...(filter.contractId ? { contractId: filter.contractId } : {}),
        } satisfies Prisma.ExpenseWhereInput;
        const [receipts, reversals, paid, recovered, undated, shares] = await Promise.all([
          tx.paymentReceipt.findMany({
            where: { paidAt: instant, currency: filter.currency, payment: { contract: contracts } },
            select: {
              id: true,
              paidAt: true,
              amount: true,
              payment: {
                select: {
                  contractId: true,
                  contract: {
                    select: {
                      rentalSpaceId: true,
                      rentalSpace: { select: { unitId: true } },
                    },
                  },
                },
              },
            },
            take: maxRows + 1,
          }),
          tx.paymentReceiptEvent.findMany({
            where: {
              kind: 'REVERSE',
              createdAt: instant,
              receipt: { currency: filter.currency, payment: { contract: contracts } },
            },
            select: {
              id: true,
              createdAt: true,
              receipt: {
                select: {
                  amount: true,
                  payment: {
                    select: {
                      contractId: true,
                      contract: {
                        select: {
                          rentalSpaceId: true,
                          rentalSpace: { select: { unitId: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
            take: maxRows + 1,
          }),
          tx.expense.findMany({
            where: { ...expenses, paidOn: dateOnly },
            select: { id: true, paidOn: true, amount: true, category: true, ...scope },
            take: maxRows + 1,
          }),
          tx.expenseRecovery.findMany({
            where: { paidAt: instant, expense: expenses },
            select: {
              id: true,
              paidAt: true,
              amount: true,
              expense: { select: { category: true, ...scope } },
            },
            take: maxRows + 1,
          }),
          tx.expense.count({ where: { ...expenses, incurredAt: dateOnly, paidOn: null } }),
          filter.contractId
            ? []
            : tx.expenseSharedAllocation.findMany({
                where: {
                  expense: {
                    managerId: manager.id,
                    currency: filter.currency,
                    void: null,
                    paidOn: dateOnly,
                  },
                  rentalSpace: {
                    unit: { managerId: manager.id },
                    ...(filter.unitId ? { unitId: filter.unitId } : {}),
                  },
                },
                select: {
                  amount: true,
                  expenseId: true,
                  rentalSpaceId: true,
                  expense: { select: { sharedPeriod: true, paidOn: true, category: true } },
                  rentalSpace: {
                    select: { name: true, unitId: true, unit: { select: { name: true } } },
                  },
                },
                orderBy: [{ expenseId: 'asc' }, { rentalSpaceId: 'asc' }],
                take: maxRows + 1,
              }),
        ]);
        if (
          receipts.length + reversals.length + paid.length + recovered.length + shares.length >
          maxRows
        )
          throw app.httpErrors.conflict('Filter by unit or contract to fit the report row limit.');
        const lines: Line[] = [
          ...receipts.map(({ id, paidAt, amount, payment }) => ({
            id,
            date: day(calendarDate(paidAt)),
            kind: 'RENT_RECEIPT' as const,
            amount,
            category: null,
            contractId: payment.contractId,
            rentalSpaceId: payment.contract.rentalSpaceId,
            unitId: payment.contract.rentalSpace.unitId,
          })),
          ...reversals.map(({ id, createdAt, receipt }) => ({
            id,
            date: day(calendarDate(createdAt)),
            kind: 'RENT_REVERSAL' as const,
            amount: receipt.amount,
            category: null,
            contractId: receipt.payment.contractId,
            rentalSpaceId: receipt.payment.contract.rentalSpaceId,
            unitId: receipt.payment.contract.rentalSpace.unitId,
          })),
          ...paid.map(({ paidOn, ...entry }) => ({
            ...entry,
            date: day(paidOn!),
            kind: 'EXPENSE_PAYMENT' as const,
          })),
          ...recovered.map(({ paidAt, expense, ...entry }) => ({
            ...entry,
            ...expense,
            date: day(calendarDate(paidAt)),
            kind: 'EXPENSE_RECOVERY' as const,
          })),
        ];
        lines.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        const total = totals();
        const unitNames = new Map(units.map(({ id, name }) => [id, name]));
        const unitTotals = new Map<string | null, Totals>();
        const spaceTotals = new Map<string, Totals>();
        for (const line of lines) {
          add(total, line);
          const unit = unitTotals.get(line.unitId) ?? totals();
          add(unit, line);
          unitTotals.set(line.unitId, unit);
          if (!line.rentalSpaceId) continue;
          const space = spaceTotals.get(line.rentalSpaceId) ?? totals();
          add(space, line);
          spaceTotals.set(line.rentalSpaceId, space);
        }
        const sharedBySpace = new Map<string, Prisma.Decimal>();
        for (const share of shares) {
          if (!spaceTotals.has(share.rentalSpaceId)) spaceTotals.set(share.rentalSpaceId, totals());
          sharedBySpace.set(
            share.rentalSpaceId,
            (sharedBySpace.get(share.rentalSpaceId) ?? new Prisma.Decimal(0)).plus(share.amount),
          );
        }
        return {
          basis: 'CASH' as const,
          timezone: 'Asia/Dubai',
          filters: filter,
          units,
          undatedExpenses: undated,
          totals: amounts(total),
          unitTotals: [...unitTotals].map(([id, total]) => ({
            id,
            name: id ? (unitNames.get(id) ?? id) : 'Without unit attribution',
            ...amounts(total),
          })),
          spaceTotals: [...spaceTotals].map(([id, total]) => {
            const direct = amounts(total);
            const shared = sharedBySpace.get(id) ?? new Prisma.Decimal(0);
            return {
              id,
              ...direct,
              sharedCosts: shared.toFixed(2),
              afterShared: new Prisma.Decimal(direct.cashResult).minus(shared).toFixed(2),
            };
          }),
          sharedCosts: shares.map((share) => ({
            expenseId: share.expenseId,
            spaceId: share.rentalSpaceId,
            spaceName: share.rentalSpace.name,
            unitId: share.rentalSpace.unitId,
            unitName: share.rentalSpace.unit.name,
            month: day(share.expense.sharedPeriod!).slice(0, 7),
            paidOn: day(share.expense.paidOn!),
            category: share.expense.category,
            amount: share.amount.toFixed(2),
          })),
          lines: lines.map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  app.get('/', report);
  app.get('/export.csv', async (request, reply) => {
    const data = await report(request);
    await prisma.auditEvent.create({
      data: {
        actorUserId: request.user.sub,
        action: 'CASH_REPORT_EXPORT',
        entityType: 'Report',
        entityId: data.filters.unitId ?? 'portfolio',
        ip: request.ip,
        newValue: { ...data.filters, records: data.lines.length },
      },
    });
    const csv = [
      [
        'Month',
        'Basis',
        'Currency',
        'Date (Dubai)',
        'Kind',
        'Source ID',
        'Amount',
        'Category',
        'Unit ID',
        'Space ID',
        'Contract ID',
        'Allocation month (Dubai)',
      ],
      ...data.lines.map((row) => [
        data.filters.month,
        data.basis,
        data.filters.currency,
        row.date,
        row.kind,
        row.id,
        row.amount,
        row.category,
        row.unitId,
        row.rentalSpaceId,
        row.contractId,
        '',
      ]),
      ...data.sharedCosts.map((row) => [
        data.filters.month,
        'ALLOCATION',
        data.filters.currency,
        row.paidOn,
        'SHARED_EXPENSE_ALLOCATION',
        row.expenseId,
        row.amount,
        row.category,
        row.unitId,
        row.spaceId,
        '',
        row.month,
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leaseflow-cash-report.csv"')
      .header('X-Content-Type-Options', 'nosniff')
      .send(csv);
  });
};
