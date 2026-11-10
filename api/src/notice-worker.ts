import { randomUUID } from 'node:crypto';
import { Prisma, type NoticeChannel } from '@prisma/client';
import { z } from 'zod';
import twilio from 'twilio';
import { prisma } from './db.js';
import { env } from './config.js';
import { decryptMail } from './account-policy.js';
import { notificationScope } from './notification-data.js';
import { noticeConfig, callbackUrl, NoticeSendError } from './notice-policy.js';
import { sendAccountMail } from './email-worker.js';
const payloadSchema = z
  .object({
    format: z.enum(['case-notice-v1', 'record-notice-v1']),
    url: z.url(),
    subject: z.string().min(1).max(200),
    text: z.string().min(1).max(10000),
  })
  .strict();
export type NoticeSender = (input: {
  id: string;
  channel: NoticeChannel;
  language: string;
  address: string;
  payload: z.infer<typeof payloadSchema>;
}) => Promise<{ providerId: string; templateId?: string }>;
export const sendNotice: NoticeSender = async (input) => {
  if (input.channel === 'EMAIL') {
    if (!z.email().safeParse(input.address).success) throw new NoticeSendError('RECIPIENT_INVALID');
    try {
      return {
        providerId: await sendAccountMail({
          id: input.id,
          recipient: input.address,
          subject: input.payload.subject,
          text: input.payload.text,
        }),
      };
    } catch (cause) {
      const code = Number((cause as { responseCode?: number }).responseCode);
      if (code >= 400 && code < 500)
        throw new NoticeSendError('PROVIDER_TEMPORARY_REJECTION', true);
      if (code >= 500 || (cause instanceof Error && cause.message === 'Email rejected'))
        throw new NoticeSendError('PROVIDER_REJECTED');
      throw new NoticeSendError('PROVIDER_RESULT_UNKNOWN', false, true);
    }
  }
  if (!/^\+[1-9]\d{7,14}$/.test(input.address)) throw new NoticeSendError('RECIPIENT_INVALID');
  const templateId =
    input.language === 'ar'
      ? noticeConfig.WHATSAPP_CONTENT_SID_AR
      : noticeConfig.WHATSAPP_CONTENT_SID_EN;
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !templateId ||
    !noticeConfig.WHATSAPP_FROM
  )
    throw new NoticeSendError('PROVIDER_NOT_CONFIGURED');
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, {
      timeout: 15000,
      autoRetry: false,
      logLevel: 'error',
    });
    const result = await client.messages.create({
      from: noticeConfig.WHATSAPP_FROM,
      to: 'whatsapp:' + input.address,
      contentSid: templateId,
      contentVariables: JSON.stringify({ '1': input.payload.url }),
      statusCallback: callbackUrl(input.id),
    });
    return { providerId: result.sid, templateId };
  } catch (cause) {
    const status = Number((cause as { status?: number }).status);
    if (status === 429) throw new NoticeSendError('PROVIDER_THROTTLED', true);
    if (status >= 400 && status < 500) throw new NoticeSendError('PROVIDER_REJECTED');
    throw new NoticeSendError('PROVIDER_RESULT_UNKNOWN', false, true);
  }
};
export const configuredNoticeChannels = (): NoticeChannel[] =>
  env.NODE_ENV === 'production'
    ? []
    : [
        ...(noticeConfig.CASE_EMAIL_ENABLED === 'true' ? ['EMAIL' as const] : []),
        ...(noticeConfig.CASE_WHATSAPP_ENABLED === 'true' ? ['WHATSAPP' as const] : []),
      ];
