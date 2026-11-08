import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../auth.js';
import { activeAccount } from '../account-data.js';
import { caseScope, caseSelect, lockCase } from '../case-data.js';
import { reportHash, reportSnapshot, ReportRenderError } from '../case-report.js';

const selected = {
  id: true,
  requestId: true,
  expectedVersion: true,
  status: true,
  snapshotHash: true,
  pdfHash: true,
  retryCount: true,
  failureCode: true,
  createdAt: true,
  generatedAt: true,
  completedAt: true,
} as const;
const params = z.object({ id: z.string().min(1).max(191) });
export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.addHook('preHandler', allowRoles('LEASING_MANAGER', 'TENANT'));
  const scope = (request: FastifyRequest) => ({
    ownerUserId: request.user.sub,
    ownerRole: request.user.role,
    request: caseScope(request.user),
  });
  app.post('/', async (request, reply) => {
    const body = z
      .object({
        requestId: z.string().min(1).max(191),
        clientId: z.uuid(),
        expectedVersion: z.number().int().min(0).max(2147483646),
      })
      .strict()
      .parse(request.body);
    const row = await prisma.$transaction(
      async (tx) => {
        if (!(await activeAccount(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        if (!(await lockCase(tx, body.requestId, request.user)))
          throw app.httpErrors.notFound('Request not found');
        const source = await tx.request.findFirst({
          where: { id: body.requestId, ...caseScope(request.user) },
          select: caseSelect,
        });
        if (!source) throw app.httpErrors.notFound('Request not found');
        const existing = await tx.caseReportJob.findUnique({
          where: {
            ownerUserId_clientId: { ownerUserId: request.user.sub, clientId: body.clientId },
          },
          select: { ...selected, ownerRole: true },
        });
        if (existing) {
          if (
            existing.requestId !== body.requestId ||
            existing.expectedVersion !== body.expectedVersion ||
            existing.ownerRole !== request.user.role
          )
            throw app.httpErrors.conflict('Report key reused with different content');
          return tx.caseReportJob.findUniqueOrThrow({
            where: { id: existing.id },
            select: selected,
          });
        }
        if (source.version !== body.expectedVersion)
          throw app.httpErrors.conflict('Case changed. Reload before export');
        if (
          (await tx.caseReportJob.count({
            where: { ownerUserId: request.user.sub, status: { in: ['QUEUED', 'RUNNING'] } },
          })) >= 3
        )
          throw app.httpErrors.tooManyRequests('Wait for existing report jobs to finish');
        let snapshot;
        try {
          snapshot = reportSnapshot(source);
        } catch (cause) {
          if (cause instanceof ReportRenderError)
            throw app.httpErrors.conflict('This case exceeds the current report size limit');
          throw cause;
        }
        const created = await tx.caseReportJob.create({
          data: {
            ownerUserId: request.user.sub,
            ownerRole: request.user.role,
            requestId: body.requestId,
            clientId: body.clientId,
            expectedVersion: body.expectedVersion,
            snapshot,
            snapshotHash: reportHash(snapshot),
          },
          select: selected,
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'REPORT_QUEUED',
            entityType: 'CaseReportJob',
            entityId: created.id,
            newValue: {
              requestId: body.requestId,
              version: body.expectedVersion,
              snapshotHash: created.snapshotHash,
            },
          },
        });
        return created;
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return reply.code(202).send(row);
  });
  app.get('/', async (request) => {
    const { requestId, page } = z
      .object({
        requestId: z.string().min(1).max(191),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(request.query);
    if (
      !(await prisma.request.findFirst({
        where: { id: requestId, ...caseScope(request.user) },
        select: { id: true },
      }))
    )
      throw app.httpErrors.notFound('Request not found');
    const where = { ...scope(request), requestId };
    const [items, total] = await prisma.$transaction([
      prisma.caseReportJob.findMany({
        where,
        select: selected,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.caseReportJob.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  });
  app.get('/:id', async (request) => {
    const { id } = params.parse(request.params);
    const row = await prisma.caseReportJob.findFirst({
      where: { id, ...scope(request) },
      select: selected,
    });
    if (!row) throw app.httpErrors.notFound('Report not found');
    return row;
  });
  for (const format of ['file', 'source'] as const) {
    app.get('/:id/' + format, async (request, reply) => {
      const { id } = params.parse(request.params);
      const row = await prisma.caseReportJob.findFirst({
        where: { id, ...scope(request) },
        select: { ...selected, snapshot: true, ...(format === 'file' ? { pdfBytes: true } : {}) },
      });
      if (!row) throw app.httpErrors.notFound('Report not found');
      if (reportHash(row.snapshot) !== row.snapshotHash)
        throw app.httpErrors.conflict('Report integrity mismatch');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Report-Snapshot-SHA256', row.snapshotHash);
      reply.header(
        'Content-Disposition',
        `attachment; filename="case-${row.id}.${format === 'file' ? 'pdf' : 'json'}"`,
      );
      const audit = () =>
        prisma.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'REPORT_DOWNLOAD',
            entityType: 'CaseReportJob',
            entityId: row.id,
            newValue: { format, snapshotHash: row.snapshotHash },
          },
        });
      if (format === 'source') {
        await audit();
        return reply.type('application/json; charset=utf-8').send({
          reportId: row.id,
          queuedAt: row.createdAt,
          generatedAt: row.generatedAt,
          snapshotHash: row.snapshotHash,
          snapshot: row.snapshot,
          disclaimer: 'Factual platform records. Not legal findings or certification.',
        });
      }
      if (row.status !== 'COMPLETE' || !row.pdfBytes || !row.pdfHash)
        throw app.httpErrors.conflict('PDF is not complete');
      const bytes = Buffer.from(row.pdfBytes);
      if (createHash('sha256').update(bytes).digest('hex') !== row.pdfHash)
        throw app.httpErrors.conflict('PDF integrity mismatch');
      reply.header('X-Report-File-SHA256', row.pdfHash);
      await audit();
      return reply.type('application/pdf').send(bytes);
    });
  }
  app.post('/:id/retry', async (request) => {
    const { id } = params.parse(request.params);
    const { expectedRetryCount } = z
      .object({ expectedRetryCount: z.number().int().min(0).max(3) })
      .strict()
      .parse(request.body);
    return prisma.$transaction(
      async (tx) => {
        if (!(await activeAccount(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        const job = await tx.caseReportJob.findFirst({
          where: { id, ...scope(request) },
          select: selected,
        });
        if (!job || !(await lockCase(tx, job.requestId, request.user)))
          throw app.httpErrors.notFound('Report not found');
        if (job.retryCount === expectedRetryCount + 1) return job;
        if (job.retryCount >= 3)
          throw app.httpErrors.conflict('Retry limit reached. Create a new report');
        if (
          (await tx.caseReportJob.count({
            where: { ownerUserId: request.user.sub, status: { in: ['QUEUED', 'RUNNING'] } },
          })) >= 3
        )
          throw app.httpErrors.tooManyRequests('Wait for existing report jobs to finish');
        const changed = await tx.caseReportJob.updateMany({
          where: { id, ...scope(request), status: 'FAILED', retryCount: expectedRetryCount },
          data: {
            status: 'QUEUED',
            attempts: 0,
            retryCount: { increment: 1 },
            failureCode: null,
            leaseToken: null,
            leaseExpiresAt: null,
            pdfBytes: null,
            pdfHash: null,
            completedAt: null,
            generatedAt: null,
          },
        });
        if (!changed.count)
          throw app.httpErrors.conflict('Report changed or is not failed. Reload its status');
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'REPORT_RETRY',
            entityType: 'CaseReportJob',
            entityId: id,
            newValue: { retryCount: expectedRetryCount + 1 },
          },
        });
        return tx.caseReportJob.findUniqueOrThrow({ where: { id }, select: selected });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  });
};
