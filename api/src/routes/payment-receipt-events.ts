import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { activeAccount } from '../account-data.js';
import { allowRoles } from '../auth.js';
import { caseContractScope } from '../case-data.js';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { rentWindows } from '../rent-dashboard.js';
import { queueReceiptNotice } from '../notice-data.js';

const parameters = z.object({
  id: z.string().min(1).max(191),
  receiptId: z.string().min(1).max(191),
});
const input = z
  .strictObject({
    clientId: z.uuid(),
    action: z.enum(['ACKNOWLEDGE', 'REPORT_ERROR', 'REVERSE']),
    reason: z.string().trim().min(3).max(3000).optional(),
  })
  .refine(
    (value) => (value.action !== 'ACKNOWLEDGE') === Boolean(value.reason),
    'Provide a reason for a report or reversal.',
  );

export function registerReceiptEvents(app: FastifyInstance) {
  app.post(
    '/:id/receipts/:receiptId/events',
    {
      preHandler: allowRoles('LEASING_MANAGER', 'TENANT'),
      config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const { id, receiptId } = parameters.parse(request.params);
      const body = input.parse(request.body);
      const manager = request.user.role === 'LEASING_MANAGER';
      if (manager !== (body.action === 'REVERSE'))
        throw app.httpErrors.forbidden('This receipt action is unavailable for your role.');
      if (body.action === 'REVERSE' && env.NODE_ENV === 'production')
        throw app.httpErrors.conflict(
          'Production payment records require approved financial policies.',
        );
      const hash = createHash('sha256')
        .update(JSON.stringify({ id, receiptId, ...body }))
        .digest('hex');
      const result = await prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const where = {
            id: receiptId,
            paymentId: id,
            payment: {
              contract: {
                ...caseContractScope(request.user),
                status: { notIn: ['DRAFT', 'CANCELLED'] as ('DRAFT' | 'CANCELLED')[] },
              },
            },
          };
          if (!(await tx.paymentReceipt.count({ where })))
            throw app.httpErrors.notFound('Receipt not found.');
          await tx.$queryRaw`SELECT id FROM Payment WHERE id = ${id} FOR UPDATE`;
          const receipt = await tx.paymentReceipt.findFirst({
            where,
            include: {
              events: true,
              payment: {
                include: {
                  contract: {
                    select: {
                      tenant: { select: { userId: true, manager: { select: { userId: true } } } },
                    },
                  },
                },
              },
            },
          });
          if (!receipt) throw app.httpErrors.notFound('Receipt not found.');
          const previous = await tx.paymentReceiptEvent.findUnique({
            where: {
              actorUserId_clientId: { actorUserId: request.user.sub, clientId: body.clientId },
            },
            select: { id: true, payloadHash: true },
          });
          if (previous) {
            if (previous.payloadHash !== hash)
              throw app.httpErrors.conflict('Receipt key reused with different content.');
            return { eventId: previous.id, repeated: true };
          }
          if (receipt.events.some(({ kind }) => kind === 'REVERSE' || kind === body.action))
            throw app.httpErrors.conflict(
              'This receipt action is already recorded or unavailable.',
            );
          const now = new Date();
          let paid = receipt.payment.amountPaid;
          if (body.action === 'REVERSE') {
            if (
              ['ADJUSTED', 'DISPUTED'].includes(receipt.payment.status) ||
              paid.lt(receipt.amount)
            )
              throw app.httpErrors.conflict('The obligation balance requires reconciliation.');
            paid = paid.minus(receipt.amount);
            const windows = rentWindows(now);
            const due = receipt.payment.expectedDate ?? receipt.payment.dueDate;
            const latest = await tx.paymentReceipt.findFirst({
              where: {
                paymentId: id,
                id: { not: receiptId },
                events: { none: { kind: 'REVERSE' } },
              },
              select: { paidAt: true, method: true, reference: true },
              orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
            });
            const status = paid.gt(0)
              ? 'PARTIALLY_PAID'
              : due < windows.today
                ? 'LATE'
                : due < windows.tomorrow
                  ? 'DUE'
                  : 'UPCOMING';
            await tx.payment.update({
              where: { id },
              data: {
                amountPaid: paid,
                status,
                paidAt: latest?.paidAt ?? null,
                method: latest?.method ?? null,
                reference: latest?.reference ?? null,
              },
            });
          }
          const event = await tx.paymentReceiptEvent.create({
            data: {
              receiptId,
              actorUserId: request.user.sub,
              clientId: body.clientId,
              payloadHash: hash,
              kind: body.action,
              reason: body.reason ?? null,
              createdAt: now,
            },
            select: { id: true },
          });
          await queueReceiptNotice(
            tx,
            event.id,
            manager
              ? receipt.payment.contract.tenant.userId
              : receipt.payment.contract.tenant.manager.userId,
          );
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              ip: request.ip,
              userAgent: request.headers['user-agent'],
              entityType: 'PaymentReceipt',
              entityId: receiptId,
              action: 'RECEIPT_' + body.action,
              oldValue: { paid: receipt.payment.amountPaid.toFixed(2) },
              newValue: {
                paymentId: id,
                eventId: event.id,
                paid: paid.toFixed(2),
                reason: body.reason ?? null,
              },
            },
          });
          return { eventId: event.id, repeated: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(result.repeated ? 200 : 201).send({ eventId: result.eventId });
    },
  );
}
