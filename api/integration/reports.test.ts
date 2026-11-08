import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { runReportWorkerOnce } from '../src/report-worker.js';
import { renderCasePdf } from '../src/case-report.js';

type Actor = { id: string; role: Role; sid: string; profileId: string };
describe('MySQL durable private case reports', () => {
  let app: FastifyInstance;
  let tenant: Actor, manager: Actor, foreign: Actor, admin: Actor;
  let contractId: string, requestId: string, roomId: string, unitId: string;
  const users: string[] = [];
  let ip = 110;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Reports require a dedicated _test database');
    app = await buildApp();
    await app.ready();
    async function actor(role: Role, managerId?: string): Promise<Actor> {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@report.invalid',
          passwordHash: 'not-a-login-hash',
          role,
          status: 'ACTIVE',
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Report Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Report Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { tenant: true, leasingManager: true },
      });
      users.push(user.id);
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      return {
        id: user.id,
        role,
        sid: session.id,
        profileId: user.tenant?.id ?? user.leasingManager?.id ?? user.id,
      };
    }
    manager = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.profileId);
    foreign = await actor('LEASING_MANAGER');
    admin = await actor('ADMIN');
    const unit = await prisma.unit.create({
      data: {
        managerId: manager.profileId,
        name: 'Report Unit',
        area: 'Dubai',
        ownerMonthlyRent: 9999,
      },
    });
    unitId = unit.id;
    const room = await prisma.rentalSpace.create({
      data: { unitId, name: 'Report Room', type: 'ROOM' },
    });
    roomId = room.id;
    const contract = await prisma.contract.create({
      data: {
        tenantId: tenant.profileId,
        rentalSpaceId: roomId,
        status: 'ACTIVE',
        startDate: new Date(),
        monthlyRent: 3000,
      },
    });
    contractId = contract.id;
  });
  beforeEach(async () => {
    ip++;
    const row = await prisma.request.create({
      data: {
        contractId,
        type: 'MAINTENANCE',
        title: 'Private factual report',
        description: 'The tap leaks',
        version: 1,
        events: {
          create: {
            kind: 'SUBMITTED',
            message: 'The tap leaks',
            actorName: 'Original Report Tenant',
            actorRole: 'TENANT',
            actorUserId: tenant.id,
            sequence: 1,
          },
        },
      },
    });
    requestId = row.id;
  });
  afterEach(async () => {
    await prisma.caseReportJob.deleteMany({ where: { ownerUserId: { in: users } } });
  });
  afterAll(async () => {
    if (contractId) {
      await prisma.caseReportJob.deleteMany({ where: { request: { contractId } } });
      await prisma.requestEvent.deleteMany({ where: { request: { contractId } } });
      await prisma.request.deleteMany({ where: { contractId } });
      await prisma.contract.delete({ where: { id: contractId } });
      await prisma.rentalSpace.delete({ where: { id: roomId } });
      await prisma.unit.delete({ where: { id: unitId } });
      await prisma.tenantProfile.deleteMany({ where: { userId: { in: users } } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
      await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) await app.close();
    else await prisma.$disconnect();
  });
  function send(method: 'GET' | 'POST', path: string, payload?: object, actor = tenant) {
    return app.inject({
      method,
      url: '/api/v1/reports' + path,
      payload,
      headers: {
        authorization:
          'Bearer ' + app.jwt.sign({ sub: actor.id, role: actor.role, sid: actor.sid }),
        'x-forwarded-for': '198.51.100.' + ip,
      },
    });
  }
  const command = () => ({ requestId, expectedVersion: 1, clientId: randomUUID() });
  async function create(actor = tenant) {
    const response = await send('POST', '', command(), actor);
    expect(response.statusCode, response.body).toBe(202);
    return response.json();
  }
  it('queues immutable snapshots and replays keys without duplicate jobs or audits', async () => {
    const body = command();
    const first = await send('POST', '', body);
    const repeat = await send('POST', '', body);
    expect(repeat.json().id).toBe(first.json().id);
    expect(first.json().status).toBe('QUEUED');
    expect(first.body).not.toContain('The tap leaks');
    expect(first.body).not.toContain('clientId');
    expect(
      await prisma.auditEvent.count({
        where: { entityId: first.json().id, action: 'REPORT_QUEUED' },
      }),
    ).toBe(1);
    expect((await send('POST', '', { ...body, expectedVersion: 2 })).statusCode).toBe(409);
    await prisma.request.update({
      where: { id: requestId },
      data: { version: 2, description: 'Later description' },
    });
    expect((await send('POST', '', body)).json().id).toBe(first.json().id);
    expect((await send('POST', '', command())).statusCode).toBe(409);
    expect((await send('GET', '/' + first.json().id + '/source')).body).not.toContain(
      'Later description',
    );
  });
  it('denies foreign jobs, ordinary administrators, and another participant job downloads', async () => {
    const job = await create();
    for (const actor of [manager, foreign, admin]) {
      for (const suffix of ['', '/file', '/source'])
        expect((await send('GET', '/' + job.id + suffix, undefined, actor)).statusCode).toBe(
          actor === admin ? 403 : 404,
        );
    }
    expect((await send('POST', '', command(), foreign)).statusCode).toBe(404);
    expect((await send('POST', '', command(), admin)).statusCode).toBe(403);
    expect((await send('GET', '?requestId=' + requestId, undefined, manager)).json().items).toEqual(
      [],
    );
  });
  it('generates a real authorized PDF and verifies extracted content and both integrity hashes', async () => {
    const job = await create();
    expect((await send('GET', '/' + job.id + '/file')).statusCode).toBe(409);
    expect(await runReportWorkerOnce()).toBe(true);
    const status = (await send('GET', '/' + job.id)).json();
    expect(status.status).toBe('COMPLETE');
    const response = await send('GET', '/' + job.id + '/file');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(createHash('sha256').update(response.rawPayload).digest('hex')).toBe(status.pdfHash);
    expect(response.headers['x-report-snapshot-sha256']).toBe(job.snapshotHash);
    const folder = mkdtempSync(join(tmpdir(), 'leaseflow-pdf-'));
    try {
      const file = join(folder, 'report.pdf');
      writeFileSync(file, response.rawPayload);
      execFileSync('pdftotext', ['-layout', file, join(folder, 'report.txt')]);
      const text = readFileSync(join(folder, 'report.txt'), 'utf8');
      for (const value of [
        'The tap leaks',
        'Original Report Tenant',
        job.id,
        job.snapshotHash,
        'Not legal findings or certification',
        'All timestamps UTC',
      ])
        expect(text).toContain(value);
      for (const value of ['ownerMonthlyRent', 'passwordHash', 'clientId'])
        expect(text).not.toContain(value);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    expect(
      await prisma.auditEvent.count({ where: { entityId: job.id, action: 'REPORT_DOWNLOAD' } }),
    ).toBe(1);
  });
  it('uses identical factual hashes for both participants and preserves author snapshots after profile edits', async () => {
    const own = await create();
    const managed = await create(manager);
    expect(managed.snapshotHash).toBe(own.snapshotHash);
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { fullName: 'Later mutable name' },
    });
    const source = await send('GET', '/' + own.id + '/source');
    expect(source.body).toContain('Original Report Tenant');
    expect(source.body).not.toContain('Later mutable name');
  });
  it('keeps private drafts inaccessible to manager queues and report creation', async () => {
    await prisma.request.update({ where: { id: requestId }, data: { status: 'DRAFT' } });
    expect((await send('POST', '', command(), manager)).statusCode).toBe(404);
    expect((await send('GET', '?requestId=' + requestId, undefined, manager)).statusCode).toBe(404);
    expect((await create()).status).toBe('QUEUED');
  });
  it('persists failure, retries the same snapshot, and replays retry commands without duplicate audits', async () => {
    const job = await create();
    await runReportWorkerOnce(async () => {
      throw new Error('private renderer details');
    });
    const failed = (await send('GET', '/' + job.id)).json();
    expect(failed).toMatchObject({ status: 'FAILED', failureCode: 'RENDER_FAILED' });
    expect(JSON.stringify(failed)).not.toContain('private renderer details');
    const first = await send('POST', '/' + job.id + '/retry', { expectedRetryCount: 0 });
    expect(first.statusCode).toBe(200);
    const repeat = await send('POST', '/' + job.id + '/retry', { expectedRetryCount: 0 });
    expect(repeat.json().retryCount).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { entityId: job.id, action: 'REPORT_RETRY' } }),
    ).toBe(1);
    await runReportWorkerOnce();
    expect((await send('GET', '/' + job.id)).json()).toMatchObject({
      status: 'COMPLETE',
      snapshotHash: job.snapshotHash,
    });
  });
  it('fails unsupported PDF characters without loss from the UTF-8 source export', async () => {
    await prisma.request.update({ where: { id: requestId }, data: { title: 'مرحبا' } });
    const job = await create();
    await runReportWorkerOnce();
    expect((await send('GET', '/' + job.id)).json()).toMatchObject({
      status: 'FAILED',
      failureCode: 'UNSUPPORTED_TEXT',
    });
    expect((await send('GET', '/' + job.id + '/source')).json().snapshot.title).toBe('مرحبا');
  });
  it('claims work once across concurrent workers and prevents stale lease results from overwriting a replacement', async () => {
    const job = await create();
    let calls = 0;
    await Promise.all([
      runReportWorkerOnce(async (...args) => {
        calls++;
        return renderCasePdf(...args);
      }),
      runReportWorkerOnce(async (...args) => {
        calls++;
        return renderCasePdf(...args);
      }),
    ]);
    expect(calls).toBe(1);
    expect((await send('GET', '/' + job.id)).json().status).toBe('COMPLETE');
    const next = await create();
    await runReportWorkerOnce(async (...args) => {
      await prisma.caseReportJob.update({
        where: { id: next.id },
        data: { leaseToken: 'replacement-worker', status: 'RUNNING' },
      });
      return renderCasePdf(...args);
    });
    const current = await prisma.caseReportJob.findUniqueOrThrow({ where: { id: next.id } });
    expect(current.status).toBe('RUNNING');
    expect(current.pdfBytes).toBeNull();
  });
  it('recovers expired worker leases and stops repeated interrupted attempts', async () => {
    const job = await create();
    await prisma.caseReportJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        leaseToken: 'lost-worker',
        leaseExpiresAt: new Date(Date.now() - 60000),
        attempts: 1,
      },
    });
    await runReportWorkerOnce();
    expect((await send('GET', '/' + job.id)).json().status).toBe('COMPLETE');
    const exhausted = await create();
    await prisma.caseReportJob.update({
      where: { id: exhausted.id },
      data: {
        status: 'RUNNING',
        leaseToken: 'lost-worker',
        leaseExpiresAt: new Date(Date.now() - 60000),
        attempts: 3,
      },
    });
    await runReportWorkerOnce();
    expect((await send('GET', '/' + exhausted.id)).json()).toMatchObject({
      status: 'FAILED',
      failureCode: 'WORKER_INTERRUPTED',
    });
  });
  it('denies downloads after ownership changes and detects corrupted stored PDF bytes', async () => {
    const job = await create();
    await runReportWorkerOnce();
    await prisma.caseReportJob.update({
      where: { id: job.id },
      data: { pdfBytes: new Uint8Array([1, 2, 3]) },
    });
    expect((await send('GET', '/' + job.id + '/file')).statusCode).toBe(409);
    await prisma.tenantProfile.update({
      where: { id: tenant.profileId },
      data: { managerId: foreign.profileId },
    });
    try {
      expect((await send('GET', '/' + job.id + '/source')).statusCode).toBe(404);
    } finally {
      await prisma.tenantProfile.update({
        where: { id: tenant.profileId },
        data: { managerId: manager.profileId },
      });
    }
  });
  it('enforces manual retry limits and rejects corrupt source snapshots', async () => {
    const job = await create();
    await prisma.caseReportJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', retryCount: 3 },
    });
    expect(
      (await send('POST', '/' + job.id + '/retry', { expectedRetryCount: 3 })).statusCode,
    ).toBe(409);
    const stored = await prisma.caseReportJob.findUniqueOrThrow({ where: { id: job.id } });
    await prisma.caseReportJob.update({
      where: { id: job.id },
      data: { snapshot: { ...(stored.snapshot as object), title: 'Corrupted source' } },
    });
    expect((await send('GET', '/' + job.id + '/source')).statusCode).toBe(409);
  });
  it('enforces queue limits, query schemas, and current session revocation', async () => {
    await create();
    await create();
    await create();
    expect((await send('POST', '', command())).statusCode).toBe(429);
    expect((await send('GET', '?requestId=' + requestId + '&page=0')).statusCode).toBe(422);
    expect((await send('POST', '', { ...command(), ownerUserId: manager.id })).statusCode).toBe(
      422,
    );
    await prisma.authSession.update({ where: { id: tenant.sid }, data: { revokedAt: new Date() } });
    try {
      expect((await send('GET', '?requestId=' + requestId)).statusCode).toBe(401);
    } finally {
      await prisma.authSession.update({ where: { id: tenant.sid }, data: { revokedAt: null } });
    }
  });
});
