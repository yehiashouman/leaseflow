import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../auth.js';
import { activeAccount } from '../account-data.js';
import {
  fileConfig,
  fileDigest,
  fileMetadataSchema,
  fileState,
  safeFilename,
  verifyFile,
  UnsafeFile,
  documentPurposes,
} from '../file-policy.js';
import { documentSelect, lockFileTarget, purposeTargets, seriesScope } from '../file-access.js';
import { privateStorage, type PrivateStorage } from '../file-storage.js';
import { createFileGrant, verifyFileGrant } from '../file-grant.js';
import { authenticateOnboarding, onboardingAccount } from '../onboarding-auth.js';
import { caseActor, caseAudit } from '../case-data.js';

const params = z.object({ id: z.string().min(1).max(191) }).strict();
const listQuery = z
  .object({
    purpose: z.enum(documentPurposes).optional(),
    targetId: z.string().min(1).max(191).optional(),
    seriesId: z.string().min(1).max(191).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine((value) => !value.targetId || value.purpose, 'A target requires a purpose');
export const documentRoutes: FastifyPluginAsync<{ storage?: PrivateStorage }> = async (
  app,
  options,
) => {
  const storage = options.storage ?? privateStorage;
  await app.register(multipart, {
    limits: { fileSize: fileConfig.FILE_MAX_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 4096 },
  });
  app.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.unauthorized('Authentication required');
    }
    return request.user.onboarding
      ? authenticateOnboarding(request, reply)
      : allowRoles('LEASING_MANAGER', 'TENANT')(request, reply);
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  app.get('/policy', async () => ({
    enabled: fileConfig.FILES_ENABLED === 'true',
    maxBytes: fileConfig.FILE_MAX_BYTES,
    mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    grantSeconds: fileConfig.FILE_GRANT_SECONDS,
    productionApproved: false,
  }));
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.split('?')[0]!.endsWith('/policy') && fileConfig.FILES_ENABLED !== 'true')
      return reply.serviceUnavailable('Private files are not enabled');
  });
  const accessible = (request: FastifyRequest): Prisma.DocumentSeriesWhereInput =>
    request.user.onboarding
      ? {
          ownerUserId: request.user.sub,
          purpose: {
            in: request.user.role === 'LEASING_MANAGER' ? ['IDENTITY', 'LICENSE'] : ['IDENTITY'],
          },
        }
      : seriesScope(request.user);
  const scope = (request: FastifyRequest): Prisma.DocumentWhereInput => ({
    series: accessible(request),
  });
  const account = (tx: Prisma.TransactionClient, request: FastifyRequest) =>
    request.user.onboarding ? onboardingAccount(tx, request) : activeAccount(tx, request);
  const dto = (row: Prisma.DocumentGetPayload<{ select: typeof documentSelect }>) => ({
    ...row,
    availability: fileState(row),
    canReplace: false,
  });
  app.get('/', async (request) => {
    const { page, purpose, targetId, seriesId } = listQuery.parse(request.query);
    const target = purpose ? purposeTargets[purpose] : undefined;
    const where: Prisma.DocumentWhereInput = {
      ...scope(request),
      ...(seriesId ? { seriesId } : {}),
      series: {
        AND: [
          accessible(request),
          {
            ...(purpose ? { purpose } : {}),
            ...(targetId && target && target !== 'self' ? { [target]: targetId } : {}),
            ...(targetId && target === 'self' ? { ownerUserId: request.user.sub } : {}),
          },
        ],
      },
    };
    if (target === 'self' && targetId && targetId !== 'self')
      throw app.httpErrors.notFound('Document target not found');
    const [items, total] = await prisma.$transaction([
      prisma.document.findMany({
        where,
        select: documentSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.document.count({ where }),
    ]);
    return {
      items: items.map((row) => ({
        ...dto(row),
        canReplace: row.uploaderUserId === request.user.sub,
      })),
      total,
      page,
      pageSize: 20,
    };
  });
  app.get('/:id', async (request) => {
    const { id } = params.parse(request.params);
    const row = await prisma.document.findFirst({
      where: { id, ...scope(request) },
      select: documentSelect,
    });
    if (!row) throw app.httpErrors.notFound('Document not found');
    return { ...dto(row), canReplace: row.uploaderUserId === request.user.sub };
  });
  app.post(
    '/',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      let metadata: unknown,
        bytes: Buffer | undefined,
        mimeType = '',
        originalName = '';
      for await (const part of request.parts()) {
        if (part.type === 'field' && part.fieldname === 'metadata') {
          if (part.valueTruncated || typeof part.value !== 'string')
            throw app.httpErrors.unprocessableEntity('Invalid file metadata');
          try {
            metadata = JSON.parse(part.value);
          } catch {
            throw app.httpErrors.unprocessableEntity('Invalid file metadata');
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          bytes = await part.toBuffer();
          mimeType = part.mimetype;
          originalName = safeFilename(part.filename);
          if (part.file.truncated)
            throw app.httpErrors.payloadTooLarge('File exceeds upload limit');
        } else throw app.httpErrors.unprocessableEntity('Use one metadata field and one file');
      }
      const meta = fileMetadataSchema.parse(metadata);
      if (request.user.onboarding && !['IDENTITY', 'LICENSE'].includes(meta.purpose))
        throw app.httpErrors.forbidden(
          'Account setup permits only private identity and licence documents',
        );
      if (!bytes) throw app.httpErrors.unprocessableEntity('Choose a file');
      try {
        verifyFile(bytes, mimeType, meta.purpose, originalName);
      } catch (cause) {
        if (cause instanceof UnsafeFile)
          throw app.httpErrors.unsupportedMediaType('File rejected: ' + cause.code);
        throw cause;
      }
      const sourceHash = fileDigest(bytes),
        payloadHash = fileDigest(JSON.stringify({ ...meta, sourceHash, mimeType, originalName }));
      const result = await prisma.$transaction(
        async (tx) => {
          if (!(await account(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          if (!(await lockFileTarget(tx, meta, request.user)))
            throw app.httpErrors.notFound('Document target not found');
          const existing = await tx.document.findUnique({
            where: {
              uploaderUserId_clientId: {
                uploaderUserId: request.user.sub,
                clientId: meta.clientId,
              },
            },
            select: { ...documentSelect, payloadHash: true },
          });
          if (existing) {
            if (existing.payloadHash !== payloadHash)
              throw app.httpErrors.conflict('File key reused with different content');
            const { payloadHash: _, ...safe } = existing;
            void _;
            return safe;
          }
          if (
            (await tx.document.count({
              where: {
                uploaderUserId: request.user.sub,
                status: { in: ['QUARANTINED', 'SCANNING'] },
              },
            })) >= 10
          )
            throw app.httpErrors.tooManyRequests('Wait for current file scans');
          if ((await tx.document.count({ where: { uploaderUserId: request.user.sub } })) >= 1000)
            throw app.httpErrors.conflict('Development file quota reached');
          let seriesId = meta.seriesId,
            version = 1;
          const target = purposeTargets[meta.purpose];
          if (seriesId) {
            await tx.$queryRaw`SELECT id FROM DocumentSeries WHERE id = ${seriesId} FOR UPDATE`;
            const series = await tx.documentSeries.findFirst({
              where: {
                id: seriesId,
                ownerUserId: request.user.sub,
                purpose: meta.purpose,
                ...(target === 'self' ? {} : { [target]: meta.targetId }),
                AND: [accessible(request)],
              },
            });
            if (!series) throw app.httpErrors.notFound('Document series not found');
            version = (await tx.document.count({ where: { seriesId } })) + 1;
            if (version > 20) throw app.httpErrors.conflict('Document version limit reached');
          } else {
            const series = await tx.documentSeries.create({
              data: {
                ownerUserId: request.user.sub,
                purpose: meta.purpose,
                ...(target === 'self' ? {} : { [target]: meta.targetId }),
              },
            });
            seriesId = series.id;
          }
          const id = randomUUID(),
            quarantineKey = 'quarantine/' + id;
          // Object storage precedes the record: a failed transaction leaves only an inaccessible orphan.
          await storage.put(quarantineKey, bytes!, mimeType);
          const created = await tx.document.create({
            data: {
              id,
              seriesId,
              version,
              uploaderUserId: request.user.sub,
              clientId: meta.clientId,
              payloadHash,
              title: meta.title,
              originalName,
              mimeType,
              originalSize: bytes!.length,
              sourceHash,
              quarantineKey,
              expiresAt: meta.expiresAt ? new Date(meta.expiresAt + 'T00:00:00Z') : null,
            },
            select: documentSelect,
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              entityType: 'Document',
              entityId: id,
              action: 'DOCUMENT_UPLOAD',
              ip: request.ip,
              newValue: { seriesId, version, purpose: meta.purpose, sourceHash },
            },
          });
          if (meta.purpose === 'CASE_EVIDENCE') {
            const actor = await caseActor(tx, request);
            if (!actor) throw app.httpErrors.unauthorized('Session is no longer active');
            const row = await tx.request.update({
              where: { id: meta.targetId },
              data: { version: { increment: 1 } },
              select: { id: true, type: true, status: true, version: true },
            });
            const event = await tx.requestEvent.create({
              data: {
                requestId: row.id,
                ...actor,
                sequence: row.version,
                kind: 'EVIDENCE_ADDED',
                message: meta.title,
                metadata: { documentId: id, sourceHash, version },
              },
            });
            await caseAudit(tx, request, row, event.id, 'CASE_EVIDENCE_ADDED');
          }
          return created;
        },
        { isolationLevel: 'ReadCommitted', timeout: 30000 },
      );
      return reply
        .code(202)
        .send({ ...dto(result), canReplace: result.uploaderUserId === request.user.sub });
    },
  );
  app.post(
    '/:id/retry',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const { id } = params.parse(request.params);
      const { expectedRetryCount } = z
        .object({ expectedRetryCount: z.number().int().min(0).max(2) })
        .strict()
        .parse(request.body);
      return prisma.$transaction(async (tx) => {
        if (!(await account(tx, request)))
          throw app.httpErrors.unauthorized('Session is no longer active');
        await tx.$queryRaw`SELECT id FROM Document WHERE id = ${id} FOR UPDATE`;
        const row = await tx.document.findFirst({
          where: { id, uploaderUserId: request.user.sub, ...scope(request) },
          select: documentSelect,
        });
        if (!row) throw app.httpErrors.notFound('Document not found');
        if (row.retryCount === expectedRetryCount + 1) return dto(row);
        if (row.status !== 'FAILED' || row.retryCount !== expectedRetryCount || row.retryCount >= 3)
          throw app.httpErrors.conflict('Document cannot retry. Reload its status');
        const updated = await tx.document.update({
          where: { id },
          data: {
            status: 'QUARANTINED',
            attempts: 0,
            retryCount: { increment: 1 },
            nextAttemptAt: new Date(),
            failureCode: null,
            leaseToken: null,
            leaseExpiresAt: null,
          },
          select: documentSelect,
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'DOCUMENT_SCAN_RETRY',
            entityType: 'Document',
            entityId: id,
            newValue: { retryCount: updated.retryCount },
          },
        });
        return dto(updated);
      });
    },
  );
  app.post(
    '/:id/grant',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { id } = params.parse(request.params);
      z.object({})
        .strict()
        .parse(request.body ?? {});
      const row = await prisma.document.findFirst({ where: { id, ...scope(request) } });
      if (!row) throw app.httpErrors.notFound('Document not found');
      if (fileState(row) !== 'CLEAN' || !row.fileHash || !row.cleanKey)
        throw app.httpErrors.conflict('Document is not available');
      await prisma.auditEvent.create({
        data: {
          actorUserId: request.user.sub,
          action: 'DOCUMENT_GRANT',
          entityType: 'Document',
          entityId: id,
        },
      });
      return {
        token: createFileGrant({
          id,
          sub: request.user.sub,
          sid: request.user.sid!,
          hash: row.fileHash,
        }),
        expiresIn: fileConfig.FILE_GRANT_SECONDS,
      };
    },
  );
  app.get('/:id/file', async (request, reply) => {
    const { id } = params.parse(request.params);
    const grant = z.string().min(1).max(3000).parse(request.headers['x-file-grant']);
    const row = await prisma.document.findFirst({ where: { id, ...scope(request) } });
    if (!row) throw app.httpErrors.notFound('Document not found');
    if (
      fileState(row) !== 'CLEAN' ||
      !row.fileHash ||
      !row.cleanKey ||
      !verifyFileGrant(grant, {
        id,
        sub: request.user.sub,
        sid: request.user.sid!,
        hash: row.fileHash,
      })
    )
      throw app.httpErrors.forbidden('Document grant is invalid or expired');
    const bytes = await storage.get(row.cleanKey);
    if (bytes.length !== row.fileSize || fileDigest(bytes) !== row.fileHash)
      throw app.httpErrors.conflict('Document integrity mismatch');
    // A second authorized query prevents a changed relationship or expiry during object retrieval.
    if (
      !(await prisma.document.findFirst({
        where: {
          id,
          ...scope(request),
          status: 'CLEAN',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      }))
    )
      throw app.httpErrors.forbidden('Document is no longer available');
    await prisma.auditEvent.create({
      data: {
        actorUserId: request.user.sub,
        action: 'DOCUMENT_DOWNLOAD',
        entityType: 'Document',
        entityId: id,
        ip: request.ip,
        newValue: { fileHash: row.fileHash, version: row.version },
      },
    });
    reply.header(
      'Content-Disposition',
      `attachment; filename="document-${row.id}.${row.mimeType === 'image/png' ? 'png' : row.mimeType === 'image/jpeg' ? 'jpg' : 'pdf'}"`,
    );
    reply.header('X-Document-SHA256', row.fileHash);
    return reply.type(row.mimeType).send(bytes);
  });
};
