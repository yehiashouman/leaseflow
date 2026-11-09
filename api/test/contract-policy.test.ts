import { expect, it } from 'vitest';
import {
  contractCreateSchema,
  proratedRentDecimal,
  secondaryOccupantSchema,
} from '../src/contract-policy.js';
it('uses actual first-month calendar days and includes move-in in the supplied examples', () => {
  expect(proratedRentDecimal('3100', new Date('2026-01-17')).toFixed(2)).toBe('1500.00');
  expect(proratedRentDecimal('2900', new Date('2024-02-15')).toFixed(2)).toBe('1500.00');
  expect(proratedRentDecimal('2800', new Date('2025-02-15')).toFixed(2)).toBe('1400.00');
  expect(proratedRentDecimal('3100', new Date('2026-01-01')).toFixed(2)).toBe('3100.00');
});
it('preserves explicit cents, monthly defaults, and optional negotiated deposits', () => {
  const body = contractCreateSchema.parse({
    clientId: crypto.randomUUID(),
    tenantId: 'tenant',
    rentalSpaceId: 'space',
    startDate: '2026-11-01',
    monthlyRent: '3000.10',
  });
  expect(body).toMatchObject({
    monthlyRent: '3000.10',
    dueDay: 1,
    noticeDays: 30,
    currency: 'AED',
  });
  expect(body.depositAmount).toBeUndefined();
});
it('rejects excess precision, timestamps instead of calendar dates, and occupant account injection', () => {
  const body = {
    clientId: crypto.randomUUID(),
    tenantId: 'tenant',
    rentalSpaceId: 'space',
    startDate: '2026-11-01',
    monthlyRent: '3000.001',
  };
  expect(contractCreateSchema.safeParse(body).success).toBe(false);
  expect(
    contractCreateSchema.safeParse({
      ...body,
      monthlyRent: '3000',
      startDate: '2026-11-01T23:30:00Z',
    }).success,
  ).toBe(false);
  expect(
    secondaryOccupantSchema.safeParse({ fullName: 'Secondary', userId: 'foreign' }).success,
  ).toBe(false);
});
