import { z } from 'zod';
import { anniversary, calendarDate, dubaiMidnight } from './business-calendar.js';

export const roomChangeMetadata = z.object({
  preferences: z.string(),
  approvedAt: z.iso.datetime().optional(),
  extended: z.boolean().optional(),
});
export const roomChangePending = ['SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'REOPENED'] as const;
export const roomChangeNegotiationExpired =
  'Negotiation period expired. The tenant stays in the current room.';
export function roomNegotiationDeadline(date: Date) {
  return new Date(date.getTime() + 7 * 86_400_000);
}
export function nextRoomApproval(date: Date) {
  return dubaiMidnight(anniversary(calendarDate(date), 6));
}
