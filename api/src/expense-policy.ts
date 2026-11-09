import { createHash } from 'node:crypto';
import { z } from 'zod';
export const expenseCategories = [
  'OWNER_RENT',
  'ELECTRICITY',
  'WATER',
  'COOLING',
  'INTERNET',
  'MAINTENANCE',
  'CLEANING',
  'FURNISHING',
  'LICENSE_FEE',
  'OTHER',
] as const;
export const expenseMoney = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Use a positive amount with at most two decimal places')
  .refine((value) => /[1-9]/.test(value), 'Amount must exceed zero');
export const expenseSchema = z
  .object({
    clientId: z.uuid(),
    category: z.enum(expenseCategories),
    amount: expenseMoney,
    currency: z.enum(['AED', 'USD']).default('AED'),
    incurredAt: z.iso.date(),
    vendor: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).default(''),
    scopeKind: z.enum(['PORTFOLIO', 'LANDLORD', 'UNIT', 'SPACE', 'CONTRACT']).default('PORTFOLIO'),
    targetId: z.string().min(1).max(191).nullable().default(null),
  })
  .strict()
  .refine(
    (value) => (value.scopeKind === 'PORTFOLIO') === (value.targetId === null),
    'Portfolio scope requires no target; other scopes require a target',
  );
export const expensePayloadHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
