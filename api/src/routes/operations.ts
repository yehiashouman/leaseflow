import type { FastifyPluginAsync } from 'fastify';
import { allowRoles } from '../auth.js';
import { prisma } from '../db.js';

export const operationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/jobs', { preHandler: allowRoles('ADMIN') }, async () => {
    const [reports, files, emails, notices, business] = await prisma.$transaction(
      async (tx) =>
        Promise.all([
          tx.caseReportJob.groupBy({ by: ['status', 'failureCode'], _count: { _all: true } }),
          tx.document.groupBy({ by: ['status', 'failureCode'], _count: { _all: true } }),
          tx.outboundEmail.groupBy({ by: ['status', 'failureCode'], _count: { _all: true } }),
          tx.noticeDelivery.groupBy({
            by: ['channel', 'state', 'failureCode'],
            _count: { _all: true },
          }),
          tx.businessJob.groupBy({ by: ['kind', 'state', 'failureCode'], _count: { _all: true } }),
        ]),
      { isolationLevel: 'RepeatableRead' },
    );
    const summarize = (
      rows: { status: string; failureCode: string | null; _count: { _all: number } }[],
    ) =>
      rows.map((row) => ({
        status: row.status,
        failureCode: row.failureCode,
        count: row._count._all,
      }));
    return {
      observedAt: new Date().toISOString(),
      reports: summarize(reports),
      files: summarize(files),
      emails: summarize(emails),
      business: business.map((row) => ({
        status: row.kind + '_' + row.state,
        failureCode: row.failureCode,
        count: row._count._all,
      })),
      notices: notices.map((row) => ({
        status: row.channel + '_' + row.state,
        failureCode: row.failureCode,
        count: row._count._all,
      })),
      recovery:
        'Report and file owners use their authorized retry actions. Account owners request a fresh verification or recovery link. Provider delivery requires separate acceptance.',
    };
  });
};
