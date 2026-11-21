import { Prisma } from '@prisma/client';
import { monthStart } from './business-calendar.js';

export function shareExpense(amount: string, spaceIds: string[]) {
  const ids = [...new Set(spaceIds)].sort();
  if (!ids.length) return [];
  const cents = BigInt(new Prisma.Decimal(amount).times(100).toFixed(0));
  const slots = BigInt(ids.length);
  const each = cents / slots;
  const extra = cents % slots;
  return ids.map((rentalSpaceId, index) => ({
    rentalSpaceId,
    amount: new Prisma.Decimal(String(each + (BigInt(index) < extra ? 1n : 0n)))
      .dividedBy(100)
      .toFixed(2),
  }));
}

export async function monthlyExpenseAllocation(
  tx: Prisma.TransactionClient,
  managerId: string,
  links: { unitId?: string; landlordId?: string },
  incurredAt: Date,
  amount: string,
) {
  const period = monthStart(incurredAt);
  const nextDay = new Date(period.getTime() + 86_400_000);
  const spaces = await tx.rentalSpace.findMany({
    where: {
      ...(links.unitId ? { unitId: links.unitId } : {}),
      unit: { managerId, ...(links.landlordId ? { landlordId: links.landlordId } : {}) },
      contracts: {
        some: {
          startDate: { lt: nextDay },
          tenant: { managerId },
          OR: [
            { status: { in: ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] }, endDate: null },
            { status: { notIn: ['DRAFT', 'CANCELLED'] }, endDate: { gte: period } },
          ],
        },
      },
    },
    select: { id: true },
  });
  return {
    period,
    allocations: shareExpense(
      amount,
      spaces.map(({ id }) => id),
    ),
  };
}
