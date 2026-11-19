import { createHmac } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { calendarDate } from './business-calendar.js';
import { env } from './config.js';
import { openContractStatuses } from './space-availability.js';

export const complaintSourceSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  rentalSpace: { select: { unitId: true, unit: { select: { managerId: true } } } },
} satisfies Prisma.ContractSelect;

type ComplaintSource = Prisma.ContractGetPayload<{ select: typeof complaintSourceSelect }>;

export async function complaintOccupants(tx: Prisma.TransactionClient, source: ComplaintSource) {
  const now = new Date();
  const today = calendarDate(now);
  if (source.startDate > now || (source.endDate && source.endDate < today)) return [];
  const contracts = await tx.contract.findMany({
    where: {
      status: { in: [...openContractStatuses] },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
      tenant: { managerId: source.rentalSpace.unit.managerId },
      rentalSpace: { unitId: source.rentalSpace.unitId },
    },
    select: {
      id: true,
      tenant: { select: { fullName: true } },
      rentalSpace: { select: { name: true } },
      occupants: { select: { role: true, fullName: true, effectiveFrom: true } },
      secondaryOccupant: true,
    },
    orderBy: [{ rentalSpace: { name: 'asc' } }, { id: 'asc' }],
  });
  return contracts.flatMap((contract) => {
    const legacySecondary = contract.secondaryOccupant as { fullName?: unknown } | null;
    return (['PRIMARY', 'SECONDARY'] as const).flatMap((role) => {
      if (contract.id === source.id && role === 'PRIMARY') return [];
      const occupant = contract.occupants.find((row) => row.role === role);
      if (occupant && occupant.effectiveFrom > now) return [];
      const name =
        occupant?.fullName ??
        (role === 'PRIMARY' ? contract.tenant.fullName : legacySecondary?.fullName);
      if (typeof name !== 'string' || !name.trim()) return [];
      const names = name.trim().split(/\s+/);
      const shortName =
        names[0]!.slice(0, 60) + (names.length > 1 ? ' ' + names.at(-1)!.slice(0, 1) + '.' : '');
      return [
        {
          id: createHmac('sha256', env.JWT_ACCESS_SECRET)
            .update('complaint-occupant:' + source.id + ':' + contract.id + ':' + role)
            .digest('base64url'),
          label: shortName + ' · ' + contract.rentalSpace.name.slice(0, 100),
        },
      ];
    });
  });
}
