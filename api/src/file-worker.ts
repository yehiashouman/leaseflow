import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { fileConfig, fileDigest, sanitizeFile, UnsafeFile } from './file-policy.js';
import { privateStorage, type PrivateStorage } from './file-storage.js';
import { scanFile, type FileScanner } from './file-scanner.js';

export async function runFileWorkerOnce(
  storage: PrivateStorage = privateStorage,
  scanner: FileScanner = scanFile,
  now = new Date(),
) {
  const job = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM Document WHERE (status = 'QUARANTINED' AND nextAttemptAt <= ${now})
      OR (status = 'SCANNING' AND leaseExpiresAt <= ${now})
      ORDER BY createdAt, id LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
      if (!rows[0]) return null;
      const row = await tx.document.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (row.attempts >= 3) {
        await tx.document.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failureCode: 'SCAN_INTERRUPTED',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        return null;
      }
      return tx.document.update({
        where: { id: row.id },
        data: {
          status: 'SCANNING',
          attempts: { increment: 1 },
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 120000),
          failureCode: null,
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
  if (!job) return false;
  const where = { id: job.id, status: 'SCANNING' as const, leaseToken: job.leaseToken };
  try {
    const original = await storage.get(job.quarantineKey);
    if (fileDigest(original) !== job.sourceHash || original.length !== job.originalSize)
      throw new UnsafeFile('SOURCE_INTEGRITY');
    if ((await scanner(original)) !== 'CLEAN') throw new UnsafeFile('MALWARE_DETECTED');
    const clean = await sanitizeFile(original, job.mimeType);
    if (clean.length > fileConfig.FILE_MAX_BYTES * 3) throw new UnsafeFile('OUTPUT_SIZE');
    if ((await scanner(clean)) !== 'CLEAN') throw new UnsafeFile('MALWARE_DETECTED');
    // Each lease gets a new immutable object, so an interrupted worker cannot replace accepted bytes.
    const cleanKey = 'clean/' + job.id + '/' + job.leaseToken;
    await storage.put(cleanKey, clean, job.mimeType);
    await prisma.$transaction(async (tx) => {
      const changed = await tx.document.updateMany({
        where,
        data: {
          status: 'CLEAN',
          cleanKey,
          fileHash: fileDigest(clean),
          fileSize: clean.length,
          scannedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (changed.count)
        await tx.auditEvent.create({
          data: {
            action: 'DOCUMENT_SCAN_CLEAN',
            entityType: 'Document',
            entityId: job.id,
            newValue: { fileHash: fileDigest(clean), sourceHash: job.sourceHash },
          },
        });
    });
  } catch (cause) {
    const terminal = cause instanceof UnsafeFile;
    const status = terminal ? 'REJECTED' : job.attempts >= 3 ? 'FAILED' : 'QUARANTINED';
    await prisma.$transaction(async (tx) => {
      const changed = await tx.document.updateMany({
        where,
        data: {
          status,
          failureCode: terminal ? cause.code : 'SCAN_UNAVAILABLE',
          nextAttemptAt: new Date(now.getTime() + job.attempts * 30000),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (changed.count)
        await tx.auditEvent.create({
          data: {
            action: 'DOCUMENT_SCAN_' + status,
            entityType: 'Document',
            entityId: job.id,
            newValue: {
              failureCode: terminal ? cause.code : 'SCAN_UNAVAILABLE',
              attempt: job.attempts,
            },
          },
        });
    });
  }
  return true;
}
export function fileWorker(onError: () => void) {
  let timer: ReturnType<typeof setInterval> | undefined, current: Promise<unknown> | undefined;
  const tick = () => {
    if (current) return;
    current = runFileWorkerOnce()
      .catch(onError)
      .finally(() => {
        current = undefined;
      });
  };
  return {
    start() {
      if (!timer && fileConfig.FILES_ENABLED === 'true') {
        timer = setInterval(tick, 2000);
        timer.unref();
        tick();
      }
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await current;
    },
  };
}
