import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { maskIdentity } from './account-policy.js';
export const secondaryOccupantSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    dateOfBirth: z.iso
      .date()
      .refine((value) => value < new Date().toISOString().slice(0, 10), 'Use a past date'),
    nationality: z.string().trim().min(2).max(100),
    emiratesIdNumber: z.string().regex(/^784-?\d{4}-?\d{7}-?\d$/),
    emiratesIdExpiry: z.iso.date(),
  })
  .strict();
const decimalInput = z
  .union([
    z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/),
    z.number().finite().nonnegative().max(9999999999.99),
  ])
  .transform((value) => new Prisma.Decimal(value))
  .refine((value) => value.decimalPlaces() <= 2, 'Use at most two decimal places')
  .transform((value) => value.toFixed(2));
export const contractCreateSchema = z
  .object({
    clientId: z.uuid(),
    tenantId: z.string().min(1).max(191),
    rentalSpaceId: z.string().min(1).max(191),
    startDate: z.iso.date(),
    monthlyRent: decimalInput.refine(
      (value) => new Prisma.Decimal(value).greaterThan(0),
      'Rent must exceed zero',
    ),
    currency: z.enum(['AED', 'USD']).default('AED'),
    dueDay: z.number().int().min(1).max(28).default(1),
    noticeDays: z.number().int().min(0).max(90).default(30),
    depositAmount: decimalInput.optional(),
    secondaryOccupant: secondaryOccupantSchema.optional(),
  })
  .strict();
export function proratedRentDecimal(monthlyRent: Prisma.Decimal.Value, startDate: Date) {
  const days = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Development half-up default; production activation remains blocked by the owner policy gate.
  return new Prisma.Decimal(monthlyRent)
    .times(days - startDate.getUTCDate() + 1)
    .div(days)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
export const occupantSelect = {
  id: true,
  role: true,
  fullName: true,
  dateOfBirth: true,
  nationality: true,
  identityCipher: true,
  identityExpiry: true,
  effectiveFrom: true,
  documentSeries: {
    select: {
      versions: {
        select: { status: true, expiresAt: true },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  },
} satisfies Prisma.ContractOccupantSelect;
export function occupantDto(
  row: Prisma.ContractOccupantGetPayload<{ select: typeof occupantSelect }>,
  now = new Date(),
) {
  const { identityCipher, documentSeries, ...safe } = row;
  const documentAvailable = documentSeries.some((series) =>
    series.versions.some(
      (version) => version.status === 'CLEAN' && (!version.expiresAt || version.expiresAt > now),
    ),
  );
  return {
    ...safe,
    maskedIdentity: maskIdentity(identityCipher),
    documentAvailable,
    identityExpired: !!row.identityExpiry && row.identityExpiry <= now,
    recordComplete: !!(row.dateOfBirth && row.nationality && identityCipher && row.identityExpiry),
    responsibility:
      row.role === 'PRIMARY'
        ? 'The primary tenant remains responsible for the contract.'
        : 'Secondary occupant; no separate account or contract responsibility.',
  };
}
