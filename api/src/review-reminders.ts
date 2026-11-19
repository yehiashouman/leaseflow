import { calendarDate } from './business-calendar.js';
import { prisma } from './db.js';
import { queueRecordNotices } from './notice-data.js';

export async function sendDeferredReviewReminder(now = new Date()) {
  const today = calendarDate(now);
  return prisma.$transaction(
    async (tx) => {
      const [review] = await tx.$queryRaw<
        { id: string; deferredUntil: Date; contractId: string }[]
      >`
      SELECT r.id, r.deferredUntil, r.contractId
      FROM ContractReview r
      WHERE r.reviewedAt IS NULL AND r.decision = 'DEFERRED'
        AND r.deferredReminderSentAt IS NULL AND r.deferredUntil <= ${today}
        AND EXISTS (
          SELECT 1 FROM Contract c
          JOIN RentalSpace s ON s.id = c.rentalSpaceId
          JOIN Unit u ON u.id = s.unitId
          JOIN LeasingManagerProfile m ON m.id = u.managerId
          JOIN TenantProfile t ON t.id = c.tenantId AND t.managerId = m.id
          JOIN User usr ON usr.id = m.userId AND usr.status = 'ACTIVE'
          WHERE c.id = r.contractId AND c.rentalSpaceId = r.rentalSpaceId
            AND c.timezone = 'Asia/Dubai'
            AND c.status IN ('ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING')
            AND (r.sameSpaceSince IS NULL OR r.sameSpaceSince = c.startDate)
            AND (c.endDate IS NULL OR c.endDate >= r.deferredUntil)
        )
      ORDER BY r.deferredUntil, r.id
      LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!review) return false;
      const contract = await tx.contract.findUniqueOrThrow({
        where: { id: review.contractId },
        select: {
          rentalSpace: { select: { unit: { select: { manager: { select: { userId: true } } } } } },
        },
      });

      const event = await tx.contractReviewEvent.create({
        data: {
          reviewId: review.id,
          kind: 'DEFERRED_REMINDER',
          actorName: 'System',
          note: 'The deferred contract review is due.',
          deferredUntil: review.deferredUntil,
          createdAt: now,
        },
      });
      await tx.notification.create({
        data: {
          recipientUserId: contract.rentalSpace.unit.manager.userId,
          reviewEventId: event.id,
        },
      });
      await queueRecordNotices(tx, { reviewEventId: event.id });
      await tx.contractReview.update({
        where: { id: review.id },
        data: { deferredReminderSentAt: now },
      });
      return true;
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
