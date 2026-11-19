import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { accountConfig, decryptMail } from './account-policy.js';
import { z } from 'zod';
import { invitationReminderLeadMs, queueInvitationReminderOnce } from './invitation-reminders.js';
const payloadSchema = z
  .object({ subject: z.string().min(1).max(200), text: z.string().min(1).max(10000) })
  .strict();
const transport = nodemailer.createTransport({
  host: accountConfig.SMTP_HOST,
  port: accountConfig.SMTP_PORT,
  secure: accountConfig.SMTP_SECURE === 'true',
  requireTLS: accountConfig.SMTP_SECURE !== 'true',
  auth: accountConfig.SMTP_USER
    ? { user: accountConfig.SMTP_USER, pass: accountConfig.SMTP_PASSWORD }
    : undefined,
  connectionTimeout: 10000,
  socketTimeout: 20000,
  disableFileAccess: true,
  disableUrlAccess: true,
  logger: false,
  debug: false,
});
export type EmailSender = (input: {
  id: string;
  recipient: string;
  subject: string;
  text: string;
}) => Promise<string>;
export const sendAccountMail: EmailSender = async (input) => {
  const result = await transport.sendMail({
    from: accountConfig.MAIL_FROM,
    to: input.recipient,
    subject: input.subject,
    text: input.text,
    messageId: '<leaseflow-' + input.id + '@' + accountConfig.MAIL_FROM.split('@')[1] + '>',
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  if (!result.accepted?.length) throw new Error('Email rejected');
  return String(result.messageId).slice(0, 191);
};
export async function runEmailWorkerOnce(sender: EmailSender = sendAccountMail, now = new Date()) {
  const job = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM OutboundEmail WHERE (status = 'QUEUED' AND nextAttemptAt <= ${now})
      OR (status = 'RUNNING' AND leaseExpiresAt <= ${now}) ORDER BY createdAt,id LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
      if (!rows[0]) return false;
      const current = await tx.outboundEmail.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (current.status === 'RUNNING') {
        await tx.outboundEmailAttempt.updateMany({
          where: { emailId: current.id, status: 'RUNNING' },
          data: { status: 'FAILED', failureCode: 'DELIVERY_INTERRUPTED', finishedAt: now },
        });
      }
      if (current.attempts >= 3) {
        await tx.outboundEmail.update({
          where: { id: current.id },
          data: {
            status: 'FAILED',
            failureCode: 'DELIVERY_INTERRUPTED',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        return null;
      }
      if (current.invitationReminderId) {
        const invitation = await tx.tenantInvitation.findFirst({
          where: {
            id: current.invitationReminderId,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
            manager: { user: { status: 'ACTIVE' } },
          },
          select: { expiresAt: true },
        });
        const reminderAt = invitation
          ? new Date(invitation.expiresAt.getTime() - invitationReminderLeadMs)
          : null;
        if (!reminderAt || reminderAt > now) {
          await tx.outboundEmail.update({
            where: { id: current.id },
            data: {
              status: reminderAt ? 'QUEUED' : 'FAILED',
              ...(reminderAt ? { nextAttemptAt: reminderAt } : {}),
              failureCode: reminderAt ? null : 'INVITATION_NO_LONGER_ACTIVE',
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });
          return null;
        }
      }
      const leaseToken = randomUUID();
      await tx.outboundEmailAttempt.create({
        data: { leaseToken, emailId: current.id, number: current.attempts + 1, startedAt: now },
      });
      await tx.outboundEmail.update({
        where: { id: current.id },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + 60000),
        },
      });
      return { ...current, attempts: current.attempts + 1, leaseToken };
    },
    { isolationLevel: 'ReadCommitted' },
  );
  if (!job) return job === null;
  const where = { id: job.id, status: 'RUNNING' as const, leaseToken: job.leaseToken };
  let providerId: string | null = null;
  try {
    const payload = payloadSchema.parse(decryptMail(job.encryptedPayload));
    providerId = await sender({ id: job.id, recipient: job.recipient, ...payload });
  } catch {
    // Persist a safe failure code without recording the provider exception or message payload.
  }
  const finishedAt = new Date(Math.max(Date.now(), now.getTime()));
  const failed = providerId === null;
  const failureCode = failed ? 'DELIVERY_UNAVAILABLE' : null;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.outboundEmail.updateMany({
      where,
      data: {
        status: failed ? (job.attempts >= 3 ? 'FAILED' : 'QUEUED') : 'COMPLETE',
        failureCode,
        ...(failed
          ? { nextAttemptAt: new Date(now.getTime() + job.attempts * 30000) }
          : {
              providerId,
              deliveredAt: finishedAt,
            }),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count)
      await tx.outboundEmailAttempt.update({
        where: { leaseToken: job.leaseToken },
        data: { status: failed ? 'FAILED' : 'COMPLETE', failureCode, providerId, finishedAt },
      });
  });
  return true;
}

export function emailWorker(onError: () => void) {
  let timer: ReturnType<typeof setInterval> | undefined, current: Promise<unknown> | undefined;
  const tick = () => {
    if (!current)
      current = Promise.allSettled([queueInvitationReminderOnce(), runEmailWorkerOnce()])
        .then((results) => {
          for (const result of results) if (result.status === 'rejected') onError();
        })
        .finally(() => {
          current = undefined;
        });
  };
  return {
    start() {
      if (!timer && accountConfig.ACCOUNT_EMAIL_ENABLED === 'true') {
        timer = setInterval(tick, 2000);
        timer.unref();
        tick();
      }
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await current;
      transport.close();
    },
  };
}
