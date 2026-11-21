import { createHash } from 'node:crypto';
import { type Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { roomExpiry } from '../business-jobs.js';
import {
  caseActor,
  caseAudit,
  caseContractScope,
  lockCase,
  lockCaseContract,
} from '../case-data.js';
import { prisma } from '../db.js';
import {
  nextRoomApproval,
  roomChangeMetadata,
  roomChangePending,
  roomNegotiationDeadline,
} from '../room-change-policy.js';

const id = z.string().min(1).max(191);
const source = z.object({ id });
const submission = z.strictObject({
  clientId: z.uuid(),
  explanation: z.string().trim().min(3).max(5000),
  preferences: z.string().trim().max(3000).default(''),
});
const command = z.strictObject({
  clientId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  action: z.enum(['APPROVE', 'REJECT', 'WITHDRAW', 'CANCEL', 'EXTEND', 'VIEWING']),
  explanation: z.string().trim().min(3).max(3000),
});
const statuses = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  WITHDRAW: 'CLOSED',
  CANCEL: 'CLOSED',
  EXTEND: 'APPROVED',
  VIEWING: 'APPROVED',
} as const;
const kinds = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  WITHDRAW: 'ROOM_WITHDRAWN',
  CANCEL: 'ROOM_CANCELLED',
  EXTEND: 'ROOM_NEGOTIATION_EXTENDED',
  VIEWING: 'ROOM_VIEWING',
} as const;
const snapshot = z.object({ roomChange: roomChangeMetadata });

