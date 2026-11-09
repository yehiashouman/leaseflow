import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { type NoticeState } from '@prisma/client';
import twilio from 'twilio';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { callbackUrl, noticeConfig } from '../notice-policy.js';
const states: Record<string, NoticeState> = {
  accepted: 'ACCEPTED',
  queued: 'ACCEPTED',
  sending: 'ACCEPTED',
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
  undelivered: 'FAILED',
  canceled: 'FAILED',
};
const rank: Record<NoticeState, number> = {
  PAUSED: 0,
  QUEUED: 0,
  RUNNING: 0,
  UNKNOWN: 0,
  SUPPRESSED: 0,
  ACCEPTED: 1,
  SENT: 3,
  FAILED: 4,
  DELIVERED: 5,
  READ: 6,
};
export const providerStatusRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, text, done) => {
      const fields: Record<string, string> = Object.create(null);
      for (const [key, value] of new URLSearchParams(String(text))) {
        if (Object.hasOwn(fields, key)) {
          const error = new Error('Duplicate callback fields') as Error & { statusCode: number };
          error.statusCode = 400;
          done(error);
          return;
        }
        fields[key] = value;
      }
      done(null, fields);
    },
  );
  app.post('/status', { bodyLimit: 8192 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (
      !env.TWILIO_ACCOUNT_SID ||
      !env.TWILIO_AUTH_TOKEN ||
      !noticeConfig.TWILIO_STATUS_CALLBACK_URL
    )
      throw app.httpErrors.serviceUnavailable('Provider callbacks are not configured');
    if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded')
      throw app.httpErrors.unsupportedMediaType('Use the provider form callback');
    const { job } = z
      .object({ job: z.string().regex(/^[A-Za-z0-9_-]{1,191}$/) })
      .strict()
      .parse(request.query);
    const signature = request.headers['x-twilio-signature'];
    const fields = z.record(z.string(), z.string().max(1000)).parse(request.body);
    if (
      typeof signature !== 'string' ||
      signature.length > 256 ||
      !twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, callbackUrl(job), fields)
    )
      throw app.httpErrors.unauthorized('Provider signature invalid');
    if (fields.AccountSid !== env.TWILIO_ACCOUNT_SID)
      throw app.httpErrors.forbidden('Provider account mismatch');
    const providerId = z
      .string()
      .regex(/^(SM|MM)[0-9a-f]{32}$/i)
      .parse(fields.MessageSid);
    const state = states[fields.MessageStatus ?? ''];
    if (!state) throw app.httpErrors.unprocessableEntity('Unsupported provider status');
    const fingerprint = createHash('sha256')
      .update([job, providerId, fields.MessageStatus, fields.ErrorCode ?? ''].join('|'))
      .digest('hex');
    return prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM NoticeDelivery WHERE id = ${job} FOR UPDATE`;
        if (!rows.length) throw app.httpErrors.notFound('Delivery not found');
        const current = await tx.noticeDelivery.findUniqueOrThrow({ where: { id: job } });
        if (current.channel !== 'WHATSAPP' || !current.attempts)
          throw app.httpErrors.conflict('No matching provider dispatch');
        if (current.providerId && current.providerId !== providerId)
          throw app.httpErrors.conflict('Provider message mismatch');
        if (await tx.noticeCallback.findUnique({ where: { fingerprint } }))
          return { accepted: true, duplicate: true };
        const now = new Date();
        await tx.noticeCallback.create({
          data: { deliveryId: job, fingerprint, providerId, state, receivedAt: now },
        });
        if (rank[state] >= rank[current.state])
          await tx.noticeDelivery.update({
            where: { id: job },
            data: {
              providerId,
              state,
              acceptedAt: current.acceptedAt ?? now,
              ...(state === 'DELIVERED' || state === 'READ'
                ? { deliveredAt: current.deliveredAt ?? now }
                : {}),
              ...(state === 'READ' ? { readAt: current.readAt ?? now } : {}),
              failureCode: state === 'FAILED' ? 'PROVIDER_DELIVERY_FAILED' : null,
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });
        return { accepted: true, duplicate: false };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  });
};
