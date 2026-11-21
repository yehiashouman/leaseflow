import type { FastifyPluginAsync } from 'fastify';
import { RequestStatus, RequestType, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { complaintOccupants, complaintSourceSelect } from '../complaint-occupants.js';
import { calendarDate, dubaiMidnight } from '../business-calendar.js';
import {
  latePaymentDates,
  latePaymentInput,
  latePaymentSnapshot,
  nextLateApproval,
} from '../late-payment-policy.js';
import { openContractStatuses } from '../space-availability.js';
import { listPageSize, optionalPage, pageWindow } from '../list-page.js';
import {
  allowedCaseActions,
  basicCaseTypes,
  caseActionNeedsMessage,
  caseAllowsMessages,
  caseAllowsAssignment,
  keyLockDecisionMetadata,
  keyLockDecisionSchema,
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
  latestCaseAssignment,
} from '../case-data.js';

const pendingLateStatuses: RequestStatus[] = [
  'SUBMITTED',
  'SEEN',
  'AWAITING_TENANT',
  'AWAITING_MANAGER',
  'APPROVED',
];
const idSchema = z.object({ id: z.string().min(1).max(191) });
const createSchema = z
  .object({
    contractId: z.string().min(1).max(191),
    clientId: z.uuid(),
    type: z.enum(RequestType),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(3).max(5000),
    category: z.string().trim().max(100).nullable().optional(),
    configuredCategory: z
      .object({
        id: z.string().min(1).max(191),
        version: z.number().int().positive(),
        answer: z.string().trim().max(2000).nullable(),
      })
      .strict()
      .optional(),
    urgency: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
    draft: z.boolean().default(false),
    latePayment: latePaymentInput.optional(),
    involvedOccupantId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict()
  .refine((body) => !body.configuredCategory || !body.category, {
    path: ['configuredCategory'],
    message: 'Select a configured category or provide a legacy category.',
  })
  .refine((body) => !body.involvedOccupantId || body.type === 'NEIGHBOR_COMPLAINT', {
    path: ['involvedOccupantId'],
    message: 'Select an occupant only for a neighbor complaint.',
  })
  .refine((body) => (body.type === 'LATE_PAYMENT') === !!body.latePayment, {
    path: ['latePayment'],
    message: 'Select a rent obligation and requested date for a late-payment request.',
  })
  .refine((body) => !body.latePayment || !body.draft, {
    path: ['draft'],
    message: 'Submit the request within the available window.',
  });
const messageSchema = z
  .object({ clientId: z.uuid(), message: z.string().trim().min(1).max(5000) })
  .strict();
const transitionSchema = z
  .object({
    clientId: z.uuid(),
    status: z.enum(RequestStatus),
    expectedVersion: z.number().int().min(0).max(2147483646),
    message: z.string().trim().max(5000).default(''),
    keyLock: keyLockDecisionSchema.optional(),
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
  async function latestLateApproval(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.requestEvent.findFirst({
      where: {
        kind: 'APPROVED',
        actorRole: 'LEASING_MANAGER',
        request: { type: 'LATE_PAYMENT', contract: { tenantId } },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function changeExpectedDate(
    tx: Prisma.TransactionClient,
    current: Awaited<ReturnType<typeof load>>,
    action: 'APPROVED' | 'CLOSED',
    now: Date,
  ) {
    const details = latePaymentSnapshot.safeParse(
      z.object({ latePayment: z.unknown() }).safeParse(current.metadata).data?.latePayment,
    );
    if (!details.success)
      throw app.httpErrors.conflict('The request has no recorded rent obligation.');
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: current.contractId },
      select: { tenantId: true, status: true },
    });
    await tx.$queryRaw`SELECT id FROM TenantProfile WHERE id = ${contract.tenantId} FOR UPDATE`;
    const { paymentId, originalDate, requestedDate } = details.data;
    await tx.$queryRaw`SELECT id FROM Payment WHERE id = ${paymentId} AND contractId = ${current.contractId} FOR UPDATE`;
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, contractId: current.contractId },
    });
    if (!payment) throw app.httpErrors.conflict('The rent obligation is unavailable.');
    const today = dubaiMidnight(calendarDate(now));
    const proposed = dubaiMidnight(new Date(requestedDate + 'T00:00:00Z'));
    const expectedDate = action === 'APPROVED' ? proposed : null;
    if (action === 'APPROVED') {
      if (
        !openContractStatuses.some((status) => status === contract.status) ||
        payment.expectedDate ||
        payment.amountPaid.gte(payment.amountDue) ||
        ['ADJUSTED', 'DISPUTED'].includes(payment.status) ||
        proposed <= now
      )
        throw app.httpErrors.conflict(
          'This obligation can no longer receive the requested extension.',
        );
      const prior = await latestLateApproval(tx, contract.tenantId);
      if (prior && now < nextLateApproval(prior.createdAt))
        throw app.httpErrors.conflict('Only one late-payment approval is allowed per six months.');
    } else if (payment.expectedDate?.getTime() !== proposed.getTime()) {
      throw app.httpErrors.conflict('The expected date has changed.');
    }
    const dueDate = expectedDate ?? payment.dueDate;
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        expectedDate,
        ...(!['PAID', 'ADJUSTED', 'DISPUTED'].includes(payment.status)
          ? {
              status:
                dueDate < today
                  ? 'LATE'
                  : payment.amountPaid.gt(0)
                    ? 'PARTIALLY_PAID'
                    : dueDate <= now
                      ? 'DUE'
                      : 'UPCOMING',
            }
          : {}),
      },
    });
    return { originalDate, expectedDate: action === 'APPROVED' ? requestedDate : null };
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
        page: optionalPage,
        sort: z.enum(['RECENT', 'OLDEST']).default('RECENT'),
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
    const list = {
      where,
      select: caseSelect,
      orderBy: [{ updatedAt: query.sort === 'OLDEST' ? 'asc' : 'desc' }, { id: 'desc' }],
    } satisfies Prisma.RequestFindManyArgs;
    const dto = (row: Prisma.RequestGetPayload<{ select: typeof caseSelect }>) =>
      caseDto(row, request.user);
    if (query.page === undefined) return (await prisma.request.findMany(list)).map(dto);
    const [rows, total] = await prisma.$transaction([
      prisma.request.findMany({ ...list, ...pageWindow(query.page) }),
      prisma.request.count({ where }),
    ]);
    return { items: rows.map(dto), total, page: query.page, pageSize: listPageSize };
  });
  app.get('/options', { preHandler: allowRoles('TENANT') }, async (request) => ({
    types: [...basicCaseTypes, 'LATE_PAYMENT'],
    categories: await prisma.requestCategory.findMany({
      where: { active: true, type: { in: [...basicCaseTypes] } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        version: true,
        name: true,
        prompt: true,
        answerRequired: true,
      },
    }),
    contracts: await prisma.contract.findMany({
      where: {
        ...caseContractScope(request.user),
        status: { in: ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'] },
      },
      select: caseContractSelect,
      orderBy: { startDate: 'desc' },
    }),
  }));
  app.get('/options/:id/late-payments', { preHandler: allowRoles('TENANT') }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const contract = await prisma.contract.findFirst({
      where: { id, ...caseContractScope(request.user), status: { in: [...openContractStatuses] } },
      select: {
        tenant: { select: { id: true, lateRequestWindowDays: true, maxLateExtensionDays: true } },
        requests: {
          where: { type: 'LATE_PAYMENT', status: { in: pendingLateStatuses } },
          select: { metadata: true },
        },
        payments: {
          where: {
            expectedDate: null,
            dueDate: { gte: new Date(), lte: new Date(Date.now() + 11 * 86_400_000) },
            status: { in: ['UPCOMING', 'DUE', 'PARTIALLY_PAID'] },
          },
          select: { id: true, dueDate: true, amountDue: true, amountPaid: true },
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!contract) throw app.httpErrors.notFound('Contract not found');
    const { tenant } = contract;
    const pending = new Set(
      contract.requests.map(
        ({ metadata }) =>
          z.object({ latePayment: latePaymentSnapshot }).safeParse(metadata).data?.latePayment
            .paymentId,
      ),
    );
    const now = new Date();
    const prior = await latestLateApproval(prisma, tenant.id);
    const nextApprovalAt = prior ? nextLateApproval(prior.createdAt) : null;
    return {
      windowDays: Math.max(0, Math.min(tenant.lateRequestWindowDays, 10)),
      extensionDays: Math.max(0, Math.min(tenant.maxLateExtensionDays, 5)),
      nextApprovalAt: nextApprovalAt && now < nextApprovalAt ? nextApprovalAt : null,
      obligations: contract.payments.flatMap((payment) => {
        const dates = latePaymentDates(payment.dueDate, tenant);
        return !pending.has(payment.id) &&
          payment.amountPaid.lt(payment.amountDue) &&
          dates.opensAt <= now &&
          now < dates.closesAt &&
          dates.earliestDate <= dates.latestDate
          ? [{ id: payment.id, ...dates }]
          : [];
      }),
    };
  });
  app.get('/options/:id/occupants', { preHandler: allowRoles('TENANT') }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const source = await prisma.contract.findFirst({
      where: { id, ...caseContractScope(request.user), status: { in: [...openContractStatuses] } },
      select: complaintSourceSelect,
    });
    if (!source) throw app.httpErrors.notFound('Contract not found');
    return { occupants: await complaintOccupants(prisma, source) };
  });
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
            (!body.configuredCategory && (previous.category ?? null) !== metadata.category) ||
            previous.categorySnapshot?.id !== body.configuredCategory?.id ||
            previous.categorySnapshot?.version !== body.configuredCategory?.version ||
            (previous.categorySnapshot?.answer ?? null) !==
              (body.configuredCategory?.answer || null) ||
            previous.urgency !== metadata.urgency ||
            previous.involvedOccupant?.id !== body.involvedOccupantId ||
            previous.latePayment?.paymentId !== body.latePayment?.paymentId ||
            previous.latePayment?.requestedDate !== body.latePayment?.requestedDate ||
            (existing.events[0]?.kind === 'DRAFT_CREATED') !== body.draft
          )
            throw app.httpErrors.conflict('Submission key reused with different content');
          return existing;
        }
        const contract = await tx.contract.findFirst({
          where: { id: body.contractId, ...caseContractScope(request.user) },
          select: complaintSourceSelect,
        });
        if (!contract) throw app.httpErrors.notFound('Contract not found');
        if (!['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status))
          throw app.httpErrors.conflict('A new request requires an open contract');
        const involvedOccupant = body.involvedOccupantId
          ? (await complaintOccupants(tx, contract)).find(
              (occupant) => occupant.id === body.involvedOccupantId,
            )
          : undefined;
        if (body.involvedOccupantId && !involvedOccupant)
          throw app.httpErrors.unprocessableEntity('Select an occupant from the current unit.');
        let categorySnapshot;
        if (body.configuredCategory) {
          const { id, version, answer } = body.configuredCategory;
          const category = await tx.requestCategory.findFirst({
            where: { id, version, type: body.type, active: true },
            select: { id: true, version: true, name: true, prompt: true, answerRequired: true },
          });
          if (!category)
            throw app.httpErrors.conflict(
              'The category changed. Reopen the form and select a category.',
            );
          if ((category.answerRequired && !answer) || (!category.prompt && answer))
            throw app.httpErrors.unprocessableEntity('Verify the answer to the category question.');
          categorySnapshot = {
            id,
            version,
            name: category.name,
            prompt: category.prompt,
            answer: answer || null,
          };
        }
        let latePayment;
        if (body.latePayment) {
          const { paymentId, requestedDate } = body.latePayment;
          await tx.$queryRaw`SELECT id FROM Payment WHERE id = ${paymentId} AND contractId = ${body.contractId} FOR UPDATE`;
          const payment = await tx.payment.findFirst({
            where: { id: paymentId, contractId: body.contractId },
            include: {
              contract: {
                select: {
                  tenant: { select: { lateRequestWindowDays: true, maxLateExtensionDays: true } },
                },
              },
            },
          });
          if (!payment) throw app.httpErrors.notFound('Rent obligation not found');
          const now = new Date();
          const dates = latePaymentDates(payment.dueDate, payment.contract.tenant);
          if (
            payment.expectedDate ||
            payment.amountPaid.gte(payment.amountDue) ||
            !['UPCOMING', 'DUE', 'PARTIALLY_PAID'].includes(payment.status)
          )
            throw app.httpErrors.conflict(
              'This obligation is unavailable for a late-payment request.',
            );
          if (now < dates.opensAt || now >= dates.closesAt)
            throw app.httpErrors.conflict('The late-payment request window is closed.');
          if (requestedDate < dates.earliestDate || requestedDate > dates.latestDate)
            throw app.httpErrors.unprocessableEntity('Select a permitted expected payment date.');
          const pending = await tx.request.findFirst({
            where: {
              contractId: body.contractId,
              type: 'LATE_PAYMENT',
              status: { in: pendingLateStatuses },
              metadata: { path: '$.latePayment.paymentId', equals: paymentId },
            },
            select: { id: true },
          });
          if (pending)
            throw app.httpErrors.conflict('A request already exists for this obligation.');
          latePayment = { paymentId, requestedDate, originalDate: dates.originalDate };
        }
        const created = await tx.request.create({
          data: {
            contractId: body.contractId,
            clientId: body.clientId,
            type: body.type,
            title: body.title,
            description: body.description,
            status: body.draft ? 'DRAFT' : 'SUBMITTED',
            version: 1,
            metadata: {
              ...metadata,
              ...(categorySnapshot ? { category: categorySnapshot.name, categorySnapshot } : {}),
              ...(involvedOccupant ? { involvedOccupant } : {}),
              ...(latePayment ? { latePayment } : {}),
            },
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
  app.post('/:id/assignment', { preHandler: allowRoles('LEASING_MANAGER') }, async (request) => {
    const { id } = idSchema.parse(request.params);
    const body = z
      .object({
        clientId: z.uuid(),
        expectedVersion: z.number().int().min(0).max(2147483646),
        assigned: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(request.body);
    const kind = body.assigned ? 'ASSIGNED' : 'UNASSIGNED';
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
            duplicate.kind !== kind ||
            duplicate.message !== body.reason ||
            duplicate.sequence !== body.expectedVersion + 1
          )
            throw app.httpErrors.conflict('Assignment key reused with different content');
          return current;
        }
        if (!caseAllowsAssignment(current.type, current.status))
          throw app.httpErrors.conflict('Assignment requires an open operational case.');
        if (current.version !== body.expectedVersion)
          throw app.httpErrors.conflict('Case changed. Review the latest history.');
        const assigned = latestCaseAssignment(current.events);
        if (body.assigned ? assigned?.actorUserId === actor.actorUserId : !assigned)
          throw app.httpErrors.conflict('The requested assignment is already in effect.');
        const sequence = current.version + 1;
        const event = await tx.requestEvent.create({
          data: {
            requestId: id,
            clientId: body.clientId,
            ...actor,
            kind,
            message: body.reason,
            sequence,
          },
        });
        const updated = await tx.request.update({
          where: { id },
          data: { version: sequence },
          select: caseSelect,
        });
        await caseAudit(tx, request, updated, event.id, 'REQUEST_' + kind);
        return updated;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return caseDto(row, request.user);
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
        if (
          !supportsCaseType(current.type) ||
          (current.type === 'LATE_PAYMENT' && !caseDto(current, request.user).metadata.latePayment)
        )
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
            duplicate.sequence !== body.expectedVersion + 1 ||
            JSON.stringify(keyLockDecisionMetadata(duplicate.metadata)) !==
              JSON.stringify(body.keyLock)
          )
            throw app.httpErrors.conflict('Decision key reused with different content');
          return current;
        }
        const isLatePayment = current.type === 'LATE_PAYMENT';
        if (
          !roleCanRequestStatus(actor.actorRole, body.status) &&
          !(isLatePayment && actor.actorRole === 'TENANT' && body.status === 'CLOSED')
        )
          throw app.httpErrors.forbidden('Your role cannot perform this decision');
        if (
          !supportsCaseType(current.type) ||
          (isLatePayment && !caseDto(current, request.user).metadata.latePayment)
        )
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
        if (
          (caseActionNeedsMessage(body.status) || (isLatePayment && body.status === 'CLOSED')) &&
          body.message.length < 3
        )
          throw app.httpErrors.unprocessableEntity(
            'Add an explanation of at least three characters',
          );
        const keyLockDecision =
          current.type === 'KEY_LOCK_CHANGE' &&
          (body.status === 'APPROVED' || body.status === 'RESOLVED');
        if (keyLockDecision !== Boolean(body.keyLock))
          throw app.httpErrors.unprocessableEntity(
            keyLockDecision
              ? 'Record the key or lock authorization.'
              : 'Key or lock details are not valid for this decision.',
          );
        if (
          body.keyLock &&
          Boolean(body.keyLock.costResponsibility) !== (body.status === 'RESOLVED')
        )
          throw app.httpErrors.unprocessableEntity(
            body.status === 'RESOLVED'
              ? 'Select the cost responsibility.'
              : 'Record cost responsibility after the work.',
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
        const now = new Date();
        const latePayment =
          isLatePayment &&
          (body.status === 'APPROVED' ||
            (body.status === 'CLOSED' && current.status === 'APPROVED'))
            ? await changeExpectedDate(tx, current, body.status, now)
            : null;
        const sequence = current.version + 1;
        const event = await tx.requestEvent.create({
          data: {
            requestId: id,
            clientId: body.clientId,
            ...actor,
            kind: body.status,
            message: body.message || null,
            ...(body.keyLock ? { metadata: { keyLock: body.keyLock } } : {}),
            ...(latePayment ? { metadata: { latePayment }, createdAt: now } : {}),
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