async function latestApproval(tx: Prisma.TransactionClient, tenantId: string) {
  return tx.requestEvent.findFirst({
    where: { kind: 'APPROVED', request: { type: 'ROOM_CHANGE', contract: { tenantId } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true },
  });
}

function job(
  contract: { id: string; rentalSpaceId: string; startDate: Date },
  requestId: string,
  expiry: Date,
  negotiation = false,
) {
  return {
    contractId: contract.id,
    sourceRequestId: requestId,
    sourceSpaceId: contract.rentalSpaceId,
    sourceStartDate: contract.startDate,
    kind: 'ROOM_CHANGE_EXPIRY' as const,
    jobKey: negotiation
      ? 'room-negotiation:' + requestId + ':' + expiry.getTime()
      : 'room-expiry:' + requestId,
    nextRunAt: expiry,
    cursor: expiry,
  };
}

export const roomChangeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  function contract(
    tx: Prisma.TransactionClient,
    contractId: string,
    user: Parameters<typeof caseContractScope>[0],
  ) {
    return tx.contract.findFirst({
      where: { id: contractId, ...caseContractScope(user), status: 'ACTIVE' },
      select: { id: true, tenantId: true, rentalSpaceId: true, startDate: true },
    });
  }
  app.get('/:id/room-change', { preHandler: allowRoles('TENANT') }, async (request) => {
    const { id } = source.parse(request.params);
    const current = await contract(prisma, id, request.user);
    if (!current) throw app.httpErrors.notFound('Active contract not found.');
    const [last, pending] = await Promise.all([
      latestApproval(prisma, current.tenantId),
      prisma.request.findFirst({
        where: {
          type: 'ROOM_CHANGE',
          contract: { tenantId: current.tenantId },
          status: { in: [...roomChangePending, 'APPROVED'] },
        },
        select: { id: true },
      }),
    ]);
    const next = last ? nextRoomApproval(last.createdAt) : null;
    return {
      nextApprovalAt: next && next > new Date() ? next : null,
      pendingId: pending?.id ?? null,
    };
  });
  app.post('/:id/room-change', { preHandler: allowRoles('TENANT') }, async (request, reply) => {
    const { id } = source.parse(request.params);
    const body = submission.parse(request.body);
    const result = await prisma.$transaction(
      async (tx) => {
        const actor = await caseActor(tx, request);
        if (!actor) throw app.httpErrors.unauthorized('Session is no longer active.');
        if (!(await lockCaseContract(tx, id, request.user)))
          throw app.httpErrors.notFound('Contract not found.');
        const repeat = await tx.request.findUnique({
          where: { contractId_clientId: { contractId: id, clientId: body.clientId } },
          select: { id: true, type: true, description: true, metadata: true },
        });
        if (repeat) {
          const data = snapshot.safeParse(repeat.metadata);
          if (
            repeat.type !== 'ROOM_CHANGE' ||
            repeat.description !== body.explanation ||
            data.data?.roomChange.preferences !== body.preferences
          )
            throw app.httpErrors.conflict('The submission key was reused with different content.');
          return { requestId: repeat.id, repeated: true };
        }
        const current = await contract(tx, id, request.user);
        if (!current) throw app.httpErrors.conflict('Room changes require an active contract.');
        const now = new Date();
        const last = await latestApproval(tx, current.tenantId);
        if (last && now < nextRoomApproval(last.createdAt))
          throw app.httpErrors.conflict(
            'A previous approval still counts toward the six-month limit.',
          );
        const pending = await tx.request.count({
          where: {
            type: 'ROOM_CHANGE',
            contract: { tenantId: current.tenantId },
            status: { in: [...roomChangePending, 'APPROVED'] },
          },
        });
        if (pending) throw app.httpErrors.conflict('A room-change request is already open.');
        const expiry = roomExpiry(now);
        const row = await tx.request.create({
          data: {
            contractId: id,
            clientId: body.clientId,
            type: 'ROOM_CHANGE',
            title: 'Room change',
            description: body.explanation,
            version: 1,
            status: 'SUBMITTED',
            decisionDueAt: expiry,
            createdAt: now,
            metadata: { roomChange: { preferences: body.preferences } },
            events: {
              create: {
                ...actor,
                sequence: 1,
                kind: 'SUBMITTED',
                message: body.explanation,
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
        await tx.businessJob.create({ data: job(current, row.id, expiry) });
        await caseAudit(tx, request, row, row.events[0]!.id, 'ROOM_CHANGE_SUBMITTED');
        return { requestId: row.id, repeated: false };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(result.repeated ? 200 : 201).send({ requestId: result.requestId });
  });
  app.post(
    '/:id/room-change/:requestId/commands',
    {
      preHandler: allowRoles('TENANT', 'LEASING_MANAGER'),
    },
    async (request, reply) => {
      const { id, requestId } = source.extend({ requestId: source.shape.id }).parse(request.params);
      const body = command.parse(request.body);
      const manager = request.user.role === 'LEASING_MANAGER';
      if (
        (body.action === 'WITHDRAW' && manager) ||
        (!['WITHDRAW', 'VIEWING'].includes(body.action) && !manager)
      )
        throw app.httpErrors.forbidden('This room-change action is unavailable for your role.');
      const hash = createHash('sha256')
        .update(JSON.stringify({ id, requestId, actor: request.user.sub, ...body }))
        .digest('hex');
      const result = await prisma.$transaction(
        async (tx) => {
          const actor = await caseActor(tx, request);
          if (!actor) throw app.httpErrors.unauthorized('Session is no longer active.');
          if (
            !(await lockCaseContract(tx, id, request.user)) ||
            !(await lockCase(tx, requestId, request.user))
          )
            throw app.httpErrors.notFound('Room-change request not found.');
          const row = await tx.request.findFirst({
            where: { id: requestId, contractId: id, type: 'ROOM_CHANGE' },
            select: { id: true, status: true, version: true, metadata: true, decisionDueAt: true },
          });
          if (!row) throw app.httpErrors.notFound('Room-change request not found.');
          const repeat = await tx.requestEvent.findUnique({
            where: { requestId_clientId: { requestId, clientId: body.clientId } },
            select: { metadata: true },
          });
          if (repeat) {
            const prior = z.object({ commandHash: z.string() }).safeParse(repeat.metadata);
            if (hash !== prior.data?.commandHash)
              throw app.httpErrors.conflict('The command key was reused with different content.');
            return { repeated: true };
          }
          const data = snapshot.safeParse(row.metadata);
          const now = new Date();
          if (!data.success || row.version !== body.expectedVersion || !row.decisionDueAt)
            throw app.httpErrors.conflict('Verify the current room-change history first.');
          const { roomChange } = data.data;
          const pending = roomChangePending.some((status) => status === row.status);
          const approved = row.status === 'APPROVED';
          const action = body.action;
          if (
            now >= row.decisionDueAt ||
            (['APPROVE', 'REJECT'].includes(action) && !pending) ||
            (['VIEWING', 'CANCEL'].includes(action) && !approved) ||
            (action === 'EXTEND' && (!approved || roomChange.extended)) ||
            (action === 'WITHDRAW' && !pending && !approved)
          )
            throw app.httpErrors.conflict(
              'The action is unavailable for this stage or the deadline passed.',
            );
          const current = await contract(tx, id, request.user);
          if (!current) throw app.httpErrors.conflict('Room changes require an active contract.');
          let deadline: Date | null = row.decisionDueAt;
          if (action === 'APPROVE') {
            const last = await latestApproval(tx, current.tenantId);
            if (last && now < nextRoomApproval(last.createdAt))
              throw app.httpErrors.conflict(
                'A previous approval still counts toward the six-month limit.',
              );
            roomChange.approvedAt = now.toISOString();
            deadline = roomNegotiationDeadline(now);
          }
          if (action === 'EXTEND') {
            roomChange.extended = true;
            deadline = roomNegotiationDeadline(row.decisionDueAt);
          }
          if (['CANCEL', 'WITHDRAW', 'REJECT'].includes(action)) deadline = null;
          const event = await tx.requestEvent.create({
            data: {
              requestId,
              clientId: body.clientId,
              ...actor,
              kind: kinds[action],
              fromStatus: row.status,
              sequence: row.version + 1,
              message: body.explanation,
              createdAt: now,
              metadata: { commandHash: hash, deadline: deadline?.toISOString() ?? null },
            },
            select: { id: true },
          });
          const updated = await tx.request.update({
            where: { id: requestId },
            data: {
              status: statuses[action],
              version: row.version + 1,
              decisionDueAt: deadline,
              metadata: { roomChange },
            },
            select: { id: true, type: true, status: true, version: true },
          });
          if (deadline && ['APPROVE', 'EXTEND'].includes(action))
            await tx.businessJob.create({ data: job(current, requestId, deadline, true) });
          await caseAudit(tx, request, updated, event.id, 'ROOM_CHANGE_' + action);
          return { repeated: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(result.repeated ? 200 : 201).send({ requestId });
    },
  );
};
