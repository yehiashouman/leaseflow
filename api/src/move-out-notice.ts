import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { calendarDate, monthStart } from './business-calendar.js';
import { effectiveRent } from './rent-amendments.js';

const day = 86_400_000;
const stamp = (date: Date) => date.toISOString().slice(0, 10);

export function noticePreview(
  submittedAt: Date,
  desiredDate: string,
  contract: {
    noticeDays: number;
    monthlyRent: Prisma.Decimal;
    currency: string;
    amendments: { effectiveDate: Date; confirmedAt: Date | null; changes: unknown }[];
  },
  held: Prisma.Decimal,
  reserved: Prisma.Decimal,
) {
  const submittedDay = calendarDate(submittedAt);
  const desired = new Date(desiredDate + 'T00:00:00Z');
  const earliest = new Date(submittedDay.getTime() + Math.max(contract.noticeDays - 1, 0) * day);
  let total = new Prisma.Decimal(0);
  const months = [];
  for (let cursor = desired.getTime() + day; cursor <= earliest.getTime();) {
    const firstDay = new Date(cursor);
    const month = monthStart(firstDay);
    const next = monthStart(firstDay, 1);
    const end = Math.min(next.getTime(), earliest.getTime() + day);
    const uncoveredDays = (end - cursor) / day;
    const daysInMonth = (next.getTime() - month.getTime()) / day;
    const rent = effectiveRent(contract.monthlyRent, contract.currency, contract.amendments, month);
    total = total.plus(rent.times(uncoveredDays).div(daysInMonth));
    months.push({
      month: stamp(month).slice(0, 7),
      uncoveredDays,
      daysInMonth,
      monthlyRent: rent.toFixed(2),
    });
    cursor = end;
  }
  const available = Prisma.Decimal.max(held.minus(reserved), 0);
  const proposed = Prisma.Decimal.min(
    total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    available,
  );
  return {
    desiredDate,
    submittedDay: stamp(submittedDay),
    earliestPenaltyFreeDate: stamp(earliest),
    noticeDays: contract.noticeDays,
    missingDays: Math.max(0, (earliest.getTime() - desired.getTime()) / day),
    currency: contract.currency,
    held: held.toFixed(2),
    reserved: reserved.toFixed(2),
    proposedDeduction: proposed.toFixed(2),
    projectedRefund: available.minus(proposed).toFixed(2),
    months,
  };
}

export function noticeFingerprint(contractId: string, preview: ReturnType<typeof noticePreview>) {
  return createHash('sha256').update(JSON.stringify({ contractId, preview })).digest('hex');
}
