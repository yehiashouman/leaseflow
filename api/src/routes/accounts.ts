import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Prisma, type User } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, hashToken, verifyPassword } from '../auth.js';
import { authenticateOnboarding, onboardingAccount } from '../onboarding-auth.js';
import { lockUser, revokeSessions } from '../sessions.js';
import {
  accountConfig,
  canonicalEmail,
  declarationHash,
  declarationText,
  declarationVersion,
  securityLimits,
  sealIdentity,
  maskIdentity,
} from '../account-policy.js';
import { issueAccountToken, queueAccountEmail } from '../account-email.js';
import { env } from '../config.js';
import twilio from 'twilio';

const passwordSchema = z.string().min(12).max(128);
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    dateOfBirth: z.iso
      .date()
      .refine((date) => date < new Date().toISOString().slice(0, 10), 'Use a past date'),
    nationality: z.string().trim().min(2).max(100),
    emiratesIdNumber: z.string().regex(/^784-?\d{4}-?\d{7}-?\d$/, 'Use a valid Emirates ID format'),
    emiratesIdExpiry: z.iso.date(),
    licenseType: z.string().trim().min(1).max(100).nullable().default(null),
    licenseNumber: z.string().trim().min(1).max(100).nullable().default(null),
    licenseIssuer: z.string().trim().min(1).max(100).nullable().default(null),
    licenseIssuedAt: z.iso.date().nullable().default(null),
    licenseExpiry: z.iso.date().nullable().default(null),
  })
  .strict()
  .refine(
    (value) =>
      !value.licenseNumber ||
      Boolean(
        value.licenseType && value.licenseIssuer && value.licenseIssuedAt && value.licenseExpiry,
      ),
    'Complete all licence fields when a licence number exists',
  );
export const managerRegistrationSchema = z
  .object({
    email: canonicalEmail,
    password: passwordSchema,
    fullName: z.string().trim().min(2).max(150),
    dateOfBirth: z.iso
      .date()
      .refine((date) => date < new Date().toISOString().slice(0, 10), 'Use a past date'),
    nationality: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    declarationVersion: z.literal(declarationVersion),
    declarationAccepted: z.literal(true),
  })
  .strict();
