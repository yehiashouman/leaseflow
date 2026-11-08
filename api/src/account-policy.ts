import { z } from 'zod';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './config.js';
export const accountConfig = z
  .object({
    ACCOUNT_EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
    APP_URL: z.url().default('http://localhost:8080'),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    MAIL_FROM: z.email().default('no-reply@example.com'),
  })
  .parse(process.env);
if (accountConfig.ACCOUNT_EMAIL_ENABLED === 'true' && !accountConfig.SMTP_HOST)
  throw new Error('Account email requires SMTP_HOST.');
if (env.NODE_ENV === 'production' && accountConfig.ACCOUNT_EMAIL_ENABLED === 'true')
  throw new Error(
    'Production account onboarding requires approved provider and security policies.',
  );
const appUrl = new URL(accountConfig.APP_URL);
if (
  !['http:', 'https:'].includes(appUrl.protocol) ||
  appUrl.username ||
  appUrl.password ||
  appUrl.search ||
  appUrl.hash
)
  throw new Error(
    'APP_URL must be an HTTP application URL without credentials, query, or fragment.',
  );
export const declarationVersion = 'manager-declaration-v1';
export const declarationText =
  'I declare that my identity, property, and authorization information is genuine and current. I remain responsible for legal sufficiency and authorization. Platform activation is not legal certification.';
export const declarationHash = createHash('sha256').update(declarationText).digest('hex');
export const securityLimits = {
  emailTokenMinutes: 30,
  resetTokenMinutes: 30,
  resendSeconds: 60,
  invitationDays: 7,
  invitationResends: 5,
  otpMinutes: 10,
  otpAttempts: 5,
  otpSends: 3,
};
const encryptionKey = createHash('sha256')
  .update('leaseflow-email-outbox-v1:' + env.JWT_REFRESH_SECRET)
  .digest();
export function encryptMail(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((item) => item.toString('base64url')).join('.');
}
export function decryptMail(value: string) {
  const [iv, tag, bytes, extra] = value.split('.');
  if (!iv || !tag || !bytes || extra) throw new Error('Email payload invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(bytes, 'base64url')), decipher.final()]).toString(),
  );
}
export const emailLink = (path: string, token: string) =>
  accountConfig.APP_URL.replace(/\/$/, '') + '/' + path + '#token=' + encodeURIComponent(token);
export const canonicalEmail = z
  .email()
  .max(191)
  .transform((value) => value.toLowerCase());

export function sealIdentity(value: string) {
  return 'sealed:' + encryptMail({ value });
}
export function maskIdentity(value: string | null) {
  if (!value) return null;
  const plain = value.startsWith('sealed:') ? String(decryptMail(value.slice(7)).value) : value;
  return '****' + plain.slice(-4);
}
