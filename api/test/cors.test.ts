import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

// A route that never touches the database so these tests can run without a
// live MySQL connection while still exercising the real CORS plugin logic.
const HEALTH_PATH = '/health/live';

async function buildTestApp(): Promise<FastifyInstance> {
  const { buildApp } = await import('../src/app.js');
  return buildApp();
}

describe('CORS', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows requests with no Origin header (curl, server-to-server)', async () => {
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH });
    expect(res.statusCode).toBe(200);
  });

  it('allows an exact configured origin from CORS_ORIGINS', async () => {
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin: 'http://localhost:8080' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('ignores a trailing slash when matching a configured origin', async () => {
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin: 'http://localhost:8080/' } });
    expect(res.statusCode).toBe(200);
  });

  it('allows a Codespaces application origin in development', async () => {
    const origin = 'https://fake-codespace-name-8080.app.github.dev';
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('allows a Codespaces editor origin in development', async () => {
    const origin = 'https://fake-codespace-name.github.dev';
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('rejects an unrelated origin with 403, not 500', async () => {
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin: 'https://evil.example.com' } });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.requestId).toBeTruthy();
  });

  it('rejects a spoofed origin that only substring-matches a Codespaces domain', async () => {
    const spoofed = 'https://evil.com/.app.github.dev';
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin: spoofed } });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a spoofed origin with github.dev as a suffix of another domain', async () => {
    const spoofed = 'https://notgithub.dev.evil.com';
    const res = await app.inject({ method: 'GET', url: HEALTH_PATH, headers: { origin: spoofed } });
    expect(res.statusCode).toBe(403);
  });
});
