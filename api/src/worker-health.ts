import { hostname } from 'node:os';
import { prisma } from './db.js';
try {
  const row = await prisma.businessWorkerHeartbeat.findUnique({ where: { id: hostname() } });
  if (
    !row ||
    !['ACTIVE', 'DEGRADED'].includes(row.state) ||
    Date.now() - row.lastSeenAt.getTime() > 30000
  )
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
