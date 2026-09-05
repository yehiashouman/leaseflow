import argon2 from 'argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run the seed script.');

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const DEMO_MODE = (process.env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';

if (DEMO_MODE && NODE_ENV === 'production') {
  throw new Error('Refusing to seed: DEMO_MODE=true is not allowed when NODE_ENV=production.');
}

const DEMO_ADMIN_EMAIL = 'admin@leaseflow.local';
const DEMO_ADMIN_PASSWORD = 'Admin123456!';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  // DEMO_MODE seeds a fixed, well-known administrator so the environment is
  // usable immediately in Codespaces/local demos, without any manual steps.
  const email = (DEMO_MODE ? DEMO_ADMIN_EMAIL : process.env.ADMIN_EMAIL?.trim().toLowerCase()) || undefined;
  const password = DEMO_MODE ? DEMO_ADMIN_PASSWORD : process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD (or DEMO_MODE) are not set; skipping administrator seed.');
    return;
  }
  if (password.length < 12) throw new Error('Administrator password must contain at least 12 characters.');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const now = new Date();
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', status: 'ACTIVE', emailVerifiedAt: now, phoneVerifiedAt: now },
    create: {
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: now,
      phoneVerifiedAt: now,
    },
  });
  // Never print the password or its hash; only confirm the account is ready.
  console.log(`Administrator ready: ${email}`);
  if (DEMO_MODE) console.log('DEMO_MODE is enabled: demo credentials are documented in README.md.');
}

main()
  .catch((error) => {
    console.error('Administrator seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

