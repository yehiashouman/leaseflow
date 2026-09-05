import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env, corsOrigins } from './config.js';
import { prisma } from './db.js';
import { authRoutes } from './routes/auth.js';
import { inventoryRoutes } from './routes/inventory.js';
import { contractRoutes } from './routes/contracts.js';
import { paymentRoutes } from './routes/payments.js';
import { requestRoutes } from './routes/requests.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { adminRoutes } from './routes/admin.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, trustProxy: true, bodyLimit: 2 * 1024 * 1024, requestIdHeader: 'x-request-id' });
  await app.register(sensible);
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: (origin, cb) => !origin || corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('Origin not allowed'), false), credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute', keyGenerator: (request) => request.user?.sub ?? request.ip });
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
  await app.register(swagger, { openapi: { info: { title: 'Leaseflow API', version: '1.0.0' }, servers: [{ url: '/api/v1' }] } });
  await app.register(swaggerUi, { routePrefix: '/documentation' });
  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', async (_, reply) => { try { await prisma.$queryRaw`SELECT 1`; return { status: 'ready' }; } catch { return reply.serviceUnavailable('Database unavailable'); } });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' });
  await app.register(contractRoutes, { prefix: '/api/v1/contracts' });
  await app.register(paymentRoutes, { prefix: '/api/v1/payments' });
  await app.register(requestRoutes, { prefix: '/api/v1/requests' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  app.setErrorHandler((error: FastifyError | ZodError, request, reply) => {
    if (error instanceof ZodError) return reply.code(422).send({ error: 'ValidationError', details: error.issues, requestId: request.id });
    request.log.error(error); return reply.code(error.statusCode ?? 500).send({ error: error.name, message: error.statusCode ? error.message : 'Internal server error', requestId: request.id });
  });
  app.addHook('onClose', () => prisma.$disconnect());
  return app;
}
