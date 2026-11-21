import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { caseActor, caseAudit, caseContractScope, lockCaseContract } from '../case-data.js';
import { calendarDate } from '../business-calendar.js';
import { prisma } from '../db.js';
import { depositBalance } from '../deposit-ledger.js';
import { noticeFingerprint, noticePreview } from '../move-out-notice.js';

const identifier = z.object({ id: z.string().min(1).max(191) });
const dateInput = z.object({ desiredDate: z.iso.date() }).strict();
const submitInput = dateInput.extend({
  clientId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
  explanation: z.string().trim().min(3).max(5000),
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
        depositEntries: {
          select: {
            type: true,
            amount: true,
            category: true,
            events: {
              orderBy: { sequence: 'asc' },
              select: { action: true, amount: true, category: true },
            },
          },
        },
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
};
