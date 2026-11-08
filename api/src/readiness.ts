import { existsSync, readdirSync } from 'node:fs';
import { prisma } from './db.js';

const directories = [
  new URL('../prisma/migrations/', import.meta.url),
  new URL('../../prisma/migrations/', import.meta.url),
];
const directory = directories.find((path) => existsSync(path));
if (!directory) throw new Error('Required migration files are absent.');
export const requiredMigrations = readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
export async function databaseReady() {
  const rows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >`
    SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
  `;
  const active = rows.filter((row) => !row.rolled_back_at);
  return (
    active.every((row) => row.finished_at) &&
    requiredMigrations.every((name) =>
      active.some((row) => row.migration_name === name && row.finished_at),
    )
  );
}
