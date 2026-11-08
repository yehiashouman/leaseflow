import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';
import { activeAccount } from '../account-data.js';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
export const preferencesSchema = z
  .object({
    gender: optionalText(80),
    nationality: optionalText(80),
    language: optionalText(80),
    culture: optionalText(160),
    lifestyle: optionalText(300),
    sleepSchedule: optionalText(160),
    smoking: z.enum(['NO_PREFERENCE', 'SMOKING', 'NON_SMOKING']),
    noise: optionalText(160),
    sharedLanguage: optionalText(80),
  })
  .strict();
const updateSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    fullName: z.string().trim().min(2).max(150),
    dateOfBirth: z.iso
      .date()
      .nullable()
      .refine(
        (value) => !value || value <= new Date().toISOString().slice(0, 10),
        'Date of birth cannot be in the future',
      ),
    nationality: optionalText(100),
    gender: optionalText(40),
    pendingPhone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, 'Use an international phone number')
      .nullable(),
    preferredLanguage: z
      .string()
      .min(2)
      .max(35)
      .refine((value) => {
        try {
          return Intl.getCanonicalLocales(value).length === 1;
        } catch {
          return false;
        }
      }, 'Use a language tag'),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Use an IANA timezone'),
    deliveryPreference: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']),
    matchingPreferences: preferencesSchema,
  })
  .strict();
const userSelect = {
  id: true,
  email: true,
  phone: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  preferredLanguage: true,
  timezone: true,
  profileVersion: true,
  notifyEmail: true,
  notifyWhatsapp: true,
  tenant: {
    select: {
      id: true,
      fullName: true,
      dateOfBirth: true,
      nationality: true,
      gender: true,
      pendingPhone: true,
      matchingPreferences: true,
    },
  },
} as const;
function dto(user: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
  const { notifyEmail, notifyWhatsapp, tenant, ...account } = user;
  const parsed = preferencesSchema.partial().safeParse(tenant?.matchingPreferences ?? {});
  return {
    ...account,
    tenant: tenant ? { ...tenant, matchingPreferences: parsed.success ? parsed.data : {} } : null,
    deliveryPreference:
      notifyEmail && notifyWhatsapp
        ? 'BOTH'
        : notifyWhatsapp
          ? 'WHATSAPP'
          : notifyEmail
            ? 'EMAIL'
            : null,
    securityEmail: user.email,
  };
}
export const profileRoutes: FastifyPluginAsync = async (app) => {
  const tenantOnly = allowRoles('TENANT');
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/', { preHandler: tenantOnly }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub }, select: userSelect });
    if (!user.tenant) throw app.httpErrors.notFound('Tenant profile not found');
    return dto(user);
  });
  app.patch('/', { preHandler: tenantOnly }, async (request) => {
    const body = updateSchema.parse(request.body);
    try {
      return await prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          const current = await tx.user.findUniqueOrThrow({
            where: { id: request.user.sub },
            select: userSelect,
          });
          if (!current.tenant) throw app.httpErrors.notFound('Tenant profile not found');
          if (current.profileVersion !== body.expectedVersion)
            throw app.httpErrors.conflict('Profile changed. Reload before another edit');
          await tx.tenantProfile.update({
            where: { id: current.tenant.id },
            data: {
              fullName: body.fullName,
              dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth + 'T00:00:00Z') : null,
              nationality: body.nationality,
              gender: body.gender,
              pendingPhone: body.pendingPhone,
              matchingPreferences: body.matchingPreferences,
            },
          });
          const updated = await tx.user.update({
            where: { id: current.id },
            data: {
              preferredLanguage: body.preferredLanguage,
              timezone: body.timezone,
              notifyEmail: body.deliveryPreference !== 'WHATSAPP',
              notifyWhatsapp: body.deliveryPreference !== 'EMAIL',
              profileVersion: { increment: 1 },
            },
            select: userSelect,
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: current.id,
              action: 'PROFILE_UPDATE',
              entityType: 'User',
              entityId: current.id,
              newValue: { profileVersion: updated.profileVersion },
              ip: request.ip,
              userAgent: request.headers['user-agent'],
            },
          });
          return dto(updated);
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034')
        throw app.httpErrors.conflict('Profile changed. Reload before another edit');
      throw cause;
    }
  });
};
