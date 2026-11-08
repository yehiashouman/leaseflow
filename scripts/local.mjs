import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

export const resetConfirmation = '--confirm=DELETE_LEASEFLOW_DEMO_DATA';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secret = () => randomBytes(32).toString('hex');
export function ensureEnvironment(directory = root) {
  for (const name of ['.env', 'api/.env']) {
    const target = resolve(directory, name);
    if (existsSync(target)) continue;
    const values = parseEnv(readFileSync(target + '.example', 'utf8'));
    const keys =
      name === '.env'
        ? ['MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_PASSWORD']
        : ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
    for (const key of keys) values[key] = secret();
    values.DEMO_MODE = 'false';
    try {
      writeFileSync(
        target,
        Object.entries(values)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join('\n') + '\n',
        { flag: 'wx', mode: 0o600 },
      );
    } catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;
    }
  }
}
export function localEnvironment(directory = root, input = process.env, demo = false) {
  const read = (name) =>
    parseEnv(
      readFileSync(
        resolve(directory, existsSync(resolve(directory, name)) ? name : name + '.example'),
        'utf8',
      ),
    );
  const values = read('.env'),
    api = read('api/.env');
  if ([input.NODE_ENV, values.NODE_ENV, api.NODE_ENV].includes('production'))
    throw new Error('Local setup and reset refuse production environments.');
  const connection = new URL('mysql://mysql:3306/');
  connection.username = values.MYSQL_USER ?? 'leaseflow';
  connection.password = values.MYSQL_PASSWORD ?? '';
  connection.pathname = '/' + (values.MYSQL_DATABASE ?? 'leaseflow');
  return {
    ...input,
    COMPOSE_PROJECT_NAME: input.COMPOSE_PROJECT_NAME ?? values.COMPOSE_PROJECT_NAME ?? 'leaseflow',
    NODE_ENV: input.NODE_ENV ?? values.NODE_ENV ?? api.NODE_ENV ?? 'development',
    DEMO_MODE: String(demo),
    MYSQL_CONNECTION_URL: connection.href,
  };
}
export async function startLocal(args = process.argv.slice(2), directory = root, run) {
  const [action = 'up', ...flags] = args;
  if (
    !['init', 'up', 'reset'].includes(action) ||
    flags.some((flag) => !['--demo', resetConfirmation].includes(flag))
  )
    throw new Error('Use init, up [--demo], or reset --demo ' + resetConfirmation);
  if (action === 'reset' && (!flags.includes(resetConfirmation) || !flags.includes('--demo')))
    throw new Error('Reset requires --demo and ' + resetConfirmation);
  const demo = flags.includes('--demo');
  localEnvironment(directory, process.env, demo);
  ensureEnvironment(directory);
  const environment = localEnvironment(directory, process.env, demo);
  if (action === 'reset' && !/^leaseflow(?:[-_][a-z0-9]+)*$/.test(environment.COMPOSE_PROJECT_NAME))
    throw new Error('Reset requires an explicit leaseflow development project name.');
  if (action === 'init') return { environment };
  const execute =
    run ??
    ((command, options) => {
      const result = spawnSync('docker', command, { ...options, stdio: 'inherit' });
      if (result.error || result.status !== 0)
        throw new Error('Docker Compose command failed; inspect the service status.');
    });
  const compose = (command) =>
    execute(['compose', ...command], { cwd: directory, env: environment });
  await compose(['config', '--quiet']);
  if (action === 'reset') await compose(['down', '--volumes', '--remove-orphans']);
  await compose([
    'up',
    '-d',
    '--build',
    '--wait',
    '--wait-timeout',
    '180',
    'mysql',
    'redis',
    'minio',
  ]);
  await compose(['run', '--rm', '--build', '--no-deps', 'migrate']);
  await compose(['run', '--rm', '--build', '--no-deps', 'demo-seed']);
  await compose(['up', '-d', '--no-deps', '--build', '--wait', '--wait-timeout', '180', 'api']);
  await compose(['up', '-d', '--no-deps', '--build', '--wait', '--wait-timeout', '120', 'web']);
  if (!run) {
    const values = parseEnv(readFileSync(resolve(directory, '.env'), 'utf8'));
    const port = environment.WEB_PORT ?? values.WEB_PORT ?? '8080';
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/me`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.status === 401 && (await response.json()).code === 'UNAUTHORIZED') {
          ready = true;
          break;
        }
      } catch {
        /* A new web container can need another readiness probe. */
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('The web-to-API proxy is not ready; startup failed.');
  }
  return { environment };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await startLocal();
    const values = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'));
    const port = process.env.WEB_PORT ?? values.WEB_PORT ?? '8080';
    const url = process.env.CODESPACE_NAME
      ? `https://${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'}`
      : `http://localhost:${port}`;
    console.log(
      process.argv[2] === 'init'
        ? 'Environment files verified; existing files remain unchanged.'
        : `Application URL: ${url}`,
    );
  } catch (cause) {
    console.error(cause.message);
    process.exitCode = 1;
  }
}
