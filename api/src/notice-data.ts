import type { Prisma } from '@prisma/client';
import { encryptMail } from './account-policy.js';
import {
  noticeConfig,
  noticeLanguage,
  noticeTemplate,
  maskNoticeRecipient,
} from './notice-policy.js';
export async function queueCaseNotices(tx: Prisma.TransactionClient, eventId: string) {
  const notices = await tx.notification.findMany({
    where: { eventId },
    select: { id: true, recipientUserId: true, event: { select: { requestId: true } } },
  });
  if (!notices.length) return;
  const recipients = await tx.user.findMany({
    where: { id: { in: notices.map((row) => row.recipientUserId) } },
    select: {
      id: true,
      status: true,
      email: true,
      phone: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      notifyEmail: true,
      notifyWhatsapp: true,
      preferredLanguage: true,
    },
  });
  const data: Prisma.NoticeDeliveryCreateManyInput[] = [];
  for (const notice of notices) {
    const user = recipients.find((row) => row.id === notice.recipientUserId);
    if (!user) continue;
    for (const channel of ['EMAIL', 'WHATSAPP'] as const) {
      if (!(channel === 'EMAIL' ? user.notifyEmail : user.notifyWhatsapp)) continue;
      const language = noticeLanguage(user.preferredLanguage, channel);
      const address = channel === 'EMAIL' ? user.email : user.phone;
      const verified = channel === 'EMAIL' ? !!user.emailVerifiedAt : !!user.phoneVerifiedAt;
      const eligible = user.status === 'ACTIVE' && verified && !!address;
      const enabled =
        channel === 'EMAIL'
          ? noticeConfig.CASE_EMAIL_ENABLED === 'true'
          : noticeConfig.CASE_WHATSAPP_ENABLED === 'true';
      data.push({
        notificationId: notice.id,
        recipientUserId: user.id,
        channel,
        template: 'CASE_UPDATED',
        language,
        recipientCipher: eligible ? encryptMail({ address }) : null,
        recipientHint: maskNoticeRecipient(channel, address),
        payloadCipher: encryptMail(noticeTemplate(language, notice.event.requestId)),
        state: !eligible ? 'SUPPRESSED' : enabled ? 'QUEUED' : 'PAUSED',
        failureCode: !eligible ? 'RECIPIENT_UNVERIFIED_OR_INACTIVE' : null,
      });
    }
  }
  if (data.length) await tx.noticeDelivery.createMany({ data, skipDuplicates: true });
}
