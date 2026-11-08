import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { accountConfig, decryptMail } from './account-policy.js';
import { z } from 'zod';
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
      if (!rows[0]) return null;
      const current = await tx.outboundEmail.findUniqueOrThrow({ where: { id: rows[0].id } });
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
      return tx.outboundEmail.update({
        where: { id: current.id },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 60000),
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
  if (!job) return false;
  const where = { id: job.id, status: 'RUNNING' as const, leaseToken: job.leaseToken };
  try {
    const payload = payloadSchema.parse(decryptMail(job.encryptedPayload));
    const providerId = await sender({ id: job.id, recipient: job.recipient, ...payload });
    await prisma.outboundEmail.updateMany({
      where,
      data: {
        status: 'COMPLETE',
        providerId,
        deliveredAt: new Date(),
        failureCode: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  } catch {
    await prisma.outboundEmail.updateMany({
      where,
      data: {
        status: job.attempts >= 3 ? 'FAILED' : 'QUEUED',
        failureCode: 'DELIVERY_UNAVAILABLE',
        nextAttemptAt: new Date(now.getTime() + job.attempts * 30000),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
  return true;
}
export function emailWorker(onError: () => void) {
  let timer: ReturnType<typeof setInterval> | undefined, current: Promise<unknown> | undefined;
  const tick = () => {
    if (!current)
      current = runEmailWorkerOnce()
        .catch(onError)
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
