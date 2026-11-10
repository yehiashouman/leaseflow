import { Prisma, type BusinessJobKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { env } from './config.js';
import {
  anniversary,
  calendarDate,
  dueDate,
  dubaiMidnight,
  monthStart,
  nextReviewMonth,
} from './business-calendar.js';
import { proratedRentDecimal } from './contract-policy.js';
import { queueCaseNotices, queueRecordNotices } from './notice-data.js';

const openStatuses = ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] as const;
export const roomExpiryReason = 'Approval period expired.';
export function roomExpiry(submittedAt: Date) {
  const result = new Date(submittedAt);
  result.setUTCDate(result.getUTCDate() + 5);
  return result;
}
export async function materializeBusinessJobs(after = '', now = new Date(), contractId?: string) {
  const contracts = await prisma.contract.findMany({
    where: {
      id: { gt: after, ...(contractId ? { equals: contractId } : {}) },
      status: { in: [...openStatuses] },
    },
    select: { id: true, startDate: true, rentalSpaceId: true },
    orderBy: { id: 'asc' },
    take: 100,
  });
  if (contracts.length)
    await prisma.businessJob.createMany({
      data: contracts.flatMap((contract) => [
        {
          createdAt: now,
          contractId: contract.id,
          kind: 'MONTHLY_OBLIGATIONS' as const,
          jobKey: 'monthly:' + contract.id,
          sourceSpaceId: contract.rentalSpaceId,
          sourceStartDate: contract.startDate,
          cursor: monthStart(contract.startDate),
          nextRunAt: dubaiMidnight(calendarDateFromSource(contract.startDate)),
          state: env.NODE_ENV === 'production' ? ('PAUSED' as const) : ('QUEUED' as const),
          failureCode: env.NODE_ENV === 'production' ? 'FINANCIAL_POLICY_REQUIRED' : null,
        },
        {
          createdAt: now,
          contractId: contract.id,
          kind: 'OBLIGATION_STATUS' as const,
          jobKey: 'aging:' + contract.id,
          sourceSpaceId: contract.rentalSpaceId,
          sourceStartDate: contract.startDate,
          cursor: calendarDate(now),
          nextRunAt: dubaiMidnight(calendarDate(now)),
          state: env.NODE_ENV === 'production' ? ('PAUSED' as const) : ('QUEUED' as const),
          failureCode: env.NODE_ENV === 'production' ? 'FINANCIAL_POLICY_REQUIRED' : null,
        },
        {
          createdAt: now,
          contractId: contract.id,
          kind: 'ANNUAL_REVIEW' as const,
          jobKey: 'review:' + contract.id,
          sourceSpaceId: contract.rentalSpaceId,
          sourceStartDate: contract.startDate,
          cursor: anniversary(contract.startDate, 12),
          nextRunAt: dubaiMidnight(anniversary(contract.startDate, 12)),
        },
      ]),
      skipDuplicates: true,
    });
  return contracts.length === 100 ? contracts.at(-1)!.id : '';
}
export async function materializeRoomExpiryJobs(after = '', contractId?: string) {
  const requests = await prisma.request.findMany({
    where: {
      id: { gt: after },
      ...(contractId ? { contractId } : {}),
      type: 'ROOM_CHANGE',
      status: { in: ['SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'REOPENED'] },
    },
    select: {
      id: true,
      createdAt: true,
      contractId: true,
      contract: { select: { startDate: true, rentalSpaceId: true } },
      events: {
        where: { kind: 'SUBMITTED' },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { id: 'asc' },
    take: 100,
  });
  if (requests.length)
    await prisma.businessJob.createMany({
      data: requests.map((request) => ({
        contractId: request.contractId,
        kind: 'ROOM_CHANGE_EXPIRY' as const,
        jobKey: 'room-expiry:' + request.id,
        sourceRequestId: request.id,
        sourceSpaceId: request.contract.rentalSpaceId,
        sourceStartDate: request.contract.startDate,
        cursor: roomExpiry(request.events[0]?.createdAt ?? request.createdAt),
        nextRunAt: roomExpiry(request.events[0]?.createdAt ?? request.createdAt),
      })),
      skipDuplicates: true,
    });
  return requests.length === 100 ? requests.at(-1)!.id : '';
}
function calendarDateFromSource(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
export async function runBusinessJobOnce(
  options: {
    now?: Date;
    kinds?: BusinessJobKind[];
    afterClaim?: (id: string) => Promise<void>;
  } = {},
) {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid worker clock');
  const job = await prisma.$transaction(
    async (tx) => {
      const kinds = options.kinds?.length
        ? Prisma.sql`AND kind IN (${Prisma.join(options.kinds)})`
        : Prisma.empty;
      const rows = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM BusinessJob WHERE ((state = 'QUEUED' AND nextRunAt <= ${now}) OR (state = 'RUNNING' AND leaseExpiresAt <= ${now})) ${kinds} ORDER BY nextRunAt,createdAt,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      if (!rows[0]) return null;
      const current = await tx.businessJob.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (current.attempts >= 3) {
        await tx.businessJob.update({
          where: { id: current.id },
          data: {
            state: 'FAILED',
            failureCode: 'ATTEMPT_LIMIT',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        return null;
      }
      return tx.businessJob.update({
        where: { id: current.id },
        data: {
          state: 'RUNNING',
          attempts: { increment: 1 },
          lastRunAt: now,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 90000),
          failureCode: null,
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
  if (!job) return false;
  try {
    await options.afterClaim?.(job.id);
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM BusinessJob WHERE id = ${job.id} FOR UPDATE`;
        const current = await tx.businessJob.findUniqueOrThrow({ where: { id: job.id } });
        if (current.state !== 'RUNNING' || current.leaseToken !== job.leaseToken) return;
        await tx.$queryRaw`SELECT id FROM Contract WHERE id = ${job.contractId} FOR UPDATE`;
        const contract = await tx.contract.findUniqueOrThrow({
          where: { id: job.contractId },
          include: {
            tenant: { include: { user: true } },
            rentalSpace: {
              include: { unit: { include: { manager: { include: { user: true } } } } },
            },
            amendments: { where: { status: { not: 'PROPOSED' } }, select: { id: true } },
          },
        });
        const finish = async (
          state: 'QUEUED' | 'PAUSED' | 'STOPPED',
          failureCode: string | null,
          cursor = job.cursor,
          nextRunAt = job.nextRunAt,
          processed = false,
        ) => {
          await tx.businessJob.update({
            where: { id: job.id },
            data: {
              state,
              failureCode,
              cursor,
              nextRunAt,
              attempts: 0,
              leaseToken: null,
              leaseExpiresAt: null,
              ...(processed ? { processed: { increment: 1 }, lastSuccessAt: now } : {}),
            },
          });
        };
        if (contract.timezone !== 'Asia/Dubai') throw new Error('TIMEZONE_POLICY_REQUIRED');
        if (
          contract.rentalSpaceId !== job.sourceSpaceId ||
          contract.startDate.getTime() !== job.sourceStartDate.getTime()
        )
          throw new Error('SOURCE_ALLOCATION_CHANGED');
        if (contract.tenant.managerId !== contract.rentalSpace.unit.managerId)
          throw new Error('OWNERSHIP_MISMATCH');
        const manager = contract.rentalSpace.unit.manager;
        if (manager.user.status !== 'ACTIVE') {
          await finish('PAUSED', 'MANAGER_INACTIVE');
          return;
        }
        if (job.kind === 'ROOM_CHANGE_EXPIRY') {
          if (!job.sourceRequestId) throw new Error('REQUEST_SOURCE_INVALID');
          await tx.$queryRaw`SELECT id FROM Request WHERE id = ${job.sourceRequestId} FOR UPDATE`;
          const request = await tx.request.findUniqueOrThrow({
            where: { id: job.sourceRequestId },
            include: {
              events: {
                where: { kind: { in: ['SUBMITTED', 'APPROVED'] } },
                orderBy: { createdAt: 'asc' },
              },
            },
          });
          if (request.contractId !== contract.id || request.type !== 'ROOM_CHANGE')
            throw new Error('REQUEST_SOURCE_INVALID');
          if (
            request.events.some((event) => event.kind === 'APPROVED') ||
            !['SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'REOPENED'].includes(request.status)
          ) {
            await finish('STOPPED', 'REQUEST_NO_LONGER_ELIGIBLE');
            return;
          }
          const expiry = roomExpiry(
            request.events.find((event) => event.kind === 'SUBMITTED')?.createdAt ??
              request.createdAt,
          );
          if (expiry.getTime() !== job.cursor.getTime()) throw new Error('REQUEST_DATE_CHANGED');
          if (now < expiry) {
            await finish('QUEUED', null, expiry, expiry);
            return;
          }
          const event = await tx.requestEvent.create({
            data: {
              requestId: request.id,
              kind: 'REJECTED',
              fromStatus: request.status,
              sequence: request.version + 1,
              actorName: 'System',
              message: roomExpiryReason,
              createdAt: now,
            },
          });
          await tx.request.update({
            where: { id: request.id },
            data: { status: 'REJECTED', version: { increment: 1 } },
          });
          await tx.notification.createMany({
            data: [manager.userId, contract.tenant.userId].map((recipientUserId) => ({
              recipientUserId,
              eventId: event.id,
            })),
            skipDuplicates: true,
          });
          await queueCaseNotices(tx, event.id);
          await tx.auditEvent.create({
            data: {
              action: 'ROOM_CHANGE_EXPIRED',
              entityType: 'Request',
              entityId: request.id,
              oldValue: { status: request.status },
              newValue: {
                status: 'REJECTED',
                reason: roomExpiryReason,
                rule: 'room-change-five-calendar-days-v1',
                evaluatedAt: now.toISOString(),
                deadline: expiry.toISOString(),
                jobId: job.id,
              },
            },
          });
          await finish('STOPPED', null, expiry, expiry, true);
          return;
        }
        if (!openStatuses.includes(contract.status as (typeof openStatuses)[number])) {
          await finish('STOPPED', 'CONTRACT_NOT_ACTIVE');
          return;
        }
        if (job.kind === 'OBLIGATION_STATUS') {
          if (env.NODE_ENV === 'production') {
            await finish('PAUSED', 'FINANCIAL_POLICY_REQUIRED');
            return;
          }
          const today = dubaiMidnight(calendarDate(now));
          const rows = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM Payment WHERE contractId = ${contract.id} AND ((status = 'UPCOMING' AND dueDate <= ${now}) OR (status IN ('DUE','PARTIALLY_PAID') AND dueDate < ${today})) ORDER BY dueDate,id LIMIT 100 FOR UPDATE`,
          );
          for (const candidate of rows) {
            const payment = await tx.payment.findUniqueOrThrow({ where: { id: candidate.id } });
            const state = payment.amountPaid.gte(payment.amountDue)
              ? 'PAID'
              : payment.dueDate < today
                ? 'LATE'
                : payment.amountPaid.gt(0)
                  ? 'PARTIALLY_PAID'
                  : 'DUE';
            if (state === payment.status) continue;
            await tx.payment.update({ where: { id: payment.id }, data: { status: state } });
            await tx.auditEvent.create({
              data: {
                action: 'OBLIGATION_STATUS_CHANGED',
                entityType: 'Payment',
                entityId: payment.id,
                oldValue: { status: payment.status },
                newValue: {
                  status: state,
                  rule: 'original-due-dubai-calendar-v1',
                  evaluatedAt: now.toISOString(),
                  jobId: job.id,
                  amountChanged: false,
                },
              },
            });
          }
          const tomorrow = calendarDate(now);
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          await finish(
            'QUEUED',
            null,
            tomorrow,
            rows.length === 100 ? now : dubaiMidnight(tomorrow),
            true,
          );
          return;
        }
        if (job.kind === 'MONTHLY_OBLIGATIONS') {
          if (env.NODE_ENV === 'production') {
            await finish('PAUSED', 'FINANCIAL_POLICY_REQUIRED');
            return;
          }
          if (contract.amendments.length) throw new Error('AMENDMENT_POLICY_REQUIRED');
          if (
            !contract.monthlyRent.gt(0) ||
            !['AED', 'USD'].includes(contract.currency) ||
            contract.dueDay < 1 ||
            contract.dueDay > 28
          )
            throw new Error('SOURCE_TERMS_INVALID');
          if (contract.endDate && job.cursor >= monthStart(contract.endDate)) {
            await finish('PAUSED', 'FINAL_MONTH_POLICY_REQUIRED');
            return;
          }
          const first = monthStart(contract.startDate).getTime() === job.cursor.getTime();
          const next = monthStart(job.cursor, 1);
          const existing = await tx.payment.findFirst({
            where: { contractId: contract.id, periodStart: { gte: job.cursor, lt: next } },
            select: { id: true },
          });
          if (!existing) {
            const value = first
              ? proratedRentDecimal(contract.monthlyRent, contract.startDate)
              : contract.monthlyRent;
            const dueAt = first
              ? dubaiMidnight(calendarDateFromSource(contract.startDate))
              : dueDate(job.cursor, contract.dueDay);
            const today = dubaiMidnight(calendarDate(now));
            const row = await tx.payment.create({
              data: {
                contractId: contract.id,
                periodStart: first ? contract.startDate : job.cursor,
                dueDate: dueAt,
                amountDue: value,
                currency: contract.currency,
                status: dueAt < today ? 'LATE' : dueAt <= now ? 'DUE' : 'UPCOMING',
              },
            });
            await tx.auditEvent.create({
              data: {
                action: 'MONTHLY_OBLIGATION_CREATED',
                entityType: 'Payment',
                entityId: row.id,
                newValue: {
                  jobId: job.id,
                  contractId: contract.id,
                  periodStart: row.periodStart.toISOString(),
                  amountDue: value.toFixed(2),
                  currency: contract.currency,
                  rule: first ? 'initial-development-proration-v1' : 'full-month-contract-rent-v1',
                  evaluatedAt: now.toISOString(),
                  timezone: contract.timezone,
                },
              },
            });
          }
          await finish('QUEUED', null, next, dubaiMidnight(next), true);
          return;
        }
        if (contract.endDate && job.cursor > calendarDateFromSource(contract.endDate)) {
          await finish('STOPPED', 'REVIEW_PERIOD_ENDED');
          return;
        }
        const milestone = nextReviewMonth(contract.startDate, job.cursor);
        if (
          milestone < 12 ||
          milestone % 12 ||
          anniversary(contract.startDate, milestone).getTime() !== job.cursor.getTime()
        )
          throw new Error('REVIEW_DATE_INVALID');
        const existing = await tx.contractReview.findUnique({
          where: { contractId_dueAt: { contractId: contract.id, dueAt: job.cursor } },
        });
        if (!existing) {
          const review = await tx.contractReview.create({
            data: {
              contractId: contract.id,
              dueAt: job.cursor,
              rentalSpaceId: job.sourceSpaceId,
              sameSpaceSince: contract.startDate,
              milestoneMonths: milestone,
              spaceNameSnapshot: contract.rentalSpace.name,
              unitNameSnapshot: contract.rentalSpace.unit.name,
            },
          });
          const event = await tx.contractReviewEvent.create({
            data: {
              reviewId: review.id,
              kind: 'REVIEW_DUE',
              actorName: 'System',
              note: 'Annual review is due. Contract rent remains unchanged.',
              createdAt: now,
            },
          });
          await tx.notification.create({
            data: { recipientUserId: manager.userId, reviewEventId: event.id },
          });
          await queueRecordNotices(tx, { reviewEventId: event.id });
          await tx.auditEvent.create({
            data: {
              action: 'ANNUAL_REVIEW_CREATED',
              entityType: 'ContractReview',
              entityId: review.id,
              newValue: {
                contractId: contract.id,
                spaceId: job.sourceSpaceId,
                sameSpaceSince: contract.startDate.toISOString(),
                milestoneMonths: milestone,
                rule: 'same-space-calendar-anniversary-v1',
                evaluatedAt: now.toISOString(),
                jobId: job.id,
              },
            },
          });
        }
        const next = anniversary(contract.startDate, milestone + 12);
        await finish('QUEUED', null, next, dubaiMidnight(next), true);
      },
      { isolationLevel: 'ReadCommitted', timeout: 30000 },
    );
  } catch (cause) {
    const allowed = [
      'DUE_DAY_POLICY_REQUIRED',
      'TIMEZONE_POLICY_REQUIRED',
      'SOURCE_ALLOCATION_CHANGED',
      'OWNERSHIP_MISMATCH',
      'AMENDMENT_POLICY_REQUIRED',
      'REVIEW_DATE_INVALID',
      'REQUEST_SOURCE_INVALID',
      'REQUEST_DATE_CHANGED',
      'SOURCE_TERMS_INVALID',
    ];
    const failureCode =
      cause instanceof Error && allowed.includes(cause.message)
        ? cause.message
        : 'BUSINESS_JOB_FAILED';
    await prisma.businessJob.updateMany({
      where: { id: job.id, state: 'RUNNING', leaseToken: job.leaseToken },
      data: {
        state: allowed.includes(failureCode) || job.attempts >= 3 ? 'FAILED' : 'QUEUED',
        failureCode,
        nextRunAt: new Date(now.getTime() + 30000 * job.attempts),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
  return true;
}
