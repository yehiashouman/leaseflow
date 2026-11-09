import type { FastifyPluginAsync } from 'fastify';
import { RequestStatus, RequestType, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import {
  allowedCaseActions,
  basicCaseTypes,
  caseActionNeedsMessage,
  caseAllowsMessages,
  roleCanRequestStatus,
  supportsCaseType,
} from '../case-rules.js';
import {
  caseActor,
  caseAudit,
  caseContractScope,
  caseContractSelect,
  caseDto,
  caseScope,
  caseSelect,
  lockCase,
  lockCaseContract,
} from '../case-data.js';

const idSchema = z.object({ id: z.string().min(1).max(191) });
const createSchema = z
  .object({
    contractId: z.string().min(1).max(191),
    clientId: z.uuid(),
    type: z.enum(RequestType),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(3).max(5000),
    category: z.string().trim().max(100).nullable().optional(),
    urgency: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
    draft: z.boolean().default(false),
  })
  .strict();
const messageSchema = z
  .object({ clientId: z.uuid(), message: z.string().trim().min(1).max(5000) })
  .strict();
const transitionSchema = z
  .object({
    clientId: z.uuid(),
    status: z.enum(RequestStatus),
    expectedVersion: z.number().int().min(0).max(2147483646),
    message: z.string().trim().max(5000).default(''),
  })
  .strict();

export const requestRoutes: FastifyPluginAsync = async (app) => {
  const participants = allowRoles('LEASING_MANAGER', 'TENANT');
  async function load(
    tx: Prisma.TransactionClient,
    id: string,
    user: Parameters<typeof caseScope>[0],
  ) {
    const row = await tx.request.findFirst({
      where: { id, ...caseScope(user) },
      select: caseSelect,
    });
    if (!row) throw app.httpErrors.notFound('Request not found');
    return row;
  }
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/', { preHandler: participants }, async (request) => {
    const query = z
      .object({
        status: z.enum(RequestStatus).optional(),
        type: z.enum(RequestType).optional(),
        q: z.string().trim().max(150).default(''),
      })
      .strict()
      .parse(request.query);
    const where: Prisma.RequestWhereInput = {
      AND: [
        caseScope(request.user),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.type ? [{ type: query.type }] : []),
        ...(query.q ? [{ title: { contains: query.q } }] : []),
      ],
    };
    const rows = await prisma.request.findMany({
      where,
      select: caseSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => caseDto(row, request.user));
  });
  app.get('/options', { preHandler: allowRoles('TENANT') }, async (request) => ({
    types: basicCaseTypes,
    contracts: await prisma.contract.findMany({
      where: {
        ...caseContractScope(request.user),
        status: { in: ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] },
      },
      select: caseContractSelect,
      orderBy: { startDate: 'desc' },
    }),
  }));
  app.get('/:id', { preHandler: participants }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const row = await prisma.request.findFirst({
      where: { id, ...caseScope(request.user) },
      select: caseSelect,
    });
    if (!row) throw app.httpErrors.notFound('Request not found');
    return caseDto(row, request.user);
  });
  app.post('/', { preHandler: allowRoles('TENANT') }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    if (!supportsCaseType(body.type))
      throw app.httpErrors.conflict(
        'This request type requires a dedicated workflow that is not implemented',
      );
    const row = await prisma.$transaction(
      async (tx) => {
        const actor = await caseActor(tx, request);
        if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
        if (!(await lockCaseContract(tx, body.contractId, request.user)))
          throw app.httpErrors.notFound('Contract not found');
        const existing = await tx.request.findUnique({
          where: { contractId_clientId: { contractId: body.contractId, clientId: body.clientId } },
          select: caseSelect,
        });
        const metadata = { category: body.category || null, urgency: body.urgency };
        if (existing) {
          const previous = caseDto(existing, request.user).metadata;
          if (
            existing.type !== body.type ||
            existing.title !== body.title ||
            existing.description !== body.description ||
            (previous.category ?? null) !== metadata.category ||
            previous.urgency !== metadata.urgency ||
            (existing.events[0]?.kind === 'DRAFT_CREATED') !== body.draft
          )
            throw app.httpErrors.conflict('Submission key reused with different content');
          return existing;
        }
        const contract = await tx.contract.findFirst({
          where: { id: body.contractId, ...caseContractScope(request.user) },
          select: { id: true, status: true },
        });
        if (!contract) throw app.httpErrors.notFound('Contract not found');
        if (!['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status))
          throw app.httpErrors.conflict('A new request requires an open contract');
        const created = await tx.request.create({
          data: {
            contractId: body.contractId,
            clientId: body.clientId,
            type: body.type,
            title: body.title,
            description: body.description,
            status: body.draft ? 'DRAFT' : 'SUBMITTED',
            version: 1,
            metadata,
            events: {
              create: {
                ...actor,
                kind: body.draft ? 'DRAFT_CREATED' : 'SUBMITTED',
                message: body.description,
                sequence: 1,
              },
            },
          },
          select: caseSelect,
        });
        await caseAudit(
          tx,
          request,
          created,
          created.events[0]!.id,
          body.draft ? 'REQUEST_DRAFT' : 'REQUEST_SUBMIT',
        );
        return created;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(201).send(caseDto(row, request.user));
  });
  app.post('/:id/messages', { preHandler: participants }, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const body = messageSchema.parse(request.body);
    const row = await prisma.$transaction(
      async (tx) => {
        const actor = await caseActor(tx, request);
        if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
        if (!(await lockCase(tx, id, request.user)))
          throw app.httpErrors.notFound('Request not found');
        const current = await load(tx, id, request.user);
        const duplicate = await tx.requestEvent.findUnique({
          where: { requestId_clientId: { requestId: id, clientId: body.clientId } },
        });
        if (duplicate) {
          if (
            duplicate.actorUserId !== actor.actorUserId ||
            duplicate.kind !== 'MESSAGE' ||
            duplicate.message !== body.message
          )
            throw app.httpErrors.conflict('Message key reused with different content');
          return current;
        }
        if (!caseAllowsMessages(current.status))
          throw app.httpErrors.conflict('Reopen the case before a new message');
        const sequence = current.version + 1;
        const event = await tx.requestEvent.create({
          data: {
            requestId: id,
            clientId: body.clientId,
            ...actor,
            kind: 'MESSAGE',
            message: body.message,
            sequence,
          },
        });
        const updated = await tx.request.update({
          where: { id },
          data: { version: sequence },
          select: caseSelect,
        });
        await caseAudit(tx, request, updated, event.id, 'REQUEST_MESSAGE');
        return updated;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(201).send(caseDto(row, request.user));
  });
  app.post('/:id/deadline', { preHandler: allowRoles('LEASING_MANAGER') }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const body = z
      .object({
        clientId: z.uuid(),
        expectedVersion: z.number().int().min(0).max(2147483646),
        dueAt: z.iso.datetime().nullable(),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(request.body);
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    return prisma.$transaction(
      async (tx) => {
        const actor = await caseActor(tx, request);
        if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
        if (!(await lockCase(tx, id, request.user)))
          throw app.httpErrors.notFound('Request not found');
        const current = await load(tx, id, request.user);
        const duplicate = await tx.requestEvent.findUnique({
          where: { requestId_clientId: { requestId: id, clientId: body.clientId } },
        });
        const intent = {
          dueAt: dueAt?.toISOString() ?? null,
          reason: body.reason,
          expectedVersion: body.expectedVersion,
        };
        if (duplicate) {
          if (
            duplicate.actorUserId !== actor.actorUserId ||
            duplicate.kind !== 'DEADLINE_CHANGED' ||
            !z
              .object({
                dueAt: z.string().nullable(),
                reason: z.string(),
                expectedVersion: z.number(),
              })
              .refine(
                (value) =>
                  value.dueAt === intent.dueAt &&
                  value.reason === intent.reason &&
                  value.expectedVersion === intent.expectedVersion,
              )
              .safeParse(duplicate.metadata).success
          )
            throw app.httpErrors.conflict('Deadline key reused with different content');
          return caseDto(current, request.user);
        }
        if (!supportsCaseType(current.type))
          throw app.httpErrors.conflict('This request requires its dedicated deadline workflow');
        if (['DRAFT', 'CLOSED', 'ACCEPTED', 'REJECTED', 'RESOLVED'].includes(current.status))
          throw app.httpErrors.conflict('A deadline requires an open operational case');
        if (current.version !== body.expectedVersion)
          throw app.httpErrors.conflict('Case changed. Review the latest history');
        if (dueAt && dueAt.getTime() <= Date.now())
          throw app.httpErrors.unprocessableEntity('Choose a future deadline');
        const sequence = current.version + 1;
        const event = await tx.requestEvent.create({
          data: {
            requestId: id,
            clientId: body.clientId,
            ...actor,
            kind: 'DEADLINE_CHANGED',
            sequence,
            metadata: intent,
            message: `Response deadline: ${current.decisionDueAt?.toISOString() ?? 'none'} -> ${intent.dueAt ?? 'none'}. Reason: ${body.reason}`,
          },
        });
        const updated = await tx.request.update({
          where: { id },
          data: { decisionDueAt: dueAt, version: sequence },
          select: caseSelect,
        });
        await caseAudit(tx, request, updated, event.id, 'REQUEST_DEADLINE');
        return caseDto(updated, request.user);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  });
  app.post('/:id/respond', { preHandler: participants }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const body = transitionSchema.parse(request.body);
    const row = await prisma.$transaction(
      async (tx) => {
        const actor = await caseActor(tx, request);
        if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
        if (!(await lockCase(tx, id, request.user)))
          throw app.httpErrors.notFound('Request not found');
        const current = await load(tx, id, request.user);
        const duplicate = await tx.requestEvent.findUnique({
          where: { requestId_clientId: { requestId: id, clientId: body.clientId } },
        });
        if (duplicate) {
          if (
            duplicate.actorUserId !== actor.actorUserId ||
            duplicate.kind !== body.status ||
            (duplicate.message ?? '') !== body.message ||
            duplicate.sequence !== body.expectedVersion + 1
          )
            throw app.httpErrors.conflict('Decision key reused with different content');
          return current;
        }
        if (!roleCanRequestStatus(actor.actorRole, body.status))
          throw app.httpErrors.forbidden('Your role cannot perform this decision');
        if (!supportsCaseType(current.type))
          throw app.httpErrors.conflict(
            'This request type requires a dedicated workflow that is not implemented',
          );
        if (current.version !== body.expectedVersion)
          throw app.httpErrors.conflict(
            'Case changed. Review the latest history before another decision',
          );
        if (
          !allowedCaseActions(current.type, current.status, actor.actorRole).includes(body.status)
        )
          throw app.httpErrors.conflict('This decision is not valid for the current status');
        if (caseActionNeedsMessage(body.status) && body.message.length < 3)
          throw app.httpErrors.unprocessableEntity(
            'Add an explanation of at least three characters',
          );
        if (body.status === 'SUBMITTED') {
          if (!(await lockCaseContract(tx, current.contractId, request.user)))
            throw app.httpErrors.notFound('Contract not found');
          const contract = await tx.contract.findUnique({
            where: { id: current.contractId },
            select: { status: true },
          });
          if (
            !contract ||
            !['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status)
          )
            throw app.httpErrors.conflict('Submission requires an open contract');
        }
        const sequence = current.version + 1;
        const event = await tx.requestEvent.create({
          data: {
            requestId: id,
            clientId: body.clientId,
            ...actor,
            kind: body.status,
            message: body.message || null,
            fromStatus: current.status,
            sequence,
          },
        });
        const updated = await tx.request.update({
          where: { id },
          data: {
            status: body.status,
            version: sequence,
            ...(body.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
          },
          select: caseSelect,
        });
        await caseAudit(tx, request, updated, event.id, 'REQUEST_TRANSITION');
        return updated;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return caseDto(row, request.user);
  });
};
