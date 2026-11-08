import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { renderCasePdf, reportHash, ReportRenderError } from './case-report.js';

export async function runReportWorkerOnce(render = renderCasePdf) {
  const job = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM CaseReportJob
      WHERE status = 'QUEUED' OR (status = 'RUNNING' AND leaseExpiresAt < UTC_TIMESTAMP(3))
      ORDER BY createdAt, id LIMIT 1 FOR UPDATE SKIP LOCKED
    `);
      if (!rows[0]) return null;
      const row = await tx.caseReportJob.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (row.attempts >= 3) {
        await tx.caseReportJob.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failureCode: 'WORKER_INTERRUPTED',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        return null;
      }
      return tx.caseReportJob.update({
        where: { id: row.id },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 60000),
          failureCode: null,
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
  if (!job) return false;
  try {
    if (reportHash(job.snapshot) !== job.snapshotHash) throw new Error('Report integrity mismatch');
    const bytes = await render(job.snapshot, job.id, job.createdAt);
    await prisma.caseReportJob.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken },
      data: {
        status: 'COMPLETE',
        pdfBytes: new Uint8Array(bytes),
        pdfHash: createHash('sha256').update(bytes).digest('hex'),
        completedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  } catch (cause) {
    await prisma.caseReportJob.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken },
      data: {
        status: 'FAILED',
        failureCode: cause instanceof ReportRenderError ? cause.code : 'RENDER_FAILED',
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
  return true;
}
export function reportWorker(onError: (cause: unknown) => void) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let current: Promise<unknown> | undefined;
  function tick() {
    if (current) return;
    current = runReportWorkerOnce()
      .catch(onError)
      .finally(() => {
        current = undefined;
      });
  }
  return {
    start() {
      if (!timer) {
        timer = setInterval(tick, 1000);
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