export async function runNoticeWorkerOnce(
  options: { sender?: NoticeSender; channels?: NoticeChannel[]; now?: Date } = {},
) {
  const sender = options.sender ?? sendNotice,
    now = options.now ?? new Date(),
    channels =
      env.NODE_ENV === 'production' ? [] : (options.channels ?? configuredNoticeChannels());
  const job = await prisma.$transaction(
    async (tx) => {
      const enabled = channels.length
        ? Prisma.sql`channel IN (${Prisma.join(channels)})`
        : Prisma.sql`FALSE`;
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM NoticeDelivery WHERE ((state IN ('PAUSED','QUEUED') AND nextAttemptAt <= ${now} AND ${enabled})
      OR (state = 'RUNNING' AND leaseExpiresAt <= ${now})) ORDER BY createdAt,id LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
      if (!rows[0]) return null;
      const current = await tx.noticeDelivery.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (current.state === 'RUNNING') {
        await tx.noticeDelivery.update({
          where: { id: current.id },
          data: {
            state: 'UNKNOWN',
            failureCode: 'WORKER_INTERRUPTED',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        await tx.noticeAttempt.updateMany({
          where: { deliveryId: current.id, number: current.attempts, state: 'RUNNING' },
          data: { state: 'UNKNOWN', failureCode: 'WORKER_INTERRUPTED', finishedAt: now },
        });
        return { interrupted: true as const };
      }
      if (current.attempts >= 3) {
        await tx.noticeDelivery.update({
          where: { id: current.id },
          data: {
            state: 'FAILED',
            failureCode: 'ATTEMPT_LIMIT',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        return { interrupted: true as const };
      }
      const leased = await tx.noticeDelivery.update({
        where: { id: current.id },
        data: {
          state: 'RUNNING',
          attempts: { increment: 1 },
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 90000),
          failureCode: null,
        },
      });
      await tx.noticeAttempt.create({
        data: { deliveryId: leased.id, number: leased.attempts, startedAt: now },
      });
      return { interrupted: false as const, leased };
    },
    { isolationLevel: 'ReadCommitted' },
  );
  if (!job) return false;
  if (job.interrupted) return true;
  const row = job.leased;
  const where: Prisma.NoticeDeliveryWhereInput = {
    id: row.id,
    OR: [
      { state: 'RUNNING', leaseToken: row.leaseToken },
      { state: 'UNKNOWN', providerId: null, attempts: row.attempts },
    ],
  };
  const attempt = { deliveryId: row.id, number: row.attempts };
  let sendStarted = false;
  let providerResult: { providerId: string; templateId?: string } | undefined;
  try {
    const recipient = z
      .object({ address: z.string().min(1).max(320) })
      .strict()
      .parse(decryptMail(row.recipientCipher ?? ''));
    const payload = payloadSchema.parse(decryptMail(row.payloadCipher));
    const user = await prisma.user.findUnique({
      where: { id: row.recipientUserId },
      select: {
        id: true,
        role: true,
        status: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        notifyEmail: true,
        notifyWhatsapp: true,
      },
    });
    const eligible =
      user &&
      user.status === 'ACTIVE' &&
      (row.channel === 'EMAIL'
        ? user.notifyEmail && user.emailVerifiedAt && user.email === recipient.address
        : user.notifyWhatsapp && user.phoneVerifiedAt && user.phone === recipient.address) &&
      (await prisma.notification.findFirst({
        where: {
          id: row.notificationId,
          ...notificationScope({ sub: user.id, role: user.role }),
        },
        select: { id: true },
      }));
    const alreadyDelivered = await prisma.noticeDelivery.findFirst({
      where: {
        notificationId: row.notificationId,
        channel: row.channel,
        id: { not: row.id },
        state: { in: ['ACCEPTED', 'SENT', 'DELIVERED', 'READ'] },
      },
      select: { id: true },
    });
    if (!eligible || alreadyDelivered) {
      const failureCode = alreadyDelivered
        ? 'ANOTHER_ATTEMPT_ACCEPTED'
        : 'RECIPIENT_NO_LONGER_ELIGIBLE';
      await prisma.$transaction(async (tx) => {
        await tx.noticeDelivery.updateMany({
          where,
          data: { state: 'SUPPRESSED', failureCode, leaseToken: null, leaseExpiresAt: null },
        });
        await tx.noticeAttempt.update({
          where: { deliveryId_number: attempt },
          data: { state: 'SUPPRESSED', failureCode, finishedAt: now },
        });
      });
      return true;
    }
    sendStarted = true;
    const result = await sender({
      id: row.id,
      channel: row.channel,
      language: row.language,
      address: recipient.address,
      payload,
    });
    providerResult = result;
    if (!result.providerId || result.providerId.length > 191)
      throw new NoticeSendError('PROVIDER_RESULT_INVALID', false, true);
    await prisma.$transaction(async (tx) => {
      await tx.noticeDelivery.updateMany({
        where,
        data: {
          state: 'ACCEPTED',
          providerId: result.providerId,
          providerTemplateId: result.templateId,
          acceptedAt: now,
          failureCode: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      await tx.noticeAttempt.update({
        where: { deliveryId_number: attempt },
        data: { state: 'ACCEPTED', providerId: result.providerId, finishedAt: now },
      });
    });
  } catch (cause) {
    const failure =
      cause instanceof NoticeSendError
        ? cause
        : new NoticeSendError('DELIVERY_PROCESSING_FAILED', false, sendStarted);
    const state = failure.ambiguous
      ? ('UNKNOWN' as const)
      : failure.retryable && row.attempts < 3
        ? ('QUEUED' as const)
        : ('FAILED' as const);
    await prisma.$transaction(async (tx) => {
      await tx.noticeDelivery.updateMany({
        where,
        data: {
          state,
          failureCode: failure.code,
          nextAttemptAt: new Date(now.getTime() + row.attempts * 30000),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      await tx.noticeAttempt.update({
        where: { deliveryId_number: attempt },
        data: {
          state: failure.ambiguous ? 'UNKNOWN' : 'FAILED',
          failureCode: failure.code,
          providerId:
            providerResult?.providerId && providerResult.providerId.length <= 191
              ? providerResult.providerId
              : undefined,
          finishedAt: now,
        },
      });
    });
  }
  return true;
}
export function noticeWorker(onError: () => void) {
  let timer: ReturnType<typeof setInterval> | undefined, current: Promise<unknown> | undefined;
  const tick = () => {
    if (!current)
      current = runNoticeWorkerOnce()
        .catch(onError)
        .finally(() => {
          current = undefined;
        });
  };
  return {
    start() {
      if (!timer) {
        timer = setInterval(tick, 1000);
        timer.unref();
        tick();
      }
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await current;
    },
  };
}
