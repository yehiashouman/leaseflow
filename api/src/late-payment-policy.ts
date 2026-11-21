import { z } from 'zod';
import { anniversary, calendarDate, dubaiMidnight } from './business-calendar.js';

export const latePaymentInput = z
  .object({ paymentId: z.string().min(1).max(191), requestedDate: z.iso.date() })
  .strict();
export const latePaymentSnapshot = latePaymentInput.extend({ originalDate: z.iso.date() });
export const latePaymentDecision = z
  .object({ originalDate: z.iso.date(), expectedDate: z.iso.date().nullable() })
  .strict();

const dayMilliseconds = 86_400_000;
export const dateLabel = (date: Date) => date.toISOString().slice(0, 10);
export const shiftDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * dayMilliseconds);

export function latePaymentDates(
  dueDate: Date,
  limits: { lateRequestWindowDays: number; maxLateExtensionDays: number },
) {
  const due = calendarDate(dueDate);
  return {
    originalDate: dateLabel(due),
    opensAt: dubaiMidnight(
      shiftDays(due, -Math.max(0, Math.min(10, limits.lateRequestWindowDays))),
    ),
    closesAt: dubaiMidnight(due),
    earliestDate: dateLabel(shiftDays(due, 1)),
    latestDate: dateLabel(shiftDays(due, Math.max(0, Math.min(5, limits.maxLateExtensionDays)))),
  };
}

export function nextLateApproval(approvedAt: Date) {
  return dubaiMidnight(anniversary(calendarDate(approvedAt), 6));
}

export function latePaymentDecisionMetadata(value: unknown) {
  return z.object({ latePayment: latePaymentDecision }).safeParse(value).data?.latePayment;
}
