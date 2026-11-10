import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';
import { NoticeState, Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { activeAccount } from '../account-data.js';
import {
  notificationScope,
  notificationTarget,
  notificationTargetSelect,
} from '../notification-data.js';
import { prisma } from '../db.js';
import { encryptMail } from '../account-policy.js';
import {
  noticeConfig,
  noticeLanguage,
  noticeTemplate,
  maskNoticeRecipient,
  recordNoticeTemplate,
} from '../notice-policy.js';
import { configuredNoticeChannels } from '../notice-worker.js';
const select = {
  id: true,
  channel: true,
  template: true,
  language: true,
  state: true,
  retrySequence: true,
  notificationId: true,
  recipientHint: true,
  attempts: true,
  nextAttemptAt: true,
  failureCode: true,
  acceptedAt: true,
  deliveredAt: true,
  readAt: true,
  createdAt: true,
  notification: {
    select: notificationTargetSelect,
  },
  attemptLog: {
    select: { number: true, state: true, failureCode: true, startedAt: true, finishedAt: true },
    orderBy: { number: 'desc' },
    take: 3,
  },
} satisfies Prisma.NoticeDeliverySelect;
export const noticeDeliveryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', allowRoles('LEASING_MANAGER', 'TENANT'));
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/deliveries', async (request) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        state: z.enum(NoticeState).optional(),
      })
      .strict()
      .parse(request.query);
    const scope: Prisma.NoticeDeliveryWhereInput = {
      recipientUserId: request.user.sub,
      notification: {
        ...notificationScope(request.user),
      },
    };
    const where = { ...scope, ...(query.state ? { state: query.state } : {}) };
    return prisma.$transaction(
      async (tx) => {
        const [items, total] = await Promise.all([
          tx.noticeDelivery.findMany({
            where,
            select,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 20,
            skip: (query.page - 1) * 20,
          }),
          tx.noticeDelivery.count({ where }),
        ]);
        const latest = items.length
          ? await tx.noticeDelivery.groupBy({
              by: ['notificationId', 'channel'],
              where: { ...scope, notificationId: { in: items.map((row) => row.notificationId) } },
              _max: { retrySequence: true },
            })
          : [];
        return {
          items: items.map((row) => ({
            ...row,
            subject: notificationTarget(row.notification),
            canRetry:
              ['FAILED', 'UNKNOWN', 'SUPPRESSED'].includes(row.state) &&
              row.retrySequence < 2 &&
              latest.some(
                (group) =>
                  group.notificationId === row.notificationId &&
                  group.channel === row.channel &&
                  group._max.retrySequence === row.retrySequence,
              ),
          })),
          total,
          page: query.page,
          pageSize: 20,
          enabledChannels: configuredNoticeChannels(),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  });
  app.post(
    '/deliveries/:id/retry',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().min(1).max(191) }).parse(request.params);
      const body = z
        .object({ clientId: z.uuid(), acknowledgePossibleDuplicate: z.boolean().default(false) })
        .strict()
        .parse(request.body);
      const hash = createHash('sha256')
        .update(JSON.stringify({ sourceId: id, ...body }))
        .digest('hex');
      const created = await prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const scope = {
            recipientUserId: request.user.sub,
            notification: notificationScope(request.user),
          };
          const previous = await tx.noticeDelivery.findUnique({
            where: {
              recipientUserId_retryClientId: {
                recipientUserId: request.user.sub,
                retryClientId: body.clientId,
              },
            },
          });
          if (previous) {
            if (previous.retryPayloadHash !== hash)
              throw app.httpErrors.conflict('Retry key reused with different content');
            const visible = await tx.noticeDelivery.findFirst({
              where: { id: previous.id, ...scope },
              select,
            });
            if (!visible) throw app.httpErrors.notFound('Delivery not found');
            return visible;
          }
          const initial = await tx.noticeDelivery.findFirst({
            where: { id, ...scope },
            select: { notificationId: true },
          });
          if (!initial) throw app.httpErrors.notFound('Delivery not found');
          await tx.$queryRaw`SELECT id FROM Notification WHERE id = ${initial.notificationId} AND recipientUserId = ${request.user.sub} FOR UPDATE`;
          const source = await tx.noticeDelivery.findFirst({
            where: { id, ...scope },
            include: { notification: { select: notificationTargetSelect } },
          });
          if (!source) throw app.httpErrors.notFound('Delivery not found');
          const latest = await tx.noticeDelivery.findFirst({
            where: { notificationId: source.notificationId, channel: source.channel },
            orderBy: { retrySequence: 'desc' },
            select: { id: true },
          });
          if (
            latest?.id !== id ||
            !['FAILED', 'UNKNOWN', 'SUPPRESSED'].includes(source.state) ||
            source.retrySequence >= 2
          )
            throw app.httpErrors.conflict(
              'Review the latest delivery; this attempt cannot be retried',
            );
          if (source.state === 'UNKNOWN' && !body.acknowledgePossibleDuplicate)
            throw app.httpErrors.unprocessableEntity(
              'Acknowledge that the previous send can already have reached the provider',
            );
          const user = await tx.user.findUniqueOrThrow({ where: { id: request.user.sub } });
          const address = source.channel === 'EMAIL' ? user.email : user.phone;
          const eligible =
            source.channel === 'EMAIL'
              ? user.notifyEmail && user.emailVerifiedAt
              : user.notifyWhatsapp && user.phoneVerifiedAt;
          if (!eligible || !address)
            throw app.httpErrors.conflict('Enable and verify this contact channel before retry');
          const language = noticeLanguage(user.preferredLanguage, source.channel);
          const enabled =
            source.channel === 'EMAIL'
              ? noticeConfig.CASE_EMAIL_ENABLED === 'true'
              : noticeConfig.CASE_WHATSAPP_ENABLED === 'true';
          const row = await tx.noticeDelivery.create({
            data: {
              notificationId: source.notificationId,
              recipientUserId: user.id,
              channel: source.channel,
              template: source.template,
              language,
              recipientCipher: encryptMail({ address }),
              recipientHint: maskNoticeRecipient(source.channel, address),
              payloadCipher: encryptMail(
                source.notification.event
                  ? noticeTemplate(language, source.notification.event.request.id)
                  : recordNoticeTemplate(language, notificationTarget(source.notification).path),
              ),
              state: enabled ? 'QUEUED' : 'PAUSED',
              retrySequence: source.retrySequence + 1,
              retryClientId: body.clientId,
              retryPayloadHash: hash,
            },
            select,
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: user.id,
              action: 'NOTICE_RETRY',
              entityType: 'NoticeDelivery',
              entityId: row.id,
              ip: request.ip,
              newValue: {
                previousDeliveryId: id,
                channel: source.channel,
                retrySequence: row.retrySequence,
                acknowledgedUnknownSend: body.acknowledgePossibleDuplicate,
              },
            },
          });
          return row;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(201).send(created);
    },
  );
};
