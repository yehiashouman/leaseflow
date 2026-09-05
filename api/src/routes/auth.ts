import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, hashToken, issueTokens, verifyPassword } from '../auth.js';

const registerSchema = z.object({ email: z.email(), password: z.string().min(12).max(128), fullName: z.string().min(2).max(150) });
const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register/manager', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (exists) return reply.conflict('Email already registered');
    const user = await prisma.user.create({ data: { email: body.email.toLowerCase(), passwordHash: await hashPassword(body.password), role: 'LEASING_MANAGER', leasingManager: { create: { fullName: body.fullName } } } });
    return reply.code(201).send({ id: user.id, status: user.status, message: 'Verify email, phone, then await platform activation.' });
  });

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) return reply.unauthorized('Invalid credentials');
    if (user.status !== 'ACTIVE') return reply.forbidden(`Account status: ${user.status}`);
    return issueTokens(app, { id: user.id, role: user.role });
  });

  app.post('/refresh', async (request, reply) => {
    const body = z.object({ refreshToken: z.string().min(20) }).parse(request.body);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(body.refreshToken) }, include: { user: true } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) return reply.unauthorized('Invalid refresh token');
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return issueTokens(app, { id: record.user.id, role: record.user.role });
  });
};
