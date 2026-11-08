import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  declarationHash,
  declarationText,
  encryptMail,
  decryptMail,
  emailLink,
} from '../src/account-policy.js';
import { managerRegistrationSchema } from '../src/routes/accounts.js';
describe('account security policy and encrypted outbox', () => {
  it('encrypts tokens with authenticated encryption and rejects tampered ciphertext', () => {
    const plain = { subject: 'Verify', text: 'Private token = abc123' },
      encrypted = encryptMail(plain);
    expect(encrypted).not.toContain('abc123');
    expect(decryptMail(encrypted)).toEqual(plain);
    expect(() => decryptMail(encrypted.slice(0, -10) + 'AAAAAAAAAA')).toThrow();
  });
  it('uses fresh random nonces for identical email content', () => {
    expect(encryptMail({ text: 'a' })).not.toBe(encryptMail({ text: 'a' }));
  });
  it('hashes the exact declaration text and keeps mail tokens in URL fragments', () => {
    expect(declarationHash).toBe(createHash('sha256').update(declarationText).digest('hex'));
    const url = new URL(emailLink('reset-password', 'abc123'));
    expect(url.search).toBe('');
    expect(url.hash).toBe('#token=abc123');
  });
  it('rejects missing declarations, role injection, and future birth dates', () => {
    const base = {
      email: 'owner@example.com',
      password: 'AccountPassword123!',
      fullName: 'Full Name',
      dateOfBirth: '1990-01-01',
      nationality: 'Egyptian',
      phone: '+971501111111',
      declarationVersion: 'manager-declaration-v1',
      declarationAccepted: true,
    };
    expect(managerRegistrationSchema.safeParse(base).success).toBe(true);
    for (const extra of [
      { declarationAccepted: false },
      { role: 'ADMIN' },
      { dateOfBirth: '2999-01-01' },
    ])
      expect(managerRegistrationSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
});
