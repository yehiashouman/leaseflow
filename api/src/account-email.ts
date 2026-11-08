import { randomBytes } from 'node:crypto';
import type { Prisma, AccountTokenType } from '@prisma/client';
import { hashToken } from './auth.js';
import { emailLink, encryptMail, securityLimits } from './account-policy.js';
export async function queueAccountEmail(
  tx: Prisma.TransactionClient,
  input: {
    userId?: string;
    recipient: string;
    template: string;
    subject: string;
    text: string;
  },
) {
  return tx.outboundEmail.create({
    data: {
      userId: input.userId,
      recipient: input.recipient,
      template: input.template,
      language: 'en',
      encryptedPayload: encryptMail({ subject: input.subject, text: input.text }),
    },
  });
}
export async function issueAccountToken(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string },
  type: AccountTokenType,
  now = new Date(),
) {
  const token = randomBytes(32).toString('base64url');
  await tx.accountToken.updateMany({
    where: { userId: user.id, type, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.accountToken.create({
    data: {
      userId: user.id,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(
        now.getTime() +
          (type === 'EMAIL_VERIFY'
            ? securityLimits.emailTokenMinutes
            : securityLimits.resetTokenMinutes) *
            60000,
      ),
    },
  });
  const verify = type === 'EMAIL_VERIFY',
    link = emailLink(verify ? 'verify-email' : 'reset-password', token);
  await queueAccountEmail(tx, {
    userId: user.id,
    recipient: user.email,
    template: type,
    subject: verify ? 'Verify your LeaseFlow email' : 'Reset your LeaseFlow password',
    text:
      (verify ? 'Verify your email: ' : 'Reset your password: ') +
      link +
      '\nThis link expires in 30 minutes. If you did not request this, ignore this message.',
  });
}
