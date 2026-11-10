import { hostname } from 'node:os';
import { prisma } from './db.js';
import { databaseReady } from './readiness.js';
import { businessRuntime } from './business-runtime.js';
import { businessConfig } from './business-config.js';
async function main() {
  if (businessConfig.BUSINESS_JOBS_ENABLED !== 'true')
    throw new Error('Explicit BUSINESS_JOBS_ENABLED=true is required.');
  if (!(await databaseReady())) throw new Error('Required database migrations are incomplete.');
  const runtime = businessRuntime(
    () =>
      process.stderr.write('Business worker dependency failure; durable state remains in MySQL.\n'),
    hostname(),
  );
  await runtime.start();
  // Keep the standalone process alive; job timers remain independently stoppable.
  const keepAlive = setInterval(() => {}, 60000);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(keepAlive);
    await runtime.stop();
    await prisma.$disconnect();
  }
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
}
void main().catch(async () => {
  process.stderr.write(
    'Business worker startup failed; verify configuration and database readiness.\n',
  );
  process.exitCode = 1;
  await prisma.$disconnect();
});
