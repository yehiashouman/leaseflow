import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
