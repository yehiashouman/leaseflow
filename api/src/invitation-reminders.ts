import { queueAccountEmail } from './account-email.js';
import { prisma } from './db.js';

export const invitationReminderLeadMs = 2 * 86400000;

export async function queueInvitationReminderOnce(now = new Date()) {
  const horizon = new Date(now.getTime() + invitationReminderLeadMs);
  return prisma.$transaction(
    async (tx) => {
      const [invitation] = await tx.$queryRaw<{ id: string; email: string }[]>`
        SELECT i.id, i.email FROM TenantInvitation i
        WHERE i.acceptedAt IS NULL AND i.revokedAt IS NULL
          AND i.expiresAt > ${now} AND i.expiresAt <= ${horizon}
          AND EXISTS (
            SELECT 1 FROM LeasingManagerProfile m
            JOIN User usr ON usr.id = m.userId AND usr.status = 'ACTIVE'
            WHERE m.id = i.managerId
          )
          AND NOT EXISTS (
            SELECT 1 FROM OutboundEmail mail WHERE mail.invitationReminderId = i.id
          )
        ORDER BY i.expiresAt, i.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!invitation) return false;
      await queueAccountEmail(tx, {
        invitationReminderId: invitation.id,
        recipient: invitation.email,
        template: 'TENANT_INVITATION_REMINDER',
        subject: 'Your LeaseFlow invitation expires soon',
        text: 'Your LeaseFlow tenant invitation expires soon. To accept, use the link in your latest invitation email.',
      });
      return true;
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
