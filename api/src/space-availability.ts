import type { Prisma } from '@prisma/client';

export const openContractStatuses = ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] as const;

export async function lockOwnedSpace(tx: Prisma.TransactionClient, id: string, managerId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM RentalSpace s INNER JOIN Unit u ON u.id = s.unitId
    WHERE s.id = ${id} AND u.managerId = ${managerId} AND u.archivedAt IS NULL FOR UPDATE
  `;
  return rows.length > 0;
}

export function occupantCount(contracts: { secondaryOccupant: unknown }[]) {
  return contracts.reduce((total, contract) => total + (contract.secondaryOccupant ? 2 : 1), 0);
}

export function occupiedStatus(occupants: number, capacity: number) {
  return occupants === 0 ? 'AVAILABLE' : occupants >= capacity ? 'OCCUPIED' : 'PARTIAL';
}
