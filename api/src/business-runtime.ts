import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { Redis } from 'ioredis';
import { env } from './config.js';
import { businessConfig } from './business-config.js';
import {
  materializeBusinessJobs,
  materializeRoomExpiryJobs,
  runBusinessJobOnce,
} from './business-jobs.js';
export function businessRuntime(onError: () => void, instanceId: string = randomUUID()) {
  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  };
  const publisher = new Redis(env.REDIS_URL, options),
    subscriber = new Redis(env.REDIS_URL, options);
  publisher.on('error', onError);
  subscriber.on('error', onError);
  const channel = businessConfig.BUSINESS_REDIS_PREFIX + ':wake';
  const checkpoint = businessConfig.BUSINESS_REDIS_PREFIX + ':contract-scan';
  let timer: ReturnType<typeof setInterval> | undefined,
    schedule: ReturnType<typeof setInterval> | undefined;
  let work: Promise<void> | undefined,
    sweep: Promise<void> | undefined,
    cursor = '',
    requestCursor = '',
    stopped = false;
  function drain() {
    if (work || stopped) return;
    work = (async () => {
      for (let count = 0; count < 20 && !stopped; count++) if (!(await runBusinessJobOnce())) break;
    })()
      .catch(onError)
      .finally(() => {
        work = undefined;
      });
  }
  function scan() {
    if (sweep || stopped) return;
    sweep = (async () => {
      try {
        cursor = (await publisher.get(checkpoint)) ?? cursor;
      } catch {
        onError();
      }
      await prisma.businessWorkerHeartbeat.upsert({
        where: { id: instanceId },
        create: {
          id: instanceId,
          state: publisher.status === 'ready' ? 'ACTIVE' : 'DEGRADED',
          redisConnected: publisher.status === 'ready',
          lastSeenAt: new Date(),
        },
        update: {
          state: publisher.status === 'ready' ? 'ACTIVE' : 'DEGRADED',
          redisConnected: publisher.status === 'ready',
          lastSeenAt: new Date(),
        },
      });
      cursor = await materializeBusinessJobs(cursor);
      requestCursor = await materializeRoomExpiryJobs(requestCursor);
      try {
        await publisher.set(checkpoint, cursor, 'EX', 600);
        await publisher.publish(channel, 'wake');
      } catch {
        onError();
      }
      drain();
    })()
      .catch(onError)
      .finally(() => {
        sweep = undefined;
      });
  }
  subscriber.on('ready', () => {
    void subscriber.subscribe(channel).catch(onError);
  });
  subscriber.on('message', (name) => {
    if (name === channel) drain();
  });
  return {
    async start() {
      stopped = false;
      if (timer) return;
      void publisher.connect().catch(onError);
      void subscriber.connect().catch(onError);
      timer = setInterval(drain, 1000);
      schedule = setInterval(scan, 5000);
      timer.unref();
      schedule.unref();
      scan();
      drain();
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (schedule) clearInterval(schedule);
      timer = undefined;
      schedule = undefined;
      await sweep;
      await work;
      await prisma.businessWorkerHeartbeat
        .updateMany({
          where: { id: instanceId },
          data: { state: 'STOPPED', lastSeenAt: new Date() },
        })
        .catch(onError);
      publisher.disconnect();
      subscriber.disconnect();
    },
  };
}
