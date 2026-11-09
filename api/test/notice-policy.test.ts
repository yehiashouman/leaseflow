import { afterEach, expect, it } from 'vitest';
import {
  noticeConfig,
  noticeLanguage,
  noticeTemplate,
  maskNoticeRecipient,
  callbackUrl,
  validateNoticeConfig,
} from '../src/notice-policy.js';
import { env } from '../src/config.js';
const original = { ...noticeConfig },
  originalEnv = {
    NODE_ENV: env.NODE_ENV,
    TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
  };
afterEach(() => {
  Object.assign(noticeConfig, original);
  Object.assign(env, originalEnv);
});
it('uses Arabic where available and English for unsupported notification templates', () => {
  expect(noticeLanguage('ar-EG', 'EMAIL')).toBe('ar');
  expect(noticeLanguage('fr-FR', 'EMAIL')).toBe('en');
  noticeConfig.WHATSAPP_CONTENT_SID_AR = '';
  expect(noticeLanguage('ar-EG', 'WHATSAPP')).toBe('en');
  noticeConfig.WHATSAPP_CONTENT_SID_AR = 'HX' + 'b'.repeat(32);
  expect(noticeLanguage('ar-EG', 'WHATSAPP')).toBe('ar');
});
it('keeps messages generic and sends only an authorized application record link', () => {
  const payload = noticeTemplate('en', 'case-123');
  expect(payload.url).toMatch(/\/requests\/case-123$/);
  expect(payload.text).not.toMatch(/identity|passport|complaint description|Emirates/i);
});
it('masks destinations for the owner delivery history', () => {
  expect(maskNoticeRecipient('EMAIL', 'person@example.invalid')).toBe('p***@example.invalid');
  expect(maskNoticeRecipient('WHATSAPP', '+971501234567')).toBe('***4567');
  expect(maskNoticeRecipient('EMAIL', null)).toBeNull();
});
it('rejects production provider activation without approved policies', () => {
  env.NODE_ENV = 'production';
  noticeConfig.CASE_WHATSAPP_ENABLED = 'true';
  expect(() => validateNoticeConfig()).toThrow(/Production notification/);
});
it('requires explicit sender, content SID, and a canonical public callback address', () => {
  env.NODE_ENV = 'test';
  env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
  env.TWILIO_AUTH_TOKEN = 'test-notice-token';
  noticeConfig.CASE_WHATSAPP_ENABLED = 'true';
  noticeConfig.WHATSAPP_FROM = 'whatsapp:+971501234567';
  noticeConfig.WHATSAPP_CONTENT_SID_EN = 'HX' + 'a'.repeat(32);
  noticeConfig.TWILIO_STATUS_CALLBACK_URL = 'http://example.invalid/api/v1/providers/twilio/status';
  expect(() => validateNoticeConfig()).toThrow(/HTTPS/);
  noticeConfig.TWILIO_STATUS_CALLBACK_URL =
    'https://example.invalid/api/v1/providers/twilio/status';
  expect(() => validateNoticeConfig()).not.toThrow();
  expect(callbackUrl('delivery-1')).toBe(
    'https://example.invalid/api/v1/providers/twilio/status?job=delivery-1',
  );
  noticeConfig.TWILIO_STATUS_CALLBACK_URL += '?unexpected=value';
  expect(() => validateNoticeConfig()).toThrow(/without credentials/);
});
