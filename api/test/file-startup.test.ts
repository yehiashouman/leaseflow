import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
const verify = vi.hoisted(() => vi.fn());
vi.mock('../src/file-storage.js', () => ({ privateStorage: { verify } }));
vi.mock('../src/db.js', () => ({ prisma: { $disconnect: vi.fn() } }));
import { buildApp } from '../src/app.js';
import { fileConfig } from '../src/file-policy.js';
const originalEnabled = fileConfig.FILES_ENABLED;
let app: FastifyInstance | undefined;
beforeEach(() => {
  verify.mockReset();
  fileConfig.FILES_ENABLED = 'true';
});
afterEach(async () => {
  fileConfig.FILES_ENABLED = originalEnabled;
  await app?.close().catch(() => {});
  app = undefined;
});
describe('private storage must pass before the listener opens', () => {
  it('refuses to listen when private bucket verification fails', async () => {
    verify.mockRejectedValue(new Error('Private bucket policy failed'));
    app = await buildApp();
    await expect(app.listen({ host: '127.0.0.1', port: 0 })).rejects.toThrow(
      'Private bucket policy failed',
    );
    expect(app.server.listening).toBe(false);
  });
  it('verifies storage during readiness before requests or worker startup', async () => {
    verify.mockResolvedValue(undefined);
    app = await buildApp();
    await app.ready();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(app.server.listening).toBe(false);
  });
});
