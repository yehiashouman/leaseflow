import { z } from 'zod';
import { env } from './config.js';
import { accountConfig } from './account-policy.js';
export const noticeConfig = z
  .object({
    CASE_EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
    CASE_WHATSAPP_ENABLED: z.enum(['true', 'false']).default('false'),
    WHATSAPP_FROM: z.string().default(''),
    WHATSAPP_CONTENT_SID_EN: z.string().default(''),
    WHATSAPP_CONTENT_SID_AR: z.string().default(''),
    TWILIO_STATUS_CALLBACK_URL: z.string().default(''),
  })
  .parse(process.env);
export function validateNoticeConfig() {
  if (
    env.NODE_ENV === 'production' &&
    (noticeConfig.CASE_EMAIL_ENABLED === 'true' || noticeConfig.CASE_WHATSAPP_ENABLED === 'true')
  )
    throw new Error(
      'Production notification delivery requires approved sender, template, retention, and deployment policies.',
    );
  if (noticeConfig.CASE_EMAIL_ENABLED === 'true' && accountConfig.ACCOUNT_EMAIL_ENABLED !== 'true')
    throw new Error('Case email requires configured account SMTP delivery.');
  if (noticeConfig.CASE_WHATSAPP_ENABLED === 'true') {
    if (
      !env.TWILIO_ACCOUNT_SID ||
      !env.TWILIO_AUTH_TOKEN ||
      !/^whatsapp:\+[1-9]\d{7,14}$/.test(noticeConfig.WHATSAPP_FROM) ||
      !/^HX[0-9a-f]{32}$/i.test(noticeConfig.WHATSAPP_CONTENT_SID_EN)
    )
      throw new Error(
        'Case WhatsApp requires explicit credentials, sender, and approved content SID.',
      );
    const url = new URL(noticeConfig.TWILIO_STATUS_CALLBACK_URL);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/api/v1/providers/twilio/status'
    )
      throw new Error(
        'Use the explicit public HTTPS callback URL without credentials, query, or fragment.',
      );
    if (
      noticeConfig.WHATSAPP_CONTENT_SID_AR &&
      !/^HX[0-9a-f]{32}$/i.test(noticeConfig.WHATSAPP_CONTENT_SID_AR)
    )
      throw new Error('Use a valid Arabic content SID.');
  }
}
validateNoticeConfig();
export function noticeLanguage(preferred: string, channel: 'EMAIL' | 'WHATSAPP') {
  return preferred.toLowerCase().split('-')[0] === 'ar' &&
    (channel === 'EMAIL' || noticeConfig.WHATSAPP_CONTENT_SID_AR)
    ? 'ar'
    : 'en';
}
export function noticeTemplate(language: string, requestId: string) {
  const url =
    accountConfig.APP_URL.replace(/\/$/, '') + '/requests/' + encodeURIComponent(requestId);
  return {
    format: 'case-notice-v1' as const,
    url,
    subject:
      language === 'ar' ? 'تحديث على طلبك في LeaseFlow' : 'Your LeaseFlow case has an update',
    text:
      (language === 'ar'
        ? 'يوجد تحديث على طلبك. افتح السجل داخل التطبيق: '
        : 'An update is available. Open your authorized case record: ') + url,
  };
}
export function callbackUrl(deliveryId: string) {
  const url = new URL(noticeConfig.TWILIO_STATUS_CALLBACK_URL);
  url.searchParams.set('job', deliveryId);
  return url.toString();
}
export class NoticeSendError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
    public readonly ambiguous = false,
  ) {
    super(code);
  }
}

export function maskNoticeRecipient(channel: 'EMAIL' | 'WHATSAPP', address: string | null) {
  if (!address) return null;
  if (channel === 'WHATSAPP') return '***' + address.slice(-4);
  const at = address.lastIndexOf('@');
  return at > 0 ? address[0] + '***' + address.slice(at) : '***';
}
