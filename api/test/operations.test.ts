import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import type { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  authSession: { findFirst: vi.fn() },
  caseReportJob: { groupBy: vi.fn() },
  document: { groupBy: vi.fn() },
  outboundEmail: { groupBy: vi.fn() },
  noticeDelivery: { groupBy: vi.fn() },
  businessJob: { groupBy: vi.fn() },
  $transaction: vi.fn(),
  $disconnect: vi.fn(),
}));
vi.mock('../src/db.js', () => ({ prisma: db }));
vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost/test');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters');
vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-at-least-32-characters');
let app: FastifyInstance;
beforeAll(async () => {
  app = await (await import('../src/app.js')).buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'ADMIN' });
  db.authSession.findFirst.mockResolvedValue({ id: 'sid' });
  db.$transaction.mockImplementation((callback) => callback(db));
  db.noticeDelivery.groupBy.mockResolvedValue([]);
  db.businessJob.groupBy.mockResolvedValue([]);
  for (const table of [db.caseReportJob, db.document, db.outboundEmail])
    table.groupBy.mockResolvedValue([
      { status: 'FAILED', failureCode: 'DELIVERY_UNAVAILABLE', _count: { _all: 2 } },
    ]);
});
const get = (path: string, role: Role = 'ADMIN') =>
  app.inject({
    method: 'GET',
    url: path,
    headers: { authorization: 'Bearer ' + app.jwt.sign({ sub: 'actor', role, sid: 'sid' }) },
  });
it('returns only aggregate job state and preserves provider failures as explicit counts', async () => {
  const response = await get('/api/v1/operations/jobs');
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json().emails).toEqual([
    { status: 'FAILED', failureCode: 'DELIVERY_UNAVAILABLE', count: 2 },
  ]);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).not.toMatch(/encryptedPayload|snapshot|recipient|tokenHash/);
});
it('rejects ordinary roles and anonymous users for metrics and job summaries', async () => {
  for (const path of ['/api/v1/operations/jobs', '/api/v1/operations/metrics']) {
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
    for (const role of ['TENANT', 'LEASING_MANAGER'] as const) {
      db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', role });
      expect((await get(path, role)).statusCode).toBe(403);
    }
  }
});
it('keeps metrics on route templates without private queries or arbitrary paths', async () => {
  await get('/private/person@example.com?token=private-secret');
  const response = await get('/api/v1/operations/metrics');
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('text/plain');
  expect(response.body).toContain('leaseflow_http_requests_total');
  expect(response.body).not.toMatch(/person@example|private-secret/);
});
it('reports database failure instead of false zero job counts', async () => {
  db.caseReportJob.groupBy.mockRejectedValue(new Error('database unavailable'));
  const response = await get('/api/v1/operations/jobs');
  expect(response.statusCode).toBe(500);
  expect(response.json().reports).toBeUndefined();
});
