import { Prisma } from '@prisma/client';
import { z } from 'zod';

const changesSchema = z.object({
  monthlyRent: z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/),
  currency: z.enum(['AED', 'USD']),
});

export function amendmentRent(changes: unknown, currency: string) {
  const result = changesSchema.safeParse(changes);
  if (!result.success || result.data.currency !== currency) return null;
  const rent = new Prisma.Decimal(result.data.monthlyRent);
  return rent.gt(0) ? rent : null;
}

export function effectiveRent(
  original: Prisma.Decimal,
  currency: string,
  amendments: { changes: unknown; effectiveDate: Date; confirmedAt: Date | null }[],
  date: Date,
) {
  const latest = amendments.reduce<(typeof amendments)[number] | undefined>((prior, entry) => {
    if (!entry.confirmedAt || entry.effectiveDate > date) return prior;
    return !prior || entry.effectiveDate > prior.effectiveDate ? entry : prior;
  }, undefined);
  return (latest && amendmentRent(latest.changes, currency)) ?? original;
}
