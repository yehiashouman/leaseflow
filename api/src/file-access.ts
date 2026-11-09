import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { caseContractScope, caseScope } from './case-data.js';
import type { FileMetadata } from './file-policy.js';

type Actor = FastifyRequest['user'];
export const purposeTargets = {
  IDENTITY: 'self',
  LICENSE: 'self',
  LANDLORD_DOCUMENT: 'landlordId',
  PROPERTY_DOCUMENT: 'unitId',
  CONSENT: 'unitId',
  UNIT_PHOTO: 'unitId',
  COMMON_PHOTO: 'unitId',
  SPACE_PHOTO: 'rentalSpaceId',
  CASE_EVIDENCE: 'requestId',
  PAYMENT_EVIDENCE: 'paymentId',
  EXPENSE_EVIDENCE: 'expenseId',
  OCCUPANT_IDENTITY: 'occupantId',
} as const;
export function seriesScope(actor: Actor): Prisma.DocumentSeriesWhereInput {
  if (actor.role === 'ADMIN') return { id: { in: [] } };
  const manager = { manager: { userId: actor.sub } };
  return {
    OR: [
      {
        ownerUserId: actor.sub,
        purpose: { in: actor.role === 'LEASING_MANAGER' ? ['IDENTITY', 'LICENSE'] : ['IDENTITY'] },
      },
      ...(actor.role === 'LEASING_MANAGER'
        ? [
            { purpose: 'LANDLORD_DOCUMENT' as const, landlord: manager },
            {
              purpose: {
                in: [
                  'PROPERTY_DOCUMENT',
                  'CONSENT',
                  'UNIT_PHOTO',
                  'COMMON_PHOTO',
                ] as Prisma.EnumDocumentPurposeFilter['in'],
              },
              unit: manager,
            },
            { purpose: 'EXPENSE_EVIDENCE' as const, expense: manager },
            { purpose: 'SPACE_PHOTO' as const, rentalSpace: { unit: manager } },
          ]
        : []),
      {
        purpose: 'OCCUPANT_IDENTITY',
        occupant: {
          contract: {
            ...caseContractScope(actor),
            ...(actor.role === 'TENANT' ? { status: { not: 'DRAFT' as const } } : {}),
          },
        },
      },
      { purpose: 'CASE_EVIDENCE', request: caseScope(actor) },
      {
        purpose: 'PAYMENT_EVIDENCE',
        payment: {
          contract: {
            ...caseContractScope(actor),
            ...(actor.role === 'TENANT' ? { status: { not: 'DRAFT' as const } } : {}),
          },
        },
      },
    ],
  };
}
export const documentSelect = {
  id: true,
  seriesId: true,
  version: true,
  uploaderUserId: true,
  title: true,
  originalName: true,
  mimeType: true,
  originalSize: true,
  fileSize: true,
  sourceHash: true,
  fileHash: true,
  expiresAt: true,
  status: true,
  failureCode: true,
  attempts: true,
  retryCount: true,
  createdAt: true,
  scannedAt: true,
  series: {
    select: {
      purpose: true,
      ownerUserId: true,
      landlordId: true,
      unitId: true,
      rentalSpaceId: true,
      requestId: true,
      paymentId: true,
      expenseId: true,
      occupantId: true,
    },
  },
} satisfies Prisma.DocumentSelect;
export async function lockFileTarget(
  tx: Prisma.TransactionClient,
  meta: FileMetadata,
  actor: Actor,
) {
  const target = purposeTargets[meta.purpose];
  if (target === 'self')
    return (
      meta.targetId === 'self' && (meta.purpose !== 'LICENSE' || actor.role === 'LEASING_MANAGER')
    );
  if (meta.purpose === 'OCCUPANT_IDENTITY') {
    const where = {
      id: meta.targetId,
      contract: {
        ...caseContractScope(actor),
        ...(actor.role === 'TENANT' ? { status: { not: 'DRAFT' as const } } : {}),
      },
    };
    const row = await tx.contractOccupant.findFirst({ where, select: { id: true } });
    if (!row) return false;
    await tx.$queryRaw`SELECT id FROM ContractOccupant WHERE id = ${row.id} FOR UPDATE`;
    return Boolean(await tx.contractOccupant.findFirst({ where, select: { id: true } }));
  }
  if (meta.purpose === 'CASE_EVIDENCE') {
    const row = await tx.request.findFirst({
      where: { id: meta.targetId, ...caseScope(actor) },
      select: { id: true },
    });
    if (!row) return false;
    await tx.$queryRaw`SELECT id FROM Request WHERE id = ${row.id} FOR UPDATE`;
    return Boolean(
      await tx.request.findFirst({
        where: { id: row.id, ...caseScope(actor) },
        select: { id: true },
      }),
    );
  }
  if (actor.role !== 'LEASING_MANAGER') return false;
  const owned = { manager: { userId: actor.sub } };
  if (target === 'expenseId') {
    await tx.$queryRaw`SELECT id FROM Expense WHERE id = ${meta.targetId} FOR UPDATE`;
    return Boolean(
      await tx.expense.findFirst({ where: { id: meta.targetId, ...owned }, select: { id: true } }),
    );
  }
  if (target === 'landlordId') {
    await tx.$queryRaw`SELECT id FROM Landlord WHERE id = ${meta.targetId} FOR UPDATE`;
    return Boolean(
      await tx.landlord.findFirst({
        where: { id: meta.targetId, ...owned, archivedAt: null },
        select: { id: true },
      }),
    );
  }
  if (target === 'unitId') {
    await tx.$queryRaw`SELECT id FROM Unit WHERE id = ${meta.targetId} FOR UPDATE`;
    return Boolean(
      await tx.unit.findFirst({
        where: { id: meta.targetId, ...owned, archivedAt: null },
        select: { id: true },
      }),
    );
  }
  if (target === 'rentalSpaceId') {
    await tx.$queryRaw`SELECT id FROM RentalSpace WHERE id = ${meta.targetId} FOR UPDATE`;
    return Boolean(
      await tx.rentalSpace.findFirst({
        where: { id: meta.targetId, unit: { ...owned, archivedAt: null } },
        select: { id: true },
      }),
    );
  }
  await tx.$queryRaw`SELECT id FROM Payment WHERE id = ${meta.targetId} FOR UPDATE`;
  return Boolean(
    await tx.payment.findFirst({
      where: { id: meta.targetId, contract: caseContractScope(actor) },
      select: { id: true },
    }),
  );
}
