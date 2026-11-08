import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { env } from './config.js';

const adapter = new PrismaMariaDb(env.DATABASE_URL);
export const prisma = new PrismaClient({
  adapter,
  // Application handlers log safe request identifiers without SQL values.
  log: [],
});
