import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db.js';

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueTokens(app: FastifyInstance, user: { id: string; role: 'ADMIN' | 'LEASING_MANAGER' | 'TENANT' }) {
  const accessToken = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: process.env.ACCESS_TOKEN_TTL ?? '15m' });
  const refreshToken = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400000) } });
  return { accessToken, refreshToken };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try { await request.jwtVerify(); } catch { return reply.unauthorized('Authentication required'); }
}

export function allowRoles(...roles: Array<'ADMIN' | 'LEASING_MANAGER' | 'TENANT'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!roles.includes(request.user.role)) return reply.forbidden('Insufficient permissions');
  };
}
