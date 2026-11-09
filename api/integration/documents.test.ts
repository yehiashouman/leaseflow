import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { documentRoutes } from '../src/routes/documents.js';
import { fileConfig, fileDigest, type FileMetadata } from '../src/file-policy.js';
import { runFileWorkerOnce } from '../src/file-worker.js';
import type { PrivateStorage } from '../src/file-storage.js';
import { sendApiError } from '../src/errors.js';
import { env } from '../src/config.js';
type Actor = { id: string; role: Role; sid: string; profileId: string; onboarding?: true };
describe('MySQL private documents, quarantine, immutable versions, and access grants', () => {
  let app: FastifyInstance, manager: Actor, tenant: Actor, foreign: Actor, admin: Actor;
  let unitId: string,
    roomId: string,
    landlordId: string,
    contractId: string,
    requestId: string,
    png: Buffer;
  let enabled: typeof fileConfig.FILES_ENABLED;
  const users: string[] = [],
    objects = new Map<string, Buffer>();
  const storage: PrivateStorage = {
    verify: async () => {},
    put: vi.fn(async (key, bytes) => {
      if (objects.has(key)) throw new Error('Object overwrite');
      objects.set(key, Buffer.from(bytes));
    }),
    get: vi.fn(async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('Object missing');
      return Buffer.from(bytes);
    }),
  };
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Documents require a dedicated _test database');
    enabled = fileConfig.FILES_ENABLED;
    fileConfig.FILES_ENABLED = 'true';
    app = Fastify({ logger: false });
    await app.register(sensible);
    await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
    app.setErrorHandler(sendApiError);
    await app.register(documentRoutes, { prefix: '/api/v1/documents', storage });
    await app.ready();
    async function actor(role: Role, managerId?: string): Promise<Actor> {
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + '@document.invalid',
          passwordHash: 'no-login',
          role,
          status: 'ACTIVE',
          ...(role === 'LEASING_MANAGER'
            ? { leasingManager: { create: { fullName: 'Document Manager' } } }
            : {}),
          ...(role === 'TENANT'
            ? { tenant: { create: { fullName: 'Document Tenant', managerId: managerId! } } }
            : {}),
        },
        include: { leasingManager: true, tenant: true },
      });
      users.push(user.id);
      const session = await prisma.authSession.create({
        data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      });
      return {
        id: user.id,
        role,
        sid: session.id,
        profileId: user.leasingManager?.id ?? user.tenant?.id ?? user.id,
      };
    }
    manager = await actor('LEASING_MANAGER');
    tenant = await actor('TENANT', manager.profileId);
    foreign = await actor('LEASING_MANAGER');
    admin = await actor('ADMIN');
    const landlord = await prisma.landlord.create({
      data: { managerId: manager.profileId, name: 'Private Owner' },
    });
    landlordId = landlord.id;
    const unit = await prisma.unit.create({
      data: { managerId: manager.profileId, landlordId, name: 'Private Unit', area: 'Dubai' },
    });
    unitId = unit.id;
    const room = await prisma.rentalSpace.create({
      data: { unitId, name: 'Private Room', type: 'ROOM' },
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
    png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#00ff00' } })
      .withMetadata({ exif: { IFD0: { Artist: 'Sensitive author' } } })
      .png()
      .toBuffer();
  });
  beforeEach(async () => {
    objects.clear();
    vi.clearAllMocks();
    const row = await prisma.request.create({
      data: {
        contractId,
        type: 'MAINTENANCE',
        title: 'Evidence case',
        description: 'A factual record',
        version: 1,
        events: {
          create: {
            kind: 'SUBMITTED',
            sequence: 1,
            actorUserId: tenant.id,
            actorRole: 'TENANT',
            actorName: 'Document Tenant',
          },
        },
      },
    });
    requestId = row.id;
  });
  afterEach(async () => {
    await prisma.document.deleteMany({ where: { uploaderUserId: { in: users } } });
    await prisma.documentSeries.deleteMany({ where: { ownerUserId: { in: users } } });
    await prisma.notification.deleteMany({ where: { event: { requestId } } });
    await prisma.requestEvent.deleteMany({ where: { requestId } });
    await prisma.request.delete({ where: { id: requestId } });
  });
  afterAll(async () => {
    fileConfig.FILES_ENABLED = enabled;
    if (contractId) {
      await prisma.contract.delete({ where: { id: contractId } });
      await prisma.rentalSpace.delete({ where: { id: roomId } });
      await prisma.unit.delete({ where: { id: unitId } });
      await prisma.landlord.delete({ where: { id: landlordId } });
    }
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: users } },
          { entityType: 'Document', entityId: { in: [...documentIds] } },
        ],
      },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app?.close();
    await prisma.$disconnect();
  });
  const documentIds = new Set<string>();
  function headers(actor = tenant) {
    return {
      authorization:
        'Bearer ' +
        app.jwt.sign({
          sub: actor.id,
          role: actor.role,
          sid: actor.sid,
          onboarding: actor.onboarding,
        }),
    };
  }
  function send(
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
    actor = tenant,
    extra: Record<string, string> = {},
  ) {
    return app.inject({
      method,
      url: '/api/v1/documents' + path,
      payload,
      headers: { ...headers(actor), ...extra },
    });
  }
  const meta = (extra: Partial<FileMetadata> = {}): FileMetadata => ({
    purpose: 'IDENTITY',
    targetId: 'self',
    clientId: randomUUID(),
    title: 'Private identity',
    expiresAt: null,
    ...extra,
  });
  function upload(
    body = meta(),
    actor = tenant,
    bytes = png,
    mimeType = 'image/png',
    filename = 'evidence.png',
  ) {
    const boundary = 'leaseflow-' + randomUUID();
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(body)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { ...headers(actor), 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload,
    });
  }
  async function create(body = meta(), actor = tenant) {
    const response = await upload(body, actor);
    expect(response.statusCode, response.body).toBe(202);
    documentIds.add(response.json().id);
    return response.json();
  }
  const clean = async () => {
    expect(await runFileWorkerOnce(storage, async () => 'CLEAN')).toBe(true);
  };
  async function download(id: string, actor = tenant) {
    const grant = await send('POST', '/' + id + '/grant', {}, actor);
    expect(grant.statusCode, grant.body).toBe(200);
    return send('GET', '/' + id + '/file', undefined, actor, {
      'x-file-grant': grant.json().token,
    });
  }
  it('keeps expense invoices private to their manager through upload, scan, and download', async () => {
    const expense = await prisma.expense.create({
      data: {
        managerId: manager.profileId,
        category: 'MAINTENANCE',
        amount: '100.00',
        currency: 'AED',
        incurredAt: new Date('2026-11-09'),
        vendor: 'Private Invoice Vendor',
      },
    });
    try {
      const metadata = meta({
        purpose: 'EXPENSE_EVIDENCE',
        targetId: expense.id,
        title: 'Private expense invoice',
      });
      expect((await upload(metadata, tenant)).statusCode).toBe(404);
      expect((await upload(metadata, foreign)).statusCode).toBe(404);
      const row = await create(metadata, manager);
      expect((await send('POST', '/' + row.id + '/grant', {}, manager)).statusCode).toBe(409);
      await clean();
      expect((await download(row.id, manager)).statusCode).toBe(200);
      expect((await send('GET', '/' + row.id, undefined, tenant)).statusCode).toBe(404);
      expect((await send('POST', '/' + row.id + '/grant', {}, foreign)).statusCode).toBe(404);
    } finally {
      await prisma.document.deleteMany({ where: { series: { expenseId: expense.id } } });
      await prisma.documentSeries.deleteMany({ where: { expenseId: expense.id } });
      await prisma.expense.delete({ where: { id: expense.id } });
    }
  });
  it('scopes secondary identity files to their primary tenant and manager without a new login', async () => {
    const occupant = await prisma.contractOccupant.create({
      data: {
        contractId,
        role: 'SECONDARY',
        fullName: 'Private Secondary',
        effectiveFrom: new Date('2026-11-01'),
      },
    });
    const metadata = meta({
      purpose: 'OCCUPANT_IDENTITY',
      targetId: occupant.id,
      title: 'Secondary identity copy',
    });
    expect((await upload(metadata, foreign)).statusCode).toBe(404);
    const row = await create(metadata, tenant);
    await clean();
    expect((await download(row.id, tenant)).statusCode).toBe(200);
    expect((await download(row.id, manager)).statusCode).toBe(200);
    expect((await send('POST', '/' + row.id + '/grant', {}, foreign)).statusCode).toBe(404);
  });
  it('requires authentication, rejects admin access, and exposes no anonymous object path', async () => {
    expect((await app.inject('/api/v1/documents')).statusCode).toBe(401);
    expect((await send('GET', '/policy', undefined, admin)).statusCode).toBe(403);
  });
  it('persists quarantined records without private object keys or payload hashes in responses', async () => {
    const row = await create();
    expect(row.status).toBe('QUARANTINED');
    for (const response of [
      row,
      (await send('GET', '/' + row.id)).json(),
      (await send('GET', '')).json(),
    ])
      expect(JSON.stringify(response)).not.toMatch(
        /quarantineKey|cleanKey|payloadHash|quarantine\//,
      );
    expect((await send('POST', '/' + row.id + '/grant', {})).statusCode).toBe(409);
  });
  it('replays identical upload keys without duplicate bytes, versions, or audit effects', async () => {
    const body = meta(),
      a = await create(body),
      b = await create(body);
    expect(a.id).toBe(b.id);
    expect(objects.size).toBe(1);
    expect(await prisma.document.count({ where: { seriesId: a.seriesId } })).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { entityId: a.id, action: 'DOCUMENT_UPLOAD' } }),
    ).toBe(1);
    expect((await upload({ ...body, title: 'Changed' })).statusCode).toBe(409);
  });
  it('serializes concurrent upload replay keys', async () => {
    const body = meta();
    const responses = await Promise.all([upload(body), upload(body)]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(202);
    expect(responses[0].json().id).toBe(responses[1].json().id);
    documentIds.add(responses[0].json().id);
    expect(objects.size).toBe(1);
  });
  it('preserves immutable earlier versions and only permits author replacement', async () => {
    const a = await create(),
      b = await create(meta({ seriesId: a.seriesId, title: 'Second version' }));
    expect(b.version).toBe(2);
    expect(a.sourceHash).toBe(b.sourceHash);
    expect((await send('GET', '?seriesId=' + a.seriesId)).json().total).toBe(2);
    expect((await upload(meta({ seriesId: a.seriesId }), manager)).statusCode).toBe(404);
  });
  it('blocks cross-manager targets and tenant property uploads before storage', async () => {
    for (const [purpose, targetId] of [
      ['LANDLORD_DOCUMENT', landlordId],
      ['PROPERTY_DOCUMENT', unitId],
      ['CONSENT', unitId],
      ['SPACE_PHOTO', roomId],
    ] as const) {
      expect((await upload(meta({ purpose, targetId }), foreign)).statusCode).toBe(404);
      expect((await upload(meta({ purpose, targetId }), tenant)).statusCode).toBe(404);
    }
    expect(objects.size).toBe(0);
  });
  it('stores landlord documents, property documents, consent, and three photo scopes', async () => {
    for (const [purpose, targetId] of [
      ['LANDLORD_DOCUMENT', landlordId],
      ['PROPERTY_DOCUMENT', unitId],
      ['CONSENT', unitId],
      ['UNIT_PHOTO', unitId],
      ['COMMON_PHOTO', unitId],
      ['SPACE_PHOTO', roomId],
    ] as const) {
      const row = await create(meta({ purpose, targetId }), manager);
      expect(
        (
          await send('GET', '?purpose=' + purpose + '&targetId=' + targetId, undefined, manager)
        ).json().items[0].id,
      ).toBe(row.id);
    }
  });
  it('permits private identity uploads from restricted setup sessions without business access', async () => {
    await prisma.user.update({ where: { id: tenant.id }, data: { status: 'PENDING_APPROVAL' } });
    try {
      const setup = { ...tenant, onboarding: true as const };
      const response = await upload(meta(), setup);
      expect(response.statusCode, response.body).toBe(202);
      documentIds.add(response.json().id);
      expect((await send('GET', '/' + response.json().id, undefined, setup)).statusCode).toBe(200);
      expect(
        (await upload(meta({ purpose: 'CASE_EVIDENCE', targetId: requestId }), setup)).statusCode,
      ).toBe(403);
      expect((await send('GET', '/' + response.json().id, undefined, tenant)).statusCode).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } });
    }
  });
  it('keeps tenant identity files private even from their manager', async () => {
    const row = await create();
    await clean();
    for (const actor of [manager, foreign]) {
      expect((await send('GET', '/' + row.id, undefined, actor)).statusCode).toBe(404);
      expect((await send('POST', '/' + row.id + '/grant', {}, actor)).statusCode).toBe(404);
      expect(
        (await send('POST', '/' + row.id + '/retry', { expectedRetryCount: 0 }, actor)).statusCode,
      ).toBe(404);
      expect((await send('GET', '', undefined, actor)).json().total).toBe(0);
    }
  });
  it('sanitizes scanned images, verifies hashes, and audits each private download', async () => {
    const row = await create();
    await clean();
    const response = await download(row.id);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-document-sha256']).toBe(fileDigest(response.rawPayload));
    expect((await sharp(response.rawPayload).metadata()).exif).toBeUndefined();
    expect(
      await prisma.auditEvent.count({ where: { entityId: row.id, action: 'DOCUMENT_DOWNLOAD' } }),
    ).toBe(1);
  });
  it('rejects malware and never releases or rescans a rejected file', async () => {
    const row = await create();
    await runFileWorkerOnce(storage, async () => 'REJECTED');
    expect((await send('GET', '/' + row.id)).json()).toMatchObject({
      status: 'REJECTED',
      failureCode: 'MALWARE_DETECTED',
    });
    expect((await send('POST', '/' + row.id + '/grant', {})).statusCode).toBe(409);
    expect(
      (await send('POST', '/' + row.id + '/retry', { expectedRetryCount: 0 })).statusCode,
    ).toBe(409);
    expect(objects.size).toBe(1);
  });
  it('retries scanner outages with bounded attempts and explicit recovery', async () => {
    const row = await create();
    const unavailable = async (): Promise<'CLEAN'> => {
      throw new Error('private scanner error');
    };
    const now = Date.now();
    for (let i = 0; i < 3; i++)
      await runFileWorkerOnce(storage, unavailable, new Date(now + i * 120000));
    const failed = (await send('GET', '/' + row.id)).json();
    expect(failed).toMatchObject({
      status: 'FAILED',
      failureCode: 'SCAN_UNAVAILABLE',
      attempts: 3,
    });
    expect(JSON.stringify(failed)).not.toContain('private scanner error');
    expect(
      (await send('POST', '/' + row.id + '/retry', { expectedRetryCount: 0 })).statusCode,
    ).toBe(200);
    expect(
      (await send('POST', '/' + row.id + '/retry', { expectedRetryCount: 0 })).statusCode,
    ).toBe(200);
    await clean();
    expect((await send('GET', '/' + row.id)).json().status).toBe('CLEAN');
  });
  it('serializes worker claims across replicas without duplicate clean writes', async () => {
    const row = await create();
    const scanner = vi.fn(async () => 'CLEAN' as const);
    await Promise.all([runFileWorkerOnce(storage, scanner), runFileWorkerOnce(storage, scanner)]);
    expect((await send('GET', '/' + row.id)).json().attempts).toBe(1);
    expect(scanner).toHaveBeenCalledTimes(2);
    expect(objects.size).toBe(2);
  });
  it('recovers abandoned worker leases after restart', async () => {
    const row = await create();
    await prisma.document.update({
      where: { id: row.id },
      data: {
        status: 'SCANNING',
        attempts: 1,
        leaseToken: 'abandoned',
        leaseExpiresAt: new Date(Date.now() - 1000),
      },
    });
    await clean();
    expect((await send('GET', '/' + row.id)).json()).toMatchObject({
      status: 'CLEAN',
      attempts: 2,
    });
  });
  it('rejects a changed source object and corrupt clean object before download', async () => {
    const row = await create();
    const original = await prisma.document.findUniqueOrThrow({ where: { id: row.id } });
    objects.set(original.quarantineKey, Buffer.from('corrupt'));
    await clean();
    expect((await send('GET', '/' + row.id)).json().failureCode).toBe('SOURCE_INTEGRITY');
    const other = await create();
    await clean();
    const saved = await prisma.document.findUniqueOrThrow({ where: { id: other.id } });
    objects.set(saved.cleanKey!, Buffer.from('corrupt'));
    expect((await download(other.id)).statusCode).toBe(409);
  });
  it('enforces expiry and binds download grants to a live account session', async () => {
    const row = await create();
    await clean();
    const grant = (await send('POST', '/' + row.id + '/grant', {})).json();
    expect(
      (
        await send('GET', '/' + row.id + '/file', undefined, manager, {
          'x-file-grant': grant.token,
        })
      ).statusCode,
    ).toBe(404);
    await prisma.document.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await send('GET', '/' + row.id)).json().availability).toBe('EXPIRED');
    expect(
      (
        await send('GET', '/' + row.id + '/file', undefined, tenant, {
          'x-file-grant': grant.token,
        })
      ).statusCode,
    ).toBe(403);
    expect((await send('POST', '/' + row.id + '/grant', {})).statusCode).toBe(409);
  });
  it('rejects forged grants without storage access', async () => {
    const row = await create();
    await clean();
    vi.mocked(storage.get).mockClear();
    expect(
      (await send('GET', '/' + row.id + '/file', undefined, tenant, { 'x-file-grant': 'forged' }))
        .statusCode,
    ).toBe(403);
    expect(storage.get).not.toHaveBeenCalled();
  });
  it('links case evidence to immutable author events and transactional participant notices', async () => {
    const row = await create(meta({ purpose: 'CASE_EVIDENCE', targetId: requestId }));
    expect((await send('GET', '/' + row.id, undefined, manager)).statusCode).toBe(200);
    expect((await send('GET', '/' + row.id, undefined, foreign)).statusCode).toBe(404);
    const event = await prisma.requestEvent.findFirstOrThrow({
      where: { requestId, kind: 'EVIDENCE_ADDED' },
    });
    expect(event.actorUserId).toBe(tenant.id);
    expect(event.actorName).toBe('Document Tenant');
    expect(event.metadata).toMatchObject({ documentId: row.id, sourceHash: row.sourceHash });
    expect(await prisma.notification.count({ where: { eventId: event.id } })).toBe(2);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).version).toBe(2);
  });
  it('keeps draft attachments private until the tenant submits the case', async () => {
    await prisma.request.update({ where: { id: requestId }, data: { status: 'DRAFT' } });
    const row = await create(meta({ purpose: 'CASE_EVIDENCE', targetId: requestId }));
    expect((await send('GET', '/' + row.id, undefined, manager)).statusCode).toBe(404);
    expect(await prisma.notification.count({ where: { event: { requestId } } })).toBe(0);
    await prisma.request.update({ where: { id: requestId }, data: { status: 'SUBMITTED' } });
    expect((await send('GET', '/' + row.id, undefined, manager)).statusCode).toBe(200);
  });
  it('rejects MIME spoofing, unsafe filenames, excessive uploads, and arbitrary metadata', async () => {
    expect((await upload(meta(), tenant, png, 'application/pdf')).statusCode).toBe(415);
    expect((await upload(meta(), tenant, png, 'image/png', 'evil.php.png')).statusCode).toBe(415);
    expect(
      (await upload(meta(), tenant, Buffer.alloc(fileConfig.FILE_MAX_BYTES + 1))).statusCode,
    ).toBe(413);
    expect((await upload({ ...meta(), managerId: foreign.id } as FileMetadata)).statusCode).toBe(
      422,
    );
    expect(objects.size).toBe(0);
  });
  it('enforces a private document version bound and preserves all earlier records', async () => {
    const first = await create();
    for (let version = 2; version <= 20; version++) {
      // Direct fixture insertion verifies the route boundary without an artificial rate-limit exemption.
      await prisma.document.create({
        data: {
          seriesId: first.seriesId,
          version,
          uploaderUserId: tenant.id,
          clientId: randomUUID(),
          payloadHash: 'a'.repeat(64),
          title: 'Prior version',
          originalName: 'old.png',
          mimeType: 'image/png',
          originalSize: png.length,
          sourceHash: fileDigest(png),
          quarantineKey: randomUUID(),
          status: 'CLEAN',
        },
      });
    }
    expect((await upload(meta({ seriesId: first.seriesId }))).statusCode).toBe(409);
    expect(await prisma.document.count({ where: { seriesId: first.seriesId } })).toBe(20);
  });
  it('rejects expired sessions and account suspension across uploads and downloads', async () => {
    const row = await create();
    await clean();
    await prisma.user.update({ where: { id: tenant.id }, data: { status: 'SUSPENDED' } });
    try {
      expect((await send('GET', '/' + row.id)).statusCode).toBe(401);
      expect((await upload()).statusCode).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } });
    }
  });
  it('uses stable pagination and rejects unknown filters', async () => {
    await create();
    expect((await send('GET', '?page=1&purpose=IDENTITY&targetId=self')).json()).toMatchObject({
      total: 1,
      pageSize: 20,
      page: 1,
    });
    expect((await send('GET', '?page=0')).statusCode).toBe(422);
    expect((await send('GET', '?ownerUserId=' + foreign.id)).statusCode).toBe(422);
  });
});
