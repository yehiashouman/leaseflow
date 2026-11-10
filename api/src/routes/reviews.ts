import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { activeAccount } from '../account-data.js';
import { prisma } from '../db.js';
import { reviewContractScope } from '../notification-data.js';
import { queueRecordNotices } from '../notice-data.js';
import { calendarDate, monthStart } from '../business-calendar.js';
const select = {
  id: true,
  contractId: true,
  dueAt: true,
  reviewedAt: true,
  decision: true,
  notes: true,
  deferredUntil: true,
  version: true,
  milestoneMonths: true,
  sameSpaceSince: true,
  contract: {
    select: {
      currency: true,
      monthlyRent: true,
      tenant: { select: { fullName: true } },
      rentalSpace: { select: { name: true, unit: { select: { name: true } } } },
    },
  },
  spaceNameSnapshot: true,
  unitNameSnapshot: true,
  events: {
    select: {
      id: true,
      kind: true,
      note: true,
      actorName: true,
      proposedRent: true,
      currency: true,
      effectiveMonth: true,
      deferredUntil: true,
      createdAt: true,
      amendment: { select: { id: true, status: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ContractReviewSelect;
function dto(row: Prisma.ContractReviewGetPayload<{ select: typeof select }>) {
  return {
    ...row,
    rentalSpace: {
      name: row.spaceNameSnapshot ?? row.contract.rentalSpace.name,
      unit: { name: row.unitNameSnapshot ?? row.contract.rentalSpace.unit.name },
    },
  };
}
export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const participants = allowRoles('LEASING_MANAGER', 'TENANT');
  app.get('/', { preHandler: participants }, async (request) => {
    const { page, status, q } = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        status: z.enum(['ALL', 'OPEN', 'REVIEWED', 'DEFERRED']).default('ALL'),
        q: z.string().trim().max(150).default(''),
      })
      .strict()
      .parse(request.query);
    const where: Prisma.ContractReviewWhereInput = {
      contract: {
        ...reviewContractScope(request.user),
        ...(q
          ? {
              OR: [
                { tenant: { fullName: { contains: q } } },
                { rentalSpace: { name: { contains: q } } },
                { rentalSpace: { unit: { name: { contains: q } } } },
              ],
            }
          : {}),
      },
      ...(status === 'REVIEWED'
        ? { reviewedAt: { not: null } }
        : status === 'DEFERRED'
          ? { reviewedAt: null, decision: 'DEFERRED' }
          : status === 'OPEN'
            ? { reviewedAt: null }
            : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.contractReview.findMany({
        where,
        select,
        orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.contractReview.count({ where }),
    ]);
    return { items: items.map(dto), total, page, pageSize: 20 };
  });
  app.get('/:id', { preHandler: participants }, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const row = await prisma.contractReview.findFirst({
      where: { id, contract: reviewContractScope(request.user) },
      select,
    });
    if (!row) throw app.httpErrors.notFound('Review not found');
    return dto(row);
  });
  app.post(
    '/:id/decision',
    {
      preHandler: allowRoles('LEASING_MANAGER'),
      config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    },
    async (request) => {
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      const body = z
        .object({
          clientId: z.uuid(),
          expectedVersion: z.number().int().nonnegative(),
          decision: z.enum(['NO_CHANGE', 'PROPOSED_PRICE', 'DEFERRED']),
          note: z.string().trim().min(3).max(5000),
          proposedRent: z
            .string()
            .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
            .optional(),
          deferredUntil: z.iso.date().optional(),
        })
        .strict()
        .superRefine((body, ctx) => {
          if (
            body.decision === 'PROPOSED_PRICE' &&
            (!body.proposedRent || !new Prisma.Decimal(body.proposedRent).gt(0))
          )
            ctx.addIssue({
              code: 'custom',
              path: ['proposedRent'],
              message: 'Enter a positive rent amount.',
            });
          if (body.decision === 'DEFERRED' && !body.deferredUntil)
            ctx.addIssue({
              code: 'custom',
              path: ['deferredUntil'],
              message: 'Choose the deferred review date.',
            });
          if (body.decision !== 'PROPOSED_PRICE' && body.proposedRent !== undefined)
            ctx.addIssue({
              code: 'custom',
              path: ['proposedRent'],
              message: 'Rent belongs only to a price proposal.',
            });
          if (body.decision !== 'DEFERRED' && body.deferredUntil !== undefined)
            ctx.addIssue({
              code: 'custom',
              path: ['deferredUntil'],
              message: 'The deferred date belongs only to a deferral.',
            });
        })
        .parse(request.body);
      const normalized = {
        ...body,
        ...(body.proposedRent
          ? { proposedRent: new Prisma.Decimal(body.proposedRent).toFixed(2) }
          : {}),
      };
      const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      const now = new Date(),
        today = calendarDate(now);
      if (body.deferredUntil && new Date(body.deferredUntil + 'T00:00:00Z') <= today)
        throw app.httpErrors.unprocessableEntity('Choose a future Dubai calendar date');
      return prisma
        .$transaction(
          async (tx) => {
            if (!(await activeAccount(tx, request)))
              throw app.httpErrors.unauthorized('Session is no longer active');
            const where = { id, contract: reviewContractScope(request.user) };
            if (!(await tx.contractReview.findFirst({ where, select: { id: true } })))
              throw app.httpErrors.notFound('Review not found');
            await tx.$queryRaw`SELECT id FROM ContractReview WHERE id = ${id} FOR UPDATE`;
            const current = await tx.contractReview.findFirst({
              where,
              include: {
                contract: {
                  include: {
                    tenant: true,
                    rentalSpace: { include: { unit: { include: { manager: true } } } },
                  },
                },
              },
            });
            if (!current) throw app.httpErrors.notFound('Review not found');
            const duplicate = await tx.contractReviewEvent.findUnique({
              where: { reviewId_clientId: { reviewId: id, clientId: body.clientId } },
            });
            if (duplicate) {
              if (duplicate.actorUserId !== request.user.sub || duplicate.payloadHash !== hash)
                throw app.httpErrors.conflict('Review key reused with different content');
              return tx.contractReview.findFirstOrThrow({ where, select });
            }
            if (current.version !== body.expectedVersion)
              throw app.httpErrors.conflict('Review changed. Reload before another decision');
            if (current.reviewedAt)
              throw app.httpErrors.conflict('This review already has a final decision');
            if (
              !['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(current.contract.status)
            )
              throw app.httpErrors.conflict('Review decisions require an active contract');
            if (current.rentalSpaceId !== current.contract.rentalSpaceId)
              throw app.httpErrors.conflict(
                'The reviewed space changed; preserve this historical review',
              );
            const effectiveMonth = body.decision === 'PROPOSED_PRICE' ? monthStart(today, 1) : null;
            const deferredUntil = body.deferredUntil
              ? new Date(body.deferredUntil + 'T00:00:00Z')
              : null;
            const event = await tx.contractReviewEvent.create({
              data: {
                reviewId: id,
                actorUserId: request.user.sub,
                actorName: current.contract.rentalSpace.unit.manager.fullName,
                clientId: body.clientId,
                payloadHash: hash,
                kind: body.decision,
                note: body.note,
                proposedRent: normalized.proposedRent,
                currency: body.decision === 'PROPOSED_PRICE' ? current.contract.currency : null,
                effectiveMonth,
                deferredUntil,
                createdAt: now,
              },
            });
            if (effectiveMonth)
              await tx.contractAmendment.create({
                data: {
                  contractId: current.contractId,
                  effectiveDate: effectiveMonth,
                  status: 'PROPOSED',
                  reason: body.note,
                  sourceReviewEventId: event.id,
                  changes: {
                    monthlyRent: normalized.proposedRent!,
                    currency: current.contract.currency,
                    originalMonthlyRent: current.contract.monthlyRent.toFixed(2),
                    sourceReviewId: id,
                    acknowledgementPolicy: 'PENDING_DEC_23',
                    appliesAutomatically: false,
                  },
                },
              });
            await tx.contractReview.update({
              where: { id },
              data: {
                version: { increment: 1 },
                decision: body.decision,
                notes: body.note,
                deferredUntil,
                reviewedAt: body.decision === 'DEFERRED' ? null : now,
              },
            });
            const recipients =
              body.decision === 'PROPOSED_PRICE'
                ? [request.user.sub, current.contract.tenant.userId]
                : [request.user.sub];
            await tx.notification.createMany({
              data: recipients.map((recipientUserId) => ({
                recipientUserId,
                reviewEventId: event.id,
              })),
              skipDuplicates: true,
            });
            await queueRecordNotices(tx, { reviewEventId: event.id });
            await tx.auditEvent.create({
              data: {
                actorUserId: request.user.sub,
                action: 'CONTRACT_REVIEW_DECISION',
                entityType: 'ContractReview',
                entityId: id,
                ip: request.ip,
                userAgent: request.headers['user-agent'],
                newValue: {
                  decision: body.decision,
                  eventId: event.id,
                  effectiveMonth: effectiveMonth?.toISOString() ?? null,
                  contractRentChanged: false,
                },
              },
            });
            return tx.contractReview.findFirstOrThrow({ where, select });
          },
          { isolationLevel: 'ReadCommitted' },
        )
        .then(dto);
    },
  );
};
