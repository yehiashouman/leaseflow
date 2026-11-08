import Fastify, { type FastifyError } from 'fastify';
import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env, isOriginAllowed, trustedProxies } from './config.js';
import { sendApiError } from './errors.js';
import { databaseReady } from './readiness.js';
import { prisma } from './db.js';
import { authRoutes } from './routes/auth.js';
import { inventoryRoutes } from './routes/inventory.js';
import { contractRoutes } from './routes/contracts.js';
import { paymentRoutes } from './routes/payments.js';
import { requestRoutes } from './routes/requests.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { adminRoutes } from './routes/admin.js';
import { profileRoutes } from './routes/profile.js';
import { tenantRoutes } from './routes/tenants.js';
import { notificationRoutes } from './routes/notifications.js';
import { reportRoutes } from './routes/reports.js';
import { reportWorker } from './report-worker.js';
import { invitationRoutes } from './routes/invitations.js';
import { accountRoutes } from './routes/accounts.js';
import { emailWorker } from './email-worker.js';
import { documentRoutes } from './routes/documents.js';
import { fileWorker } from './file-worker.js';
import { fileConfig } from './file-policy.js';
import { privateStorage } from './file-storage.js';
import { maintenanceRoutes } from './routes/maintenance.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url?.split('?')[0],
          remoteAddress: request.ip,
        }),
      },
    },
    trustProxy: trustedProxies,
    bodyLimit: 2 * 1024 * 1024,
    requestIdHeader: false,
    genReqId: (request) => {
      const id = request.headers['x-request-id'];
      return typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : randomUUID();
    },
  });
  await app.register(sensible);
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-ID', request.id);
  });
  await app.register(cookie);
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) {
        cb(null, true);
        return;
      }
      const error = new Error('Origin not allowed') as FastifyError;
      error.statusCode = 403;
      error.code = 'FST_CORS_ORIGIN_DENIED';
      (error as FastifyError & { rejectedOrigin?: string }).rejectedOrigin = origin;
      cb(error, false);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.user?.sub ?? request.ip,
  });
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
  await app.register(swagger, {
    openapi: { info: { title: 'Leaseflow API', version: '1.0.0' }, servers: [{ url: '/api/v1' }] },
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });
  // The error handler must be registered before any routes/plugins are added
  // so that routes defined afterwards (including those in encapsulated
  // sub-plugins) correctly bind to this handler instead of Fastify's default.
  app.setErrorHandler(sendApiError);
  app.setNotFoundHandler((request, reply) =>
    sendApiError(app.httpErrors.notFound('Resource not found'), request, reply),
  );
  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', async (_, reply) => {
    try {
      if (!(await databaseReady()))
        return reply.serviceUnavailable('Required database migrations are incomplete');
      return { status: 'ready' };
    } catch {
      return reply.serviceUnavailable('Database unavailable');
    }
  });
  await app.register(invitationRoutes, { prefix: '/api/v1/invitations' });
  await app.register(accountRoutes, { prefix: '/api/v1/auth' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' });
  await app.register(contractRoutes, { prefix: '/api/v1/contracts' });
  await app.register(paymentRoutes, { prefix: '/api/v1/payments' });
  await app.register(requestRoutes, { prefix: '/api/v1/requests' });
  await app.register(maintenanceRoutes, { prefix: '/api/v1/requests' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(profileRoutes, { prefix: '/api/v1/profile' });
  await app.register(tenantRoutes, { prefix: '/api/v1/tenants' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });
  await app.register(documentRoutes, { prefix: '/api/v1/documents' });
  const emails = emailWorker(() => app.log.error('Email worker failed'));
  const files = fileWorker(() => app.log.error('File worker failed'));
  const worker = reportWorker(() => app.log.error('Report worker failed'));
  app.addHook('onListen', async () => {
    if (fileConfig.FILES_ENABLED === 'true') await privateStorage.verify();
    emails.start();
    files.start();
    worker.start();
  });
  app.addHook('onClose', async () => {
    await emails.stop();
    await files.stop();
    await worker.stop();
    await prisma.$disconnect();
  });
  return app;
}
