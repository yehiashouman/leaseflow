import { Prisma } from '@prisma/client';
import { calendarDate, dubaiMidnight, monthStart } from './business-calendar.js';

export const openRentContractStatuses = ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] as const;

export function rentWindows(now: Date) {
  const day = calendarDate(now);
  const midnight = (offset: number) => {
    const date = new Date(day);
    date.setUTCDate(date.getUTCDate() + offset);
    return dubaiMidnight(date);
  };
  return {
    today: midnight(0),
    tomorrow: midnight(1),
    afterNextWeek: midnight(8),
    monthStart: dubaiMidnight(monthStart(day)),
    now,
  };
}

export function rentBalance(amountDue: Prisma.Decimal, amountPaid: Prisma.Decimal) {
  return Prisma.Decimal.max(amountDue.minus(amountPaid), 0);
}

type RentPayment = {
  dueDate: Date;
  expectedDate?: Date | null;
  currency: string;
  amountDue: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
};

export function rentDashboardTotals(
  payments: RentPayment[],
  receipts: { currency: string; _sum: { amount: Prisma.Decimal | null } }[],
  windows: ReturnType<typeof rentWindows>,
) {
  const totals = new Map<
    string,
    Record<
      'dueToday' | 'dueNextSevenDays' | 'overdue' | 'partiallyPaid' | 'receivedThisMonth',
      Prisma.Decimal
    >
  >();
  const zero = new Prisma.Decimal(0);
  const forCurrency = (currency: string) => {
    if (!totals.has(currency))
      totals.set(currency, {
        dueToday: zero,
        dueNextSevenDays: zero,
        overdue: zero,
        partiallyPaid: zero,
        receivedThisMonth: zero,
      });
    return totals.get(currency)!;
  };
  for (const payment of payments) {
    const balance = rentBalance(payment.amountDue, payment.amountPaid);
    const row = forCurrency(payment.currency);
    const dueDate = payment.expectedDate ?? payment.dueDate;
    if (dueDate < windows.today) row.overdue = row.overdue.plus(balance);
    else if (dueDate < windows.tomorrow) row.dueToday = row.dueToday.plus(balance);
    else if (dueDate < windows.afterNextWeek)
      row.dueNextSevenDays = row.dueNextSevenDays.plus(balance);
    if (payment.amountPaid.gt(0)) row.partiallyPaid = row.partiallyPaid.plus(balance);
  }
  for (const receipt of receipts)
    forCurrency(receipt.currency).receivedThisMonth = receipt._sum.amount ?? zero;
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, row]) => ({
      currency,
      dueToday: row.dueToday.toFixed(2),
      dueNextSevenDays: row.dueNextSevenDays.toFixed(2),
      overdue: row.overdue.toFixed(2),
      partiallyPaid: row.partiallyPaid.toFixed(2),
      receivedThisMonth: row.receivedThisMonth.toFixed(2),
    }));
}
