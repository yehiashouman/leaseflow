import type { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { caseScope, caseContractScope } from './case-data.js';
export function reviewContractScope(actor: FastifyRequest['user']): Prisma.ContractWhereInput {
  return {
    ...caseContractScope(actor),
    ...(actor.role === 'TENANT' ? { status: { not: 'DRAFT' as const } } : {}),
  };
}
export function notificationScope(actor: FastifyRequest['user']): Prisma.NotificationWhereInput {
  return {
    recipientUserId: actor.sub,
    OR: [
      { event: { request: caseScope(actor) } },
      { reviewEvent: { review: { contract: reviewContractScope(actor) } } },
    ],
  };
}
export const notificationTargetSelect = {
  event: { select: { kind: true, request: { select: { id: true, title: true } } } },
  reviewEvent: { select: { kind: true, review: { select: { id: true, contractId: true } } } },
} as const;
type Target = {
  event: { kind: string; request: { id: string; title?: string } } | null;
  reviewEvent: { kind: string; review: { id: string; contractId?: string } } | null;
};
export function notificationTarget(row: Target) {
  if (row.event)
    return {
      kind: row.event.kind,
      path: '/requests/' + encodeURIComponent(row.event.request.id),
      title: row.event.request.title ?? 'Case update',
      format: 'case-notice-v1' as const,
    };
  if (row.reviewEvent)
    return {
      kind: row.reviewEvent.kind,
      path: '/reviews/' + encodeURIComponent(row.reviewEvent.review.id),
      title: 'Annual contract review',
      format: 'record-notice-v1' as const,
    };
  throw new Error('Notification source is absent');
}
