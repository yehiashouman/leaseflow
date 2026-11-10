import type { Prisma } from '@prisma/client';
export async function businessHealth(
  db: Pick<Prisma.TransactionClient, 'businessWorkerHeartbeat'>,
  now = new Date(),
) {
  const rows = await db.businessWorkerHeartbeat.findMany({
    select: { state: true, redisConnected: true, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 100,
  });
  const active = rows.filter(
    (row) => row.state !== 'STOPPED' && now.getTime() - row.lastSeenAt.getTime() <= 30000,
  );
  return {
    observedAt: now.toISOString(),
    recorded: rows.length,
    active: active.length,
    redisDegraded: active.filter((row) => !row.redisConnected).length,
    stale: rows.filter(
      (row) => row.state !== 'STOPPED' && now.getTime() - row.lastSeenAt.getTime() > 30000,
    ).length,
    stopped: rows.filter((row) => row.state === 'STOPPED').length,
    limit: 100,
  };
}
