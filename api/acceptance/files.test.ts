import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { privateStorage } from '../src/file-storage.js';
import { scanFile } from '../src/file-scanner.js';
import { fileConfig, fileDigest } from '../src/file-policy.js';
import { runFileWorkerOnce } from '../src/file-worker.js';
import { prisma } from '../src/db.js';
import type { FastifyInstance } from 'fastify';
describe('real private S3 storage and ClamAV acceptance', () => {
  let app: FastifyInstance, userId: string, sid: string;
  const ids: string[] = [];
  beforeAll(async () => {
    if (
      process.env.FILE_SERVICE_TESTS !== 'true' ||
      !new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')
    )
      throw new Error(
        'Private file acceptance requires isolated real services and a _test database',
      );
    await privateStorage.verify();
    app = await buildApp();
    await app.ready();
    const user = await prisma.user.create({
      data: {
        email: randomUUID() + '@file-acceptance.invalid',
        passwordHash: 'no-login',
        role: 'TENANT',
        status: 'ACTIVE',
        tenant: {
          create: {
            fullName: 'File Acceptance Tenant',
            manager: {
              create: {
                fullName: 'File Acceptance Manager',
                user: {
                  create: {
                    email: randomUUID() + '@file-manager.invalid',
                    role: 'LEASING_MANAGER',
                    status: 'ACTIVE',
                    passwordHash: 'no-login',
                  },
                },
              },
            },
          },
        },
      },
    });
    userId = user.id;
    const session = await prisma.authSession.create({
      data: { userId, expiresAt: new Date(Date.now() + 3600000) },
    });
    sid = session.id;
  });
  afterAll(async () => {
    if (userId) {
      const tenant = await prisma.tenantProfile.findUniqueOrThrow({
        where: { userId },
        include: { manager: true },
      });
      await prisma.document.deleteMany({ where: { uploaderUserId: userId } });
      await prisma.documentSeries.deleteMany({ where: { ownerUserId: userId } });
      await prisma.auditEvent.deleteMany({
        where: { OR: [{ actorUserId: userId }, { entityId: { in: ids } }] },
      });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.tenantProfile.delete({ where: { userId } });
      await prisma.leasingManagerProfile.delete({ where: { id: tenant.managerId } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, tenant.manager.userId] } } });
    }
    await app?.close();
  });
  const authorization = () => 'Bearer ' + app.jwt.sign({ sub: userId, role: 'TENANT', sid });
  it('accepts a clean stream and rejects the standard EICAR test stream through real ClamAV', async () => {
    expect(await scanFile(Buffer.from('A clean factual record.'))).toBe('CLEAN');
    // EICAR is the harmless industry antivirus test string.
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    expect(await scanFile(Buffer.from(eicar))).toBe('REJECTED');
  });
  it('quarantines a real S3 upload, blocks anonymous access, scans and sanitizes, and serves an authorized hash-verified download', async () => {
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 3, background: '#99aabb' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'Private metadata' } } })
      .png()
      .toBuffer();
    const boundary = randomUUID(),
      metadata = {
        purpose: 'IDENTITY',
        targetId: 'self',
        clientId: randomUUID(),
        title: 'Acceptance identity',
        expiresAt: null,
      };
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidence.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload,
      headers: {
        authorization: authorization(),
        'content-type': 'multipart/form-data; boundary=' + boundary,
      },
    });
    expect(response.statusCode, response.body).toBe(202);
    const id = response.json().id;
    ids.push(id);
    const record = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(record.status).toBe('QUARANTINED');
    const anonymous = await fetch(
      fileConfig.S3_ENDPOINT + '/' + fileConfig.S3_BUCKET + '/' + record.quarantineKey,
    );
    expect([401, 403]).toContain(anonymous.status);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/documents/' + id + '/grant',
          payload: {},
          headers: { authorization: authorization() },
        })
      ).statusCode,
    ).toBe(409);
    await runFileWorkerOnce();
    const clean = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(clean.status).toBe('CLEAN');
    expect(await privateStorage.get(record.quarantineKey)).toEqual(bytes);
    expect(
      (await fetch(fileConfig.S3_ENDPOINT + '/' + fileConfig.S3_BUCKET + '/' + clean.cleanKey))
        .status,
    ).toBe(403);
    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/' + id + '/grant',
      payload: {},
      headers: { authorization: authorization() },
    });
    const download = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/' + id + '/file',
      headers: { authorization: authorization(), 'x-file-grant': grant.json().token },
    });
    expect(download.statusCode, download.body).toBe(200);
    expect(fileDigest(download.rawPayload)).toBe(clean.fileHash);
    expect((await sharp(download.rawPayload).metadata()).exif).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/documents/' + id + '/file',
          headers: { authorization: authorization(), 'x-file-grant': 'forged' },
        })
      ).statusCode,
    ).toBe(403);
  });
});
