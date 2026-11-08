import type { FastifyPluginAsync } from 'fastify';
import { MaintenanceClassification, MaintenanceDecision, Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { caseActor, caseAudit, caseDto, caseScope, caseSelect, lockCase } from '../case-data.js';
import { canAssessMaintenance, maintenanceLabels } from '../maintenance-rules.js';

const version = z.number().int().min(0).max(2147483646);
const amount = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
  .pipe(
    z
      .string()
      .refine((value) => new Prisma.Decimal(value).greaterThan(0), 'Amount must be positive')
      .transform((value) => new Prisma.Decimal(value).toFixed(2)),
  );
const assessmentFields = z
  .object({
    classification: z.enum(MaintenanceClassification),
    proposedAmount: amount.nullable().default(null),
    explanation: z.string().trim().min(3).max(5000),
    evidenceNotes: z.string().trim().max(5000).default(''),
  })
  .strict();
const assessmentSchema = assessmentFields
  .extend({ clientId: z.uuid(), expectedVersion: version })
  .superRefine((body, ctx) => {
    if (
      body.classification === 'TENANT_COST' &&
      (!body.proposedAmount || body.evidenceNotes.length < 3)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Tenant cost requires a positive amount and evidence notes',
      });
    if (body.classification !== 'TENANT_COST' && body.proposedAmount !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'Only a tenant-cost proposal can contain a proposed amount',
      });
  });
const responseSchema = z
  .object({
    clientId: z.uuid(),
    expectedVersion: version,
    decision: z.enum(MaintenanceDecision),
    explanation: z.string().trim().min(3).max(5000),
  })
  .strict();
