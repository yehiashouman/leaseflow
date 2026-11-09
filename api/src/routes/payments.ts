import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { activeAccount } from '../account-data.js';
import { caseContractScope } from '../case-data.js';

const select = {
  id: true,
  paymentId: true,
  amount: true,
  currency: true,
  paidAt: true,
  method: true,
  reference: true,
  recordedBalance: true,
  createdAt: true,
} as const;
const amount = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/,
    'Use a decimal amount with at most two decimal places.',
  )
  .refine((value) => new Prisma.Decimal(value).gt(0), 'Amount must exceed zero.')
  .transform((value) => new Prisma.Decimal(value).toFixed(2));
export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const scope = (user: Parameters<typeof caseContractScope>[0]) => ({
    ...caseContractScope(user),
    ...(user.role === 'TENANT' ? { status: { not: 'DRAFT' as const } } : {}),
  });
  app.get(
    '/:id/receipts',
    { preHandler: allowRoles('LEASING_MANAGER', 'TENANT') },
    async (request) => {
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      const { page } = z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict()
        .parse(request.query);
      return prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.findFirst({
            where: { id, contract: scope(request.user) },
            select: { id: true, amountPaid: true, currency: true },
          });
          if (!payment) throw app.httpErrors.notFound('Payment not found');
          const where = { paymentId: id, payment: { contract: scope(request.user) } };
          const [items, total] = await Promise.all([
            tx.paymentReceipt.findMany({
              where,
              select,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip: (page - 1) * 20,
              take: 20,
            }),
            tx.paymentReceipt.count({ where }),
          ]);
          return {
            items,
            total,
            page,
            pageSize: 20,
            recordEnabled: env.NODE_ENV !== 'production',
            recordedTotal: payment.amountPaid,
            currency: payment.currency,
            basis:
              'External rent payment records; historical totals can predate individual receipt records. No money collection or tenant acknowledgement is implied.',
          };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    },
  );
  app.post(
    '/:id/record',
    {
      preHandler: allowRoles('LEASING_MANAGER'),
      config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      if (env.NODE_ENV === 'production')
        throw app.httpErrors.conflict(
          'Payment records require approved financial and acknowledgement policies.',
        );
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      const body = z
        .object({
          clientId: z.uuid(),
          amountPaid: amount,
          paidAt: z.iso.datetime({ offset: true }),
          method: z.string().trim().min(1).max(50),
          reference: z.string().trim().max(150).nullable().default(null),
        })
        .strict()
        .parse(request.body);
      if (new Date(body.paidAt).getTime() > Date.now())
        throw app.httpErrors.unprocessableEntity('Payment date cannot be in the future');
      const normalized = { ...body, paidAt: new Date(body.paidAt).toISOString() };
      const hash = createHash('sha256')
        .update(JSON.stringify({ paymentId: id, ...normalized }))
        .digest('hex');
      const result = await prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const visible = {
            id,
            contract: { ...scope(request.user), status: { not: 'DRAFT' as const } },
          };
          if (!(await tx.payment.findFirst({ where: visible, select: { id: true } })))
            throw app.httpErrors.notFound('Payment not found');
          await tx.$queryRaw`SELECT id FROM Payment WHERE id = ${id} FOR UPDATE`;
          const payment = await tx.payment.findFirst({ where: visible });
          if (!payment) throw app.httpErrors.notFound('Payment not found');
          const previous = await tx.paymentReceipt.findUnique({
            where: {
              actorUserId_clientId: { actorUserId: request.user.sub, clientId: body.clientId },
            },
            select: { ...select, payloadHash: true },
          });
          if (previous) {
            if (previous.payloadHash !== hash)
              throw app.httpErrors.conflict('Payment key reused with different content');
            return {
              receipt: await tx.paymentReceipt.findUniqueOrThrow({
                where: { id: previous.id },
                select,
              }),
              repeated: true,
            };
          }
          if (['ADJUSTED', 'DISPUTED'].includes(payment.status))
            throw app.httpErrors.conflict(
              'Resolve the obligation adjustment or dispute before a payment record.',
            );
          const total = new Prisma.Decimal(payment.amountPaid).plus(body.amountPaid);
          if (total.gt(payment.amountDue))
            throw app.httpErrors.conflict(
              'Overpayment requires an approved credit and allocation policy',
            );
          const status = total.eq(payment.amountDue) ? 'PAID' : 'PARTIALLY_PAID';
          const receipt = await tx.paymentReceipt.create({
            data: {
              paymentId: id,
              actorUserId: request.user.sub,
              clientId: body.clientId,
              payloadHash: hash,
              amount: body.amountPaid,
              currency: payment.currency,
              paidAt: new Date(body.paidAt),
              method: body.method,
              reference: body.reference,
              recordedBalance: total,
            },
            select,
          });
          await tx.payment.update({
            where: { id },
            data: {
              amountPaid: total,
              status,
              paidAt: new Date(body.paidAt),
              method: body.method,
              reference: body.reference,
            },
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              action: 'RECORD_PAYMENT',
              entityType: 'PaymentReceipt',
              entityId: receipt.id,
              ip: request.ip,
              userAgent: request.headers['user-agent'],
              oldValue: { amountPaid: payment.amountPaid.toFixed(2), status: payment.status },
              newValue: {
                paymentId: id,
                amount: body.amountPaid,
                amountPaid: total.toFixed(2),
                currency: payment.currency,
                status,
              },
            },
          });
          return { receipt, repeated: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(result.repeated ? 200 : 201).send(result.receipt);
    },
  );
};
