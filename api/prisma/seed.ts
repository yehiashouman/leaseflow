import argon2 from 'argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const demo = process.env.DEMO_MODE?.trim().toLowerCase() === 'true';
if (demo && process.env.NODE_ENV === 'production')
  throw new Error('DEMO_MODE=true is forbidden in production.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
async function main() {
  if (!demo) {
    console.log('Demo mode disabled; no account seed.');
    return;
  }
  const email = z
    .email()
    .max(191)
    .parse(process.env.DEMO_ADMIN_EMAIL ?? 'admin@leaseflow.local')
    .toLowerCase();
  const password = z
    .string()
    .min(12)
    .max(128)
    .parse(process.env.DEMO_ADMIN_PASSWORD ?? 'Admin123456!');
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { role: true, status: true },
  });
  if (existing) {
    if (existing.role !== 'ADMIN' || existing.status !== 'ACTIVE')
      throw new Error(
        'Demo identity already exists with another role or status; no changes applied.',
      );
    console.log('Existing demo administrator preserved.');
    return;
  }
  await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log('Non-production demo administrator created.');
}
main()
  .catch(() => {
    console.error('Demo seed failed; no credential values are logged.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
