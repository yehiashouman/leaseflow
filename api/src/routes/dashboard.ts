import type { FastifyPluginAsync } from 'fastify';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/manager', { preHandler: allowRoles('LEASING_MANAGER') }, async (request) => {
    const manager = await prisma.leasingManagerProfile.findUniqueOrThrow({ where: { userId: request.user.sub } });
    const [units, spaces, occupied, openRequests, overdue, deposits, income, expenses] = await Promise.all([
      prisma.unit.count({ where: { managerId: manager.id } }),
      prisma.rentalSpace.count({ where: { unit: { managerId: manager.id }, enabled: true } }),
      prisma.rentalSpace.count({ where: { unit: { managerId: manager.id }, status: { in: ['OCCUPIED', 'PARTIAL'] } } }),
      prisma.request.count({ where: { contract: { tenant: { managerId: manager.id } }, status: { notIn: ['ACCEPTED', 'CLOSED', 'REJECTED'] } } }),
      prisma.payment.aggregate({ where: { contract: { tenant: { managerId: manager.id } }, status: 'LATE' }, _sum: { amountDue: true } }),
      prisma.contract.aggregate({ where: { tenant: { managerId: manager.id }, status: { not: 'CLOSED' } }, _sum: { depositAmount: true } }),
      prisma.payment.aggregate({ where: { contract: { tenant: { managerId: manager.id } }, status: 'PAID' }, _sum: { amountPaid: true } }),
      prisma.expense.aggregate({ where: { managerId: manager.id }, _sum: { amount: true } }),
    ]);
    return { units, spaces, occupied, vacant: spaces - occupied, openRequests, overdue: overdue._sum.amountDue ?? 0, depositsHeld: deposits._sum.depositAmount ?? 0, income: income._sum.amountPaid ?? 0, expenses: expenses._sum.amount ?? 0 };
  });
};
