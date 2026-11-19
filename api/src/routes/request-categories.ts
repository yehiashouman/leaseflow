import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { basicCaseTypes } from '../case-rules.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { listPageSize, optionalPage, pageWindow } from '../list-page.js';

const fields = {
  type: z.enum(basicCaseTypes),
  name: z.string().trim().min(2).max(100),
  prompt: z.string().trim().min(3).max(200).nullable(),
  answerRequired: z.boolean(),
  active: z.boolean(),
};
const requirePrompt = {
  path: ['prompt'],
  message: 'Add a question when an answer is required.',
};
const createCategory = z
  .object(fields)
  .strict()
  .refine((body) => !body.answerRequired || !!body.prompt, requirePrompt);
const updateCategory = z
  .object({ ...fields, expectedVersion: z.number().int().min(1).max(2147483646) })
  .strict()
  .refine((body) => !body.answerRequired || !!body.prompt, requirePrompt);

export const requestCategoryRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = allowRoles('ADMIN');
  const editable = () => env.NODE_ENV !== 'production';
  function verifyEditable() {
    if (!editable())
      throw app.httpErrors.conflict('Production category changes require administrator MFA.');
  }
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/', { preHandler: adminOnly }, async (request) => {
    const { page = 1 } = z.object({ page: optionalPage }).strict().parse(request.query);
    const [items, total] = await prisma.$transaction([
      prisma.requestCategory.findMany({
        ...pageWindow(page),
        orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
      prisma.requestCategory.count(),
    ]);
    return { items, total, page, pageSize: listPageSize, editable: editable() };
  });
  app.post('/', { preHandler: adminOnly }, async (request, reply) => {
    verifyEditable();
    const body = createCategory.parse(request.body);
    try {
      const category = await prisma.$transaction(async (tx) => {
        const row = await tx.requestCategory.create({ data: body });
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'REQUEST_CATEGORY_CREATED',
            entityType: 'RequestCategory',
            entityId: row.id,
            ip: request.ip,
            newValue: row,
          },
        });
        return row;
      });
      return reply.code(201).send(category);
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw app.httpErrors.conflict('That request type already has a category with this name.');
      throw cause;
    }
  });
  app.patch('/:id', { preHandler: adminOnly }, async (request) => {
    verifyEditable();
    const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
    const { expectedVersion, ...body } = updateCategory.parse(request.body);
    try {
      return await prisma.$transaction(async (tx) => {
        const old = await tx.requestCategory.findUnique({ where: { id } });
        if (!old) throw app.httpErrors.notFound('Request category not found.');
        const result = await tx.requestCategory.updateMany({
          where: { id, version: expectedVersion },
          data: { ...body, version: { increment: 1 } },
        });
        if (!result.count) throw app.httpErrors.conflict('The category changed. Reload and retry.');
        const row = await tx.requestCategory.findUniqueOrThrow({ where: { id } });
        await tx.auditEvent.create({
          data: {
            actorUserId: request.user.sub,
            action: 'REQUEST_CATEGORY_UPDATED',
            entityType: 'RequestCategory',
            entityId: row.id,
            ip: request.ip,
            oldValue: old,
            newValue: row,
          },
        });
        return row;
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
        throw app.httpErrors.conflict('That request type already has a category with this name.');
      throw cause;
    }
  });
};
