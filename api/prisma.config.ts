import { defineConfig, env } from 'prisma/config';

const url = process.env.MIGRATION_DATABASE_URL || env('DATABASE_URL');
const target = URL.parse(url);
if (!target || target.protocol !== 'mysql:' || !target.hostname || target.pathname.length <= 1)
  throw new Error('The migration connection requires a MySQL URL with a database name.');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
  },
});
