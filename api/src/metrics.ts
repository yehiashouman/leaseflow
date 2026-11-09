import type { FastifyInstance } from 'fastify';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import { allowRoles } from './auth.js';

export function registerMetrics(app: FastifyInstance) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'leaseflow_' });
  const requests = new Counter({
    name: 'leaseflow_http_requests_total',
    help: 'Completed HTTP requests by route template and response status.',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'leaseflow_http_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15],
    registers: [registry],
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(
      request.method,
    )
      ? request.method
      : 'OTHER';
    requests.inc({ method, route, status: String(reply.statusCode) });
    duration.observe({ method, route }, reply.elapsedTime / 1000);
  });
  app.get(
    '/api/v1/operations/metrics',
    { preHandler: allowRoles('ADMIN') },
    async (_request, reply) =>
      reply
        .header('Cache-Control', 'no-store')
        .type(registry.contentType)
        .send(await registry.metrics()),
  );
  app.addHook('onClose', async () => {
    registry.clear();
  });
}
