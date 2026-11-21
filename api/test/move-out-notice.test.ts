import { Prisma } from '@prisma/client';
import { expect, it } from 'vitest';
import { noticePreview } from '../src/move-out-notice.js';

it('counts the Dubai submission date as day one', () => {
  const result = noticePreview(
    new Date('2026-05-31T20:30:00Z'),
    '2026-06-30',
    {
      noticeDays: 30,
      monthlyRent: new Prisma.Decimal(3000),
      currency: 'AED',
      amendments: [],
    },
    new Prisma.Decimal(1000),
    new Prisma.Decimal(0),
  );
  expect(result).toMatchObject({
    submittedDay: '2026-06-01',
    earliestPenaltyFreeDate: '2026-06-30',
    missingDays: 0,
    proposedDeduction: '0.00',
    projectedRefund: '1000.00',
  });
});

it('uses actual month lengths and confirmed rates before it caps the deduction', () => {
  const terms = {
    noticeDays: 30,
    monthlyRent: new Prisma.Decimal(2900),
    currency: 'AED',
    amendments: [
      {
        effectiveDate: new Date('2024-03-01'),
        confirmedAt: new Date('2024-02-01'),
        changes: { monthlyRent: '3100.00', currency: 'AED' },
      },
    ],
  };
  const submitted = new Date('2024-02-20T10:00:00Z');
  const result = noticePreview(
    submitted,
    '2024-02-27',
    terms,
    new Prisma.Decimal(3000),
    new Prisma.Decimal(100),
  );
  expect(result).toMatchObject({
    earliestPenaltyFreeDate: '2024-03-20',
    missingDays: 22,
    proposedDeduction: '2200.00',
    projectedRefund: '700.00',
    months: [
      { month: '2024-02', daysInMonth: 29, uncoveredDays: 2, monthlyRent: '2900.00' },
      { month: '2024-03', daysInMonth: 31, uncoveredDays: 20, monthlyRent: '3100.00' },
    ],
  });
  expect(
    noticePreview(
      submitted,
      '2024-02-27',
      terms,
      new Prisma.Decimal(2000),
      new Prisma.Decimal(100),
    ),
  ).toMatchObject({ proposedDeduction: '1900.00', projectedRefund: '0.00' });
});
