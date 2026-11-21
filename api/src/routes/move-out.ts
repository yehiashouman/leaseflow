import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import {
  caseActor,
  caseAudit,
  caseContractScope,
  lockCase,
  lockCaseContract,
  moveOutResponse,
} from '../case-data.js';
import { calendarDate } from '../business-calendar.js';
import { prisma } from '../db.js';
import { depositBalance, depositSummarySelect } from '../deposit-ledger.js';
import { noticeFingerprint, noticePreview } from '../move-out-notice.js';

const identifier = z.object({ id: z.string().min(1).max(191) });
const dateInput = z.object({ desiredDate: z.iso.date() }).strict();
const submitInput = dateInput.extend({
  clientId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
  explanation: z.string().trim().min(3).max(5000),
});

const managerInput = z.strictObject({
  clientId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  amount: z
    .string()
    .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
    .transform((value) => new Prisma.Decimal(value).toFixed(2)),
  explanation: z.string().trim().min(3).max(3000),
});
const storedNotice = z.object({
  moveOut: z.object({ proposedDeduction: z.string().regex(/^\d+\.\d{2}$/) }),
});

export const moveOutRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const tenant = allowRoles('TENANT');
  const eligible = (
    id: string,
    actor: Parameters<typeof caseContractScope>[0],
  ): Prisma.ContractWhereInput => ({ id, ...caseContractScope(actor), status: 'ACTIVE' });

  async function calculate(
    tx: Prisma.TransactionClient,
    id: string,
    actor: Parameters<typeof caseContractScope>[0],
    desiredDate: string,
    now: Date,
  ) {
    const contract = await tx.contract.findFirst({
      where: eligible(id, actor),
      select: {
        startDate: true,
        status: true,
        noticeDays: true,
        monthlyRent: true,
        currency: true,
        depositAmount: true,
        amendments: {
          where: { status: 'CONFIRMED' },
          select: { effectiveDate: true, confirmedAt: true, changes: true },
        },
        depositEntries: { select: depositSummarySelect },
      },
    });
    if (!contract) throw app.httpErrors.notFound('Active contract not found');
    if (
      desiredDate < calendarDate(now).toISOString().slice(0, 10) ||
      desiredDate < contract.startDate.toISOString().slice(0, 10)
    )
      throw app.httpErrors.unprocessableEntity(
        'Choose a move-out date on or after today and the contract start date.',
      );
    const balance = depositBalance(
      contract.depositEntries,
      contract.depositAmount,
      contract.status,
    );
    if (!balance.reconciled)
      throw app.httpErrors.conflict(
        'The deposit must be reconciled before you can preview this notice.',
      );
    const preview = noticePreview(now, desiredDate, contract, balance.held, balance.reserved);
    return { preview, fingerprint: noticeFingerprint(id, preview) };
  }

  app.post('/:id/move-out/preview', { preHandler: tenant }, async (request) => {
    const { id } = identifier.parse(request.params);
    const { desiredDate } = dateInput.parse(request.body);
    return prisma.$transaction((tx) => calculate(tx, id, request.user, desiredDate, new Date()), {
      isolationLevel: 'RepeatableRead',
    });
  });

  app.post('/:id/move-out', { preHandler: tenant }, async (request, reply) => {
    const { id } = identifier.parse(request.params);
    const body = submitInput.parse(request.body);
    const result = await prisma.$transaction(
      async (tx) => {
        const actor = await caseActor(tx, request);
        if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
        if (!(await lockCaseContract(tx, id, request.user)))
          throw app.httpErrors.notFound('Contract not found');
        const prior = await tx.request.findUnique({
          where: { contractId_clientId: { contractId: id, clientId: body.clientId } },
          select: { id: true, type: true, description: true, metadata: true },
        });
        if (prior) {
          const history = z
            .object({
              previewFingerprint: z.string(),
              moveOut: z.object({ desiredDate: z.iso.date() }),
            })
            .safeParse(prior.metadata);
          if (
            prior.type !== 'MOVE_OUT' ||
            prior.description !== body.explanation ||
            history.data?.previewFingerprint !== body.fingerprint ||
            history.data.moveOut.desiredDate !== body.desiredDate
          )
            throw app.httpErrors.conflict('Move-out key reused with different content.');
          return { requestId: prior.id, repeated: true };
        }
        const now = new Date();
        const { preview, fingerprint } = await calculate(
          tx,
          id,
          request.user,
          body.desiredDate,
          now,
        );
        if (fingerprint !== body.fingerprint)
          throw app.httpErrors.conflict(
            'The move-out preview changed. Verify the dates and balances and confirm again.',
          );
        const pending = await tx.request.findFirst({
          where: { contractId: id, type: 'MOVE_OUT', status: { notIn: ['CLOSED', 'REJECTED'] } },
          select: { id: true },
        });
        if (pending)
          throw app.httpErrors.conflict('A move-out request is already open for this contract.');
        const row = await tx.request.create({
          data: {
            contractId: id,
            clientId: body.clientId,
            type: 'MOVE_OUT',
            title: 'Move-out notice',
            description: body.explanation,
            status: 'SUBMITTED',
            version: 1,
            metadata: {
              moveOut: { ...preview, submittedAt: now.toISOString() },
              previewFingerprint: fingerprint,
            },
            events: {
              create: {
                ...actor,
                kind: 'SUBMITTED',
                message: body.explanation,
                sequence: 1,
                createdAt: now,
              },
            },
          },
          select: {
            id: true,
            type: true,
            status: true,
            version: true,
            events: { select: { id: true } },
          },
        });
        await caseAudit(tx, request, row, row.events[0]!.id, 'REQUEST_SUBMIT');
        return { requestId: row.id, repeated: false };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(result.repeated ? 200 : 201).send({ requestId: result.requestId });
  });
  app.post(
    '/:id/move-out/:requestId/response',
    { preHandler: allowRoles('LEASING_MANAGER') },
    async (request, reply) => {
      const { id, requestId } = identifier
        .extend({ requestId: identifier.shape.id })
        .parse(request.params);
      const body = managerInput.parse(request.body);
      const amount = new Prisma.Decimal(body.amount);
      const hash = createHash('sha256')
        .update(JSON.stringify({ id, requestId, ...body }))
        .digest('hex');
      const result = await prisma.$transaction(
        async (tx) => {
          const actor = await caseActor(tx, request);
          if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
          if (
            !(await lockCaseContract(tx, id, request.user)) ||
            !(await lockCase(tx, requestId, request.user))
          )
            throw app.httpErrors.notFound('Move-out notice not found');
          const row = await tx.request.findFirst({
            where: { id: requestId, contractId: id, type: 'MOVE_OUT' },
            select: { id: true, type: true, status: true, metadata: true, version: true },
          });
          if (!row) throw app.httpErrors.notFound('Move-out notice not found');
          const duplicate = await tx.requestEvent.findUnique({
            where: { requestId_clientId: { requestId, clientId: body.clientId } },
            select: { kind: true, metadata: true },
          });
          if (duplicate) {
            const saved = z.object({ responseHash: z.string() }).safeParse(duplicate.metadata);
            if (duplicate.kind !== 'MOVE_OUT_RESPONSE' || saved.data?.responseHash !== hash)
              throw app.httpErrors.conflict('Response key reused with different content.');
            return { repeated: true };
          }
          const existing = z
            .object({ moveOutResponse: moveOutResponse.optional() })
            .safeParse(row.metadata);
          const notice = storedNotice.safeParse(row.metadata);
          if (
            row.status !== 'SUBMITTED' ||
            existing.data?.moveOutResponse ||
            !notice.success ||
            row.version !== body.expectedVersion
          )
            throw app.httpErrors.conflict(
              'The notice changed. Verify its current state before responding.',
            );
          const contract = await tx.contract.findFirst({
            where: eligible(id, request.user),
            select: {
              currency: true,
              depositAmount: true,
              status: true,
              depositEntries: { select: depositSummarySelect },
            },
          });
          if (!contract) throw app.httpErrors.conflict('The notice requires an active contract.');
          const maximum = new Prisma.Decimal(notice.data.moveOut.proposedDeduction);
          const balance = depositBalance(
            contract.depositEntries,
            contract.depositAmount,
            contract.status,
          );
          if (
            amount.gt(maximum) ||
            (amount.gt(0) &&
              (!balance.reconciled || amount.gt(balance.held.minus(balance.reserved))))
          )
            throw app.httpErrors.conflict(
              'The amount exceeds the submitted notice deduction or the current available deposit.',
            );
          const proposal = amount.gt(0)
            ? await tx.depositEntry.create({
                data: {
                  contractId: id,
                  type: 'DEDUCTION_PROPOSED',
                  category: 'NOTICE',
                  amount,
                  description: body.explanation,
                  noticeRequestId: requestId,
                  events: {
                    create: {
                      actorUserId: request.user.sub,
                      actorRole: request.user.role,
                      clientId: body.clientId,
                      payloadHash: hash,
                      sequence: 1,
                      action: 'PROPOSE',
                      category: 'NOTICE',
                      amount,
                      message: body.explanation,
                    },
                  },
                },
                select: { id: true },
              })
            : null;
          const response = {
            amount: body.amount,
            currency: contract.currency,
            explanation: body.explanation,
            proposalId: proposal?.id ?? null,
          };
          const event = await tx.requestEvent.create({
            data: {
              requestId,
              clientId: body.clientId,
              ...actor,
              kind: 'MOVE_OUT_RESPONSE',
              sequence: row.version + 1,
              fromStatus: row.status,
              message: body.explanation,
              metadata: { responseHash: hash, moveOutResponse: response },
            },
            select: { id: true },
          });
          const updated = await tx.request.update({
            where: { id: requestId },
            data: {
              status: 'SEEN',
              version: row.version + 1,
              metadata: { ...(row.metadata as Prisma.JsonObject), moveOutResponse: response },
            },
            select: { id: true, type: true, status: true, version: true },
          });
          await caseAudit(tx, request, updated, event.id, 'MOVE_OUT_RESPONSE');
          return { repeated: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(result.repeated ? 200 : 201).send({ requestId });
    },
  );
};
