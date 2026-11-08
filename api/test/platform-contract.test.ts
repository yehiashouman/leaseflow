import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
  user: { findUnique: vi.fn() },
  authSession: { findFirst: vi.fn() },
}));
vi.mock('../src/db.js', () => ({ prisma: db }));
import { buildApp } from '../src/app.js';
import { requiredMigrations } from '../src/readiness.js';
import { env, parseConfiguration, proxyConfiguration } from '../src/config.js';
const settings = () => ({
  DATABASE_URL: 'mysql://test:test@localhost/leaseflow_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  NODE_ENV: 'production',
  DEMO_MODE: 'false',
  CORS_ORIGINS: 'https://app.example.com',
  TRUST_PROXY: 'false',
});
describe('API platform contract', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    app.get('/test/ip', async (request) => ({ ip: request.ip }));
    app.get('/test/error/:status', async (request) => {
      const status = Number((request.params as { status: string }).status);
      if (status === 500) throw new Error('private-password-and-query');
      throw app.httpErrors.createError(status, 'Safe request explanation');
    });
    app.post('/test/validation', async (request) =>
      z
        .object({ name: z.string().min(3) })
        .strict()
        .parse(request.body),
    );
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue(
      requiredMigrations.map((migration_name) => ({
        migration_name,
        finished_at: new Date(),
        rolled_back_at: null,
      })),
    );
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
    db.authSession.findFirst.mockResolvedValue({ id: 'session' });
  });
  it('namespaces every published business route under api/v1', async () => {
    for (const path of [
      '/contracts',
      '/requests',
      '/inventory/units',
      '/dashboard/admin',
      '/tenants',
      '/profile',
      '/notifications',
      '/reports?requestId=missing',
      '/admin/managers',
    ])
      expect((await app.inject('/api/v1' + path)).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/payments/missing/record', payload: {} }))
        .statusCode,
    ).toBe(401);
    expect((await app.inject('/contracts')).statusCode).toBe(404);
  });
  it('uses 401 for missing authentication and 403 for a forbidden authenticated role', async () => {
    const missing = await app.inject('/api/v1/contracts');
    expect(missing.statusCode).toBe(401);
    expect(missing.json().code).toBe('UNAUTHORIZED');
    const forbidden = await app.inject({
      url: '/api/v1/inventory/units',
      headers: {
        authorization: 'Bearer ' + app.jwt.sign({ sub: 'admin', role: 'ADMIN', sid: 'session' }),
      },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('FORBIDDEN');
  });
  it('keeps landlords record-only and exposes no collection or escrow endpoint', async () => {
    for (const url of [
      '/api/v1/auth/register/landlord',
      '/api/v1/payments/collect',
      '/api/v1/payments/escrow',
    ])
      expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404);
  });
  it('returns consistent state, validation, missing-resource, and abuse errors', async () => {
    for (const [status, code] of [
      [409, 'CONFLICT'],
      [404, 'NOT_FOUND'],
      [429, 'RATE_LIMITED'],
    ] as const) {
      const response = await app.inject('/test/error/' + status);
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({
        code,
        message: 'Safe request explanation',
        requestId: expect.any(String),
      });
    }
    const validation = await app.inject({
      method: 'POST',
      url: '/test/validation',
      payload: { name: 'x', password: 'never-echo-this' },
    });
    expect(validation.statusCode).toBe(422);
    expect(validation.json().code).toBe('VALIDATION_FAILED');
    expect(validation.json().message).toContain('name:');
    expect(validation.body).not.toContain('never-echo-this');
    const missing = await app.inject('/missing-resource');
    expect(missing.json().code).toBe('NOT_FOUND');
  });
  it('sanitizes internal failures and correlates safe request identifiers', async () => {
    const result = await app.inject({
      url: '/test/error/500',
      headers: { 'x-request-id': 'verified-request-123' },
    });
    expect(result.statusCode).toBe(500);
    expect(result.json()).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'verified-request-123',
    });
    expect(result.headers['x-request-id']).toBe('verified-request-123');
    expect(result.body).not.toContain('private-password');
    const invalid = await app.inject({
      url: '/health/live',
      headers: { 'x-request-id': 'private@example.com/' },
    });
    expect(invalid.headers['x-request-id']).not.toBe('private@example.com/');
  });
  it('blocks production financial writes before provisional policies can reach the database', async () => {
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'production';
    db.user.findUnique.mockResolvedValue({ role: 'LEASING_MANAGER', status: 'ACTIVE' });
    try {
      for (const url of ['/api/v1/contracts', '/api/v1/payments/missing/record']) {
        const response = await app.inject({
          method: 'POST',
          url,
          payload: {},
          headers: {
            authorization:
              'Bearer ' + app.jwt.sign({ sub: 'manager', role: 'LEASING_MANAGER', sid: 'session' }),
          },
        });
        expect(response.statusCode).toBe(409);
        expect(response.json().code).toBe('CONFLICT');
        expect(response.json().message).toContain('approved financial');
      }
    } finally {
      env.NODE_ENV = previous;
    }
  });
  it('rejects spoofed forwarding headers from an untrusted peer', async () => {
    const response = await app.inject({
      url: '/test/ip',
      remoteAddress: '203.0.113.20',
      headers: { 'x-forwarded-for': '198.51.100.99' },
    });
    expect(response.json().ip).toBe('203.0.113.20');
    const trusted = await app.inject({
      url: '/test/ip',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.99' },
    });
    expect(trusted.json().ip).toBe('198.51.100.99');
  });
  it('requires all migrations before readiness and rejects incomplete migration attempts', async () => {
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    db.$queryRaw.mockResolvedValue([]);
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    db.$queryRaw.mockResolvedValue(
      requiredMigrations.map((migration_name, index) => ({
        migration_name,
        finished_at: index ? new Date() : null,
        rolled_back_at: null,
      })),
    );
    const partial = await app.inject('/health/ready');
    expect(partial.statusCode).toBe(503);
    expect(partial.json().code).toBe('NOT_READY');
    db.$queryRaw.mockRejectedValue(new Error('private-database-credentials'));
    const unavailable = await app.inject('/health/ready');
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.body).not.toContain('private-database');
  });
  it('enforces session CSRF headers across every cookie mutation', async () => {
    for (const url of ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            payload: {},
            headers: { 'x-leaseflow-session': '1', 'sec-fetch-site': 'cross-site' },
          })
        ).statusCode,
      ).toBe(403);
    }
  });
});
describe('production configuration boundaries', () => {
  it('accepts exact HTTPS origins and explicit proxy policy', () => {
    expect(parseConfiguration(settings()).NODE_ENV).toBe('production');
    expect(proxyConfiguration('false')).toBe(false);
    expect(proxyConfiguration('10.0.0.0/8,::1/128')).toHaveLength(2);
  });
  it('rejects production demo mode, shared secrets, placeholders, and implicit origin/proxy policy', () => {
    for (const change of [
      { DEMO_MODE: 'true' },
      { JWT_REFRESH_SECRET: 'a'.repeat(64) },
      { JWT_ACCESS_SECRET: 'replace-with-32-plus-random-characters' },
      { CORS_ORIGINS: '' },
      { TRUST_PROXY: '' },
    ])
      expect(() => parseConfiguration({ ...settings(), ...change })).toThrow();
  });
  it('rejects wildcards, credentials, paths, insecure production origins, and global proxy trust', () => {
    for (const CORS_ORIGINS of [
      '*',
      'http://app.example.com',
      'https://app.example.com/path',
      'https://user:secret@app.example.com',
    ])
      expect(() => parseConfiguration({ ...settings(), CORS_ORIGINS })).toThrow();
    for (const value of ['true', '*', '0.0.0.0/0', '::/0', '10.0.0.0/99', 'example.com'])
      expect(() => proxyConfiguration(value)).toThrow();
  });
});