export const maintenanceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.post(
    '/:id/maintenance',
    { preHandler: allowRoles('LEASING_MANAGER') },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      const body = assessmentSchema.parse(request.body);
      const row = await prisma.$transaction(
        async (tx) => {
          const actor = await caseActor(tx, request);
          if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
          if (!(await lockCase(tx, id, request.user)))
            throw app.httpErrors.notFound('Request not found');
          const current = await tx.request.findFirst({
            where: { id, ...caseScope(request.user) },
            select: caseSelect,
          });
          if (!current) throw app.httpErrors.notFound('Request not found');
          if (current.type !== 'MAINTENANCE')
            throw app.httpErrors.conflict('This case is not a maintenance request');
          const input = {
            classification: body.classification,
            proposedAmount: body.proposedAmount,
            explanation: body.explanation,
            evidenceNotes: body.evidenceNotes,
          };
          const duplicate = await tx.requestEvent.findUnique({
            where: { requestId_clientId: { requestId: id, clientId: body.clientId } },
          });
          if (duplicate) {
            const previous = assessmentFields.safeParse(duplicate.metadata);
            if (
              duplicate.kind !== 'MAINTENANCE_ASSESSED' ||
              duplicate.actorUserId !== actor.actorUserId ||
              duplicate.sequence !== body.expectedVersion + 1 ||
              !previous.success ||
              JSON.stringify(previous.data) !== JSON.stringify(input)
            )
              throw app.httpErrors.conflict('Assessment key reused with different content');
            return current;
          }
          if (current.version !== body.expectedVersion)
            throw app.httpErrors.conflict('Case changed. Reload before another assessment');
          if (
            !canAssessMaintenance(current.status, current.maintenanceAssessments.at(-1)?.decision)
          )
            throw app.httpErrors.conflict(
              'Reopen the case first; accepted cost responsibility cannot be replaced',
            );
          const contract = await tx.contract.findUniqueOrThrow({
            where: { id: current.contractId },
            select: { currency: true },
          });
          if (body.classification === 'TENANT_COST' && !['AED', 'USD'].includes(contract.currency))
            throw app.httpErrors.conflict(
              'The contract currency is not supported for cost proposals',
            );
          const sequence = current.version + 1;
          await tx.maintenanceAssessment.create({
            data: {
              requestId: id,
              caseVersion: sequence,
              classification: body.classification,
              proposedAmount: body.proposedAmount,
              currency: body.proposedAmount ? contract.currency : null,
              explanation: body.explanation,
              evidenceNotes: body.evidenceNotes || null,
            },
          });
          const summary = [
            maintenanceLabels[body.classification],
            ...(body.proposedAmount
              ? ['Proposed tenant cost: ' + contract.currency + ' ' + body.proposedAmount]
              : []),
            'Explanation: ' + body.explanation,
            ...(body.evidenceNotes ? ['Evidence notes: ' + body.evidenceNotes] : []),
            'Maintenance remains the Leasing Manager responsibility. No charge or deduction was created.',
          ].join('\n');
          const event = await tx.requestEvent.create({
            data: {
              requestId: id,
              clientId: body.clientId,
              ...actor,
              kind: 'MAINTENANCE_ASSESSED',
              message: summary,
              metadata: input,
              sequence,
            },
          });
          const updated = await tx.request.update({
            where: { id },
            data: { version: sequence },
            select: caseSelect,
          });
          await caseAudit(tx, request, updated, event.id, 'MAINTENANCE_ASSESS');
          return updated;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(201).send(caseDto(row, request.user));
    },
  );
  app.post(
    '/:id/maintenance/:assessmentId/respond',
    { preHandler: allowRoles('TENANT') },
    async (request) => {
      const { id, assessmentId } = z
        .object({ id: z.string().min(1).max(191), assessmentId: z.string().min(1).max(191) })
        .parse(request.params);
      const body = responseSchema.parse(request.body);
      const row = await prisma.$transaction(
        async (tx) => {
          const actor = await caseActor(tx, request);
          if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
          if (!(await lockCase(tx, id, request.user)))
            throw app.httpErrors.notFound('Request not found');
          const current = await tx.request.findFirst({
            where: { id, ...caseScope(request.user) },
            select: caseSelect,
          });
          if (!current) throw app.httpErrors.notFound('Request not found');
          if (current.type !== 'MAINTENANCE')
            throw app.httpErrors.conflict('This case is not a maintenance request');
          const input = { assessmentId, decision: body.decision, explanation: body.explanation };
          const duplicate = await tx.requestEvent.findUnique({
            where: { requestId_clientId: { requestId: id, clientId: body.clientId } },
          });
          if (duplicate) {
            const previous = z
              .object({
                assessmentId: z.string(),
                decision: z.enum(MaintenanceDecision),
                explanation: z.string(),
              })
              .strict()
              .safeParse(duplicate.metadata);
            if (
              duplicate.kind !== 'MAINTENANCE_' + body.decision ||
              duplicate.actorUserId !== actor.actorUserId ||
              duplicate.sequence !== body.expectedVersion + 1 ||
              !previous.success ||
              JSON.stringify(previous.data) !== JSON.stringify(input)
            )
              throw app.httpErrors.conflict('Response key reused with different content');
            return current;
          }
          if (current.version !== body.expectedVersion)
            throw app.httpErrors.conflict('Case changed. Reload before a cost response');
          const latest = current.maintenanceAssessments.at(-1);
          if (
            !latest ||
            latest.id !== assessmentId ||
            latest.classification !== 'TENANT_COST' ||
            latest.decision
          )
            throw app.httpErrors.conflict('This cost proposal is no longer open for a response');
          const sequence = current.version + 1;
          await tx.maintenanceAssessment.update({
            where: { id: assessmentId },
            data: {
              decision: body.decision,
              responseExplanation: body.explanation,
              respondedAt: new Date(),
            },
          });
          const event = await tx.requestEvent.create({
            data: {
              requestId: id,
              clientId: body.clientId,
              ...actor,
              kind: 'MAINTENANCE_' + body.decision,
              sequence,
              metadata: input,
              message: `Tenant ${body.decision.toLowerCase()} proposed cost ${latest.currency} ${latest.proposedAmount?.toFixed(2)}.\nResponse: ${body.explanation}\nNo charge or deduction was created.`,
            },
          });
          const updated = await tx.request.update({
            where: { id },
            data: { version: sequence },
            select: caseSelect,
          });
          await caseAudit(tx, request, updated, event.id, 'MAINTENANCE_RESPOND');
          return updated;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return caseDto(row, request.user);
    },
  );
};