export interface PhoneProvider {
  start(phone: string): Promise<string>;
  verify(phone: string, code: string): Promise<boolean>;
}
const verifyService = () => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SERVICE_SID)
    throw new Error('WhatsApp verification is not configured');
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, {
    timeout: 15000,
    maxRetries: 0,
  }).verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID);
};
export const twilioPhoneProvider: PhoneProvider = {
  async start(phone) {
    return (await verifyService().verifications.create({ to: phone, channel: 'whatsapp' })).sid;
  },
  async verify(phone, code) {
    return (
      (await verifyService().verificationChecks.create({ to: phone, code })).status === 'approved'
    );
  },
};
async function setupSession(
  tx: Prisma.TransactionClient,
  app: FastifyInstance,
  user: Pick<User, 'id' | 'role'>,
  request: FastifyRequest,
) {
  const session = await tx.authSession.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 1800000), ip: request.ip },
  });
  return {
    accessToken: app.jwt.sign(
      { sub: user.id, role: user.role, sid: session.id, onboarding: true },
      { expiresIn: 1800 },
    ),
    sessionId: session.id,
  };
}
export const accountRoutes: FastifyPluginAsync<{ phoneProvider?: PhoneProvider }> = async (
  app,
  options,
) => {
  const provider = options.phoneProvider ?? twilioPhoneProvider;
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  const requireEmail = () => {
    if (accountConfig.ACCOUNT_EMAIL_ENABLED !== 'true')
      throw app.httpErrors.serviceUnavailable('Account email is not enabled');
  };
  app.get('/policy', async () => ({
    emailEnabled: accountConfig.ACCOUNT_EMAIL_ENABLED === 'true',
    phoneEnabled: Boolean(
      env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID,
    ),
    declarationVersion,
    declarationText,
    declarationHash,
    limits: securityLimits,
    productionApproved: false,
  }));
  app.post(
    '/register/manager',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = managerRegistrationSchema.parse(request.body);
      requireEmail();
      const passwordHash = await hashPassword(body.password);
      try {
        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: body.email,
              passwordHash,
              role: 'LEASING_MANAGER',
              status: 'PENDING_EMAIL',
              leasingManager: {
                create: {
                  fullName: body.fullName,
                  dateOfBirth: new Date(body.dateOfBirth),
                  nationality: body.nationality,
                  pendingPhone: body.phone,
                  declarationAcceptedAt: new Date(),
                },
              },
            },
          });
          const session = await setupSession(tx, app, user, request);
          await tx.accountConsent.create({
            data: {
              userId: user.id,
              version: declarationVersion,
              textHash: declarationHash,
              sessionId: session.sessionId,
              ip: request.ip,
            },
          });
          await issueAccountToken(tx, user, 'EMAIL_VERIFY');
          await tx.auditEvent.create({
            data: {
              actorUserId: user.id,
              action: 'MANAGER_REGISTER',
              entityType: 'User',
              entityId: user.id,
              newValue: { declarationVersion, declarationHash },
            },
          });
          return { id: user.id, status: user.status, accessToken: session.accessToken };
        });
        return reply.code(201).send(result);
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
          throw app.httpErrors.conflict(
            'Account already exists. Use account setup or password recovery',
          );
        throw cause;
      }
    },
  );
  app.post(
    '/setup/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request) => {
      const body = z
        .object({ email: canonicalEmail, password: z.string().min(1).max(128) })
        .strict()
        .parse(request.body);
      const candidate = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });
      if (!candidate)
        throw app.httpErrors.unauthorized('Invalid credentials or unavailable account');
      return prisma.$transaction(async (tx) => {
        await lockUser(tx, candidate.id);
        const user = await tx.user.findUniqueOrThrow({ where: { id: candidate.id } });
        if (
          user.role === 'ADMIN' ||
          ['SUSPENDED', 'REJECTED'].includes(user.status) ||
          !(await verifyPassword(user.passwordHash, body.password))
        )
          throw app.httpErrors.unauthorized('Invalid credentials or unavailable account');
        const session = await setupSession(tx, app, user, request);
        await tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            action: 'ACCOUNT_SETUP_LOGIN',
            entityType: 'AuthSession',
            entityId: session.sessionId,
          },
        });
        return { accessToken: session.accessToken };
      });
    },
  );
  app.post('/setup/logout', { preHandler: authenticateOnboarding }, async (request) => {
    await prisma.$transaction(async (tx) => {
      if (!(await onboardingAccount(tx, request)))
        throw app.httpErrors.unauthorized('Account session expired');
      await revokeSessions(tx, request.user.sub, request.user.sid);
    });
    return { message: 'Account setup session ended.' };
  });
  app.get('/setup/me', { preHandler: authenticateOnboarding }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        leasingManager: {
          select: {
            fullName: true,
            dateOfBirth: true,
            nationality: true,
            emiratesIdNumber: true,
            emiratesIdExpiry: true,
            pendingPhone: true,
            licenseType: true,
            licenseNumber: true,
            licenseIssuer: true,
            licenseIssuedAt: true,
            licenseExpiry: true,
            submittedAt: true,
          },
        },
        tenant: {
          select: {
            fullName: true,
            dateOfBirth: true,
            nationality: true,
            emiratesIdNumber: true,
            emiratesIdExpiry: true,
            pendingPhone: true,
          },
        },
      },
    });
    const documents = await prisma.document.findMany({
      where: { series: { ownerUserId: user.id, purpose: { in: ['IDENTITY', 'LICENSE'] } } },
      select: { id: true, status: true, expiresAt: true, series: { select: { purpose: true } } },
    });
    const profile = user.leasingManager ?? user.tenant;
    const complete = Boolean(
      profile?.dateOfBirth &&
      profile.nationality &&
      profile.emiratesIdNumber &&
      profile.emiratesIdExpiry &&
      profile.emiratesIdExpiry > new Date() &&
      documents.some(
        (row) =>
          row.series.purpose === 'IDENTITY' &&
          row.status === 'CLEAN' &&
          (!row.expiresAt || row.expiresAt > new Date()),
      ) &&
      (!user.leasingManager?.licenseNumber ||
        (Boolean(
          user.leasingManager.licenseExpiry && user.leasingManager.licenseExpiry > new Date(),
        ) &&
          documents.some(
            (row) =>
              row.series.purpose === 'LICENSE' &&
              row.status === 'CLEAN' &&
              (!row.expiresAt || row.expiresAt > new Date()),
          ))),
    );
    const maskProfile = (value: typeof profile) =>
      value
        ? {
            ...value,
            emiratesIdNumber: maskIdentity(value.emiratesIdNumber),
          }
        : null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      profile: maskProfile(profile),
      identityComplete: complete,
      moderationAvailable: false,
      documents,
    };
  });
  app.post('/setup/submit', { preHandler: authenticateOnboarding }, async (request) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    await prisma.$transaction(async (tx) => {
      if (!(await onboardingAccount(tx, request)))
        throw app.httpErrors.unauthorized('Account session expired');
      const user = await tx.user.findUniqueOrThrow({
        where: { id: request.user.sub },
        include: { leasingManager: true },
      });
      const profile = user.leasingManager;
      if (
        user.role !== 'LEASING_MANAGER' ||
        user.status !== 'PENDING_APPROVAL' ||
        !user.emailVerifiedAt ||
        !user.phoneVerifiedAt ||
        !profile
      )
        throw app.httpErrors.conflict('Complete manager email and WhatsApp verification first');
      const consent = await tx.accountConsent.findUnique({
        where: { userId_version: { userId: user.id, version: declarationVersion } },
      });
      const documents = await tx.document.findMany({
        where: {
          series: { ownerUserId: user.id, purpose: { in: ['IDENTITY', 'LICENSE'] } },
          status: 'CLEAN',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { series: { select: { purpose: true } } },
      });
      if (
        !consent ||
        consent.textHash !== declarationHash ||
        !profile.dateOfBirth ||
        !profile.nationality ||
        !profile.emiratesIdNumber ||
        !profile.emiratesIdExpiry ||
        profile.emiratesIdExpiry <= new Date() ||
        !documents.some((row) => row.series.purpose === 'IDENTITY') ||
        (profile.licenseNumber &&
          (!profile.licenseExpiry ||
            profile.licenseExpiry <= new Date() ||
            !documents.some((row) => row.series.purpose === 'LICENSE')))
      )
        throw app.httpErrors.conflict(
          'Complete identity, current private documents, and declarations before submission',
        );
      if (!profile.submittedAt) {
        await tx.leasingManagerProfile.update({
          where: { userId: user.id },
          data: { submittedAt: new Date() },
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            action: 'MANAGER_SUBMITTED',
            entityType: 'User',
            entityId: user.id,
          },
        });
      }
    });
    return { message: 'Account submitted for platform review. Activation remains pending.' };
  });
  app.post('/email/verify', async (request) => {
    const { token } = tokenSchema.parse(request.body);
    const candidate = await prisma.accountToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!candidate)
      throw app.httpErrors.unprocessableEntity('Verification link is invalid or expired');
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, candidate.userId);
      const row = await tx.accountToken.findUnique({
        where: { id: candidate.id },
        include: { user: true },
      });
      if (
        !row ||
        row.type !== 'EMAIL_VERIFY' ||
        row.usedAt ||
        row.revokedAt ||
        row.expiresAt <= new Date() ||
        row.user.status !== 'PENDING_EMAIL'
      )
        throw app.httpErrors.unprocessableEntity('Verification link is invalid or expired');
      await tx.accountToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await tx.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: new Date(), status: 'PENDING_PHONE' },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: row.userId,
          action: 'ACCOUNT_EMAIL_VERIFIED',
          entityType: 'User',
          entityId: row.userId,
        },
      });
    });
    return { message: 'Email verified. Complete WhatsApp verification in account setup.' };
  });
  app.post(
    '/email/resend',
    {
      preHandler: authenticateOnboarding,
      config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
    },
    async (request) => {
      z.object({})
        .strict()
        .parse(request.body ?? {});
      requireEmail();
      await prisma.$transaction(async (tx) => {
        if (!(await onboardingAccount(tx, request)))
          throw app.httpErrors.unauthorized('Account session expired');
        const user = await tx.user.findUniqueOrThrow({ where: { id: request.user.sub } });
        if (user.status !== 'PENDING_EMAIL')
          throw app.httpErrors.conflict('Email is already verified or unavailable');
        const latest = await tx.accountToken.findFirst({
          where: { userId: user.id, type: 'EMAIL_VERIFY' },
          orderBy: { createdAt: 'desc' },
        });
        if (latest && Date.now() - latest.createdAt.getTime() < securityLimits.resendSeconds * 1000)
          throw app.httpErrors.tooManyRequests('Wait 60 seconds before resend');
        await issueAccountToken(tx, user, 'EMAIL_VERIFY');
      });
      return { message: 'Verification email queued.' };
    },
  );
  app.post(
    '/password/request',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { email } = z.object({ email: canonicalEmail }).strict().parse(request.body);
      requireEmail();
      const candidate = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (candidate)
        await prisma.$transaction(async (tx) => {
          await lockUser(tx, candidate.id);
          const user = await tx.user.findUniqueOrThrow({ where: { id: candidate.id } });
          if (!user.emailVerifiedAt) return;
          const latest = await tx.accountToken.findFirst({
            where: { userId: user.id, type: 'PASSWORD_RESET' },
            orderBy: { createdAt: 'desc' },
          });
          if (
            latest &&
            Date.now() - latest.createdAt.getTime() < securityLimits.resendSeconds * 1000
          )
            return;
          await issueAccountToken(tx, user, 'PASSWORD_RESET');
        });
      return reply
        .code(202)
        .send({ message: 'If the verified account exists, a reset email will arrive.' });
    },
  );
  app.post(
    '/password/reset',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request) => {
      const { token, newPassword } = tokenSchema
        .extend({ newPassword: passwordSchema })
        .parse(request.body);
      const candidate = await prisma.accountToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!candidate) throw app.httpErrors.unprocessableEntity('Reset link is invalid or expired');
      const passwordHash = await hashPassword(newPassword);
      await prisma.$transaction(async (tx) => {
        await lockUser(tx, candidate.userId);
        const row = await tx.accountToken.findUnique({
          where: { id: candidate.id },
          include: { user: true },
        });
        if (
          !row ||
          row.type !== 'PASSWORD_RESET' ||
          row.usedAt ||
          row.revokedAt ||
          row.expiresAt <= new Date() ||
          !row.user.emailVerifiedAt
        )
          throw app.httpErrors.unprocessableEntity('Reset link is invalid or expired');
        await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
        await tx.accountToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
        await tx.accountToken.updateMany({
          where: { userId: row.userId, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await revokeSessions(tx, row.userId);
        await queueAccountEmail(tx, {
          userId: row.userId,
          recipient: row.user.email,
          template: 'PASSWORD_RESET_COMPLETE',
          subject: 'Your LeaseFlow password changed',
          text: 'Your LeaseFlow password changed. All previous sessions were revoked. If you did not request this, contact support immediately.',
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: row.userId,
            action: 'PASSWORD_RESET',
            entityType: 'User',
            entityId: row.userId,
          },
        });
      });
      return { message: 'Password reset. Sign in again.' };
    },
  );
  app.patch('/setup/profile', { preHandler: authenticateOnboarding }, async (request) => {
    const body = profileSchema.parse(request.body);
    await prisma.$transaction(async (tx) => {
      if (!(await onboardingAccount(tx, request)))
        throw app.httpErrors.unauthorized('Account session expired');
      const user = await tx.user.findUniqueOrThrow({ where: { id: request.user.sub } });
      if (!user.emailVerifiedAt || !['PENDING_PHONE', 'PENDING_APPROVAL'].includes(user.status))
        throw app.httpErrors.conflict('Verify email before profile changes');
      const base = {
        fullName: body.fullName,
        dateOfBirth: new Date(body.dateOfBirth),
        nationality: body.nationality,
        emiratesIdNumber: sealIdentity(body.emiratesIdNumber),
        emiratesIdExpiry: new Date(body.emiratesIdExpiry),
      };
      if (user.role === 'LEASING_MANAGER')
        await tx.leasingManagerProfile.update({
          where: { userId: user.id },
          data: {
            ...base,
            submittedAt: null,
            licenseType: body.licenseType,
            licenseNumber: body.licenseNumber,
            licenseIssuer: body.licenseIssuer,
            licenseIssuedAt: body.licenseIssuedAt ? new Date(body.licenseIssuedAt) : null,
            licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
          },
        });
      else await tx.tenantProfile.update({ where: { userId: user.id }, data: base });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: 'ACCOUNT_IDENTITY_PROFILE',
          entityType: 'User',
          entityId: user.id,
        },
      });
    });
    return { message: 'Profile saved.' };
  });
  app.post(
    '/phone/start',
    {
      preHandler: authenticateOnboarding,
      config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
    },
    async (request) => {
      const { phone } = z
        .object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) })
        .strict()
        .parse(request.body);
      const lease = crypto.randomUUID();
      await prisma.$transaction(async (tx) => {
        if (!(await onboardingAccount(tx, request)))
          throw app.httpErrors.unauthorized('Account session expired');
        const user = await tx.user.findUniqueOrThrow({ where: { id: request.user.sub } });
        if (!user.emailVerifiedAt || user.status !== 'PENDING_PHONE')
          throw app.httpErrors.conflict('Verify email before WhatsApp');
        const previous = await tx.phoneChallenge.findUnique({ where: { userId: user.id } });
        const active = previous && previous.expiresAt > new Date();
        if (
          active &&
          (previous.sends >= securityLimits.otpSends ||
            Date.now() - previous.lastSentAt.getTime() < 60000)
        )
          throw app.httpErrors.tooManyRequests('Wait before another WhatsApp code');
        const data = {
          phone,
          expiresAt: new Date(Date.now() + securityLimits.otpMinutes * 60000),
          lastSentAt: new Date(),
          sends: active ? previous.sends + 1 : 1,
          attempts: active ? previous.attempts : 0,
          consumedAt: null,
          leaseToken: lease,
          providerId: null,
        };
        await tx.phoneChallenge.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...data },
          update: data,
        });
      });
      try {
        const providerId = await provider.start(phone);
        const changed = await prisma.phoneChallenge.updateMany({
          where: { userId: request.user.sub, leaseToken: lease },
          data: { providerId, leaseToken: null },
        });
        if (!changed.count) throw new Error('Challenge superseded');
      } catch {
        await prisma.phoneChallenge.updateMany({
          where: { userId: request.user.sub, leaseToken: lease },
          data: { leaseToken: null },
        });
        throw app.httpErrors.serviceUnavailable('WhatsApp provider unavailable');
      }
      return { message: 'WhatsApp code requested.', expiresIn: securityLimits.otpMinutes * 60 };
    },
  );
  app.post(
    '/phone/confirm',
    {
      preHandler: authenticateOnboarding,
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request) => {
      const { code } = z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(request.body);
      const lease = crypto.randomUUID();
      const challenge = await prisma.$transaction(async (tx) => {
        if (!(await onboardingAccount(tx, request)))
          throw app.httpErrors.unauthorized('Account session expired');
        const user = await tx.user.findUniqueOrThrow({ where: { id: request.user.sub } });
        const row = await tx.phoneChallenge.findUnique({ where: { userId: user.id } });
        if (
          !user.emailVerifiedAt ||
          user.status !== 'PENDING_PHONE' ||
          !row ||
          !row.providerId ||
          row.consumedAt ||
          row.expiresAt <= new Date() ||
          row.leaseToken ||
          row.attempts >= securityLimits.otpAttempts
        )
          throw app.httpErrors.conflict('WhatsApp challenge expired or unavailable');
        return tx.phoneChallenge.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, leaseToken: lease },
        });
      });
      let approved: boolean;
      try {
        approved = await provider.verify(challenge.phone, code);
      } catch {
        await prisma.phoneChallenge.updateMany({
          where: { id: challenge.id, leaseToken: lease },
          data: { leaseToken: null },
        });
        throw app.httpErrors.serviceUnavailable('WhatsApp provider unavailable');
      }
      if (!approved) {
        await prisma.phoneChallenge.updateMany({
          where: { id: challenge.id, leaseToken: lease },
          data: { leaseToken: null },
        });
        throw app.httpErrors.unprocessableEntity('WhatsApp code is incorrect');
      }
      try {
        await prisma.$transaction(async (tx) => {
          if (!(await onboardingAccount(tx, request)))
            throw app.httpErrors.unauthorized('Account session expired');
          const row = await tx.phoneChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
          const user = await tx.user.findUniqueOrThrow({ where: { id: request.user.sub } });
          if (
            row.leaseToken !== lease ||
            row.consumedAt ||
            row.expiresAt <= new Date() ||
            user.status !== 'PENDING_PHONE'
          )
            throw app.httpErrors.conflict('WhatsApp challenge changed');
          await tx.user.update({
            where: { id: user.id },
            data: { phone: row.phone, phoneVerifiedAt: new Date(), status: 'PENDING_APPROVAL' },
          });
          await tx.phoneChallenge.update({
            where: { id: row.id },
            data: { consumedAt: new Date(), leaseToken: null },
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: user.id,
              action: 'ACCOUNT_PHONE_VERIFIED',
              entityType: 'User',
              entityId: user.id,
            },
          });
        });
      } catch (cause) {
        await prisma.phoneChallenge.updateMany({
          where: { id: challenge.id, leaseToken: lease },
          data: { leaseToken: null },
        });
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
          throw app.httpErrors.conflict('Phone already belongs to another account');
        throw cause;
      }
      return {
        message:
          'WhatsApp verified. Complete identity documents; platform activation remains pending.',
      };
    },
  );
};
