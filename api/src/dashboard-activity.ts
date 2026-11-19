import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { caseContractScope } from './case-data.js';
import { seriesScope } from './file-access.js';
import { openRentContractStatuses } from './rent-dashboard.js';

export async function managerDashboardActivity(
  tx: Prisma.TransactionClient,
  actor: FastifyRequest['user'],
  now: Date,
) {
  const until = new Date(now.getTime() + 30 * 86_400_000);
  const contract = { ...caseContractScope(actor), status: { in: [...openRentContractStatuses] } };
  const reviewScope = { reviewedAt: null, milestoneMonths: { not: null }, contract };
  const reviewSelect = {
    id: true,
    dueAt: true,
    deferredUntil: true,
    milestoneMonths: true,
    contract: {
      select: { rentalSpace: { select: { name: true, unit: { select: { name: true } } } } },
    },
  } satisfies Prisma.ContractReviewSelect;
  const [reviews, deferred, series] = await Promise.all([
    tx.contractReview.findMany({
      where: { ...reviewScope, deferredUntil: null, dueAt: { lt: until } },
      select: reviewSelect,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: 10,
    }),
    tx.contractReview.findMany({
      where: { ...reviewScope, deferredUntil: { lt: until } },
      select: reviewSelect,
      orderBy: [{ deferredUntil: 'asc' }, { id: 'asc' }],
      take: 10,
    }),
    tx.documentSeries.findMany({
      where: {
        AND: [
          seriesScope(actor),
          {
            OR: [
              { purpose: { in: ['IDENTITY', 'LICENSE'] }, ownerUserId: actor.sub },
              { purpose: { in: ['PROPERTY_DOCUMENT', 'CONSENT'] }, unit: { archivedAt: null } },
              { purpose: 'OCCUPANT_IDENTITY', occupant: { contract } },
            ],
          },
        ],
        versions: { some: { status: 'CLEAN', expiresAt: { lt: until } } },
      },
      select: {
        id: true,
        purpose: true,
        unitId: true,
        occupant: { select: { contractId: true } },
        versions: {
          where: { status: 'CLEAN' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { title: true, expiresAt: true },
        },
      },
    }),
  ]);
  const annualReviews = [...reviews, ...deferred]
    .map((row) => ({
      id: row.id,
      dueAt: row.deferredUntil ?? row.dueAt,
      milestoneMonths: row.milestoneMonths,
      space: row.contract.rentalSpace.name,
      unit: row.contract.rentalSpace.unit.name,
    }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, 10);
  const documentsWithDeadlines = series
    .flatMap((row) => {
      const latest = row.versions[0];
      if (!latest?.expiresAt || latest.expiresAt >= until) return [];
      return [
        {
          id: row.id,
          title: latest.title,
          purpose: row.purpose,
          expiresAt: latest.expiresAt,
          unitId: row.unitId,
          contractId: row.occupant?.contractId ?? null,
        },
      ];
    })
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id));
  const expiringDocuments = documentsWithDeadlines.filter((row) => row.expiresAt > now);
  const expiredDocuments = documentsWithDeadlines.filter((row) => row.expiresAt <= now).reverse();
  return {
    annualReviews,
    expiringDocuments: expiringDocuments.slice(0, 10),
    expiringDocumentsTotal: expiringDocuments.length,
    expiredDocuments: expiredDocuments.slice(0, 10),
    expiredDocumentsTotal: expiredDocuments.length,
  };
}
