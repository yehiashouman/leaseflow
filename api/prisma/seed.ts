import argon2 from 'argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run the seed script.');

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('ADMIN_EMAIL and ADMIN_PASSWORD are not set; skipping administrator seed.');
    return;
  }
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
  await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email,
      passwordHash: await argon2.hash(password),
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Administrator ready: ${email}`);
}

main().finally(() => prisma.$disconnect());
