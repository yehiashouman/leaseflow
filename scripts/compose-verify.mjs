import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { localEnvironment, startLocal } from './local.mjs';

const project = process.env.COMPOSE_PROJECT_NAME;
if (!project || !/^leaseflow-ci-[a-z0-9-]+$/.test(project))
  throw new Error('Compose verification requires an isolated leaseflow-ci project.');
const demoPassword = 'Aa1!' + randomBytes(16).toString('hex');
const changedPassword = 'Bb2!' + randomBytes(16).toString('hex');
process.env.DEMO_ADMIN_PASSWORD = demoPassword;
let environment;
function docker(args) {
  const result = spawnSync('docker', args, {
    env: environment ?? process.env,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    throw new Error('Compose verification command failed: ' + args.slice(0, 3).join(' '));
  return result.stdout.trim();
}
const compose = (args) => docker(['compose', ...args]);
const base = 'http://127.0.0.1:' + (process.env.WEB_PORT ?? '8080');
async function request(path, options = {}) {
  return fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
}
async function login(password) {
  const response = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Leaseflow-Session': '1' },
    body: JSON.stringify({ email: 'admin@leaseflow.local', password }),
  });
  assert.equal(response.status, 200, 'Login through the web proxy must succeed');
  return { body: await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] };
}
try {
  await startLocal(['up']);
  environment = localEnvironment(undefined, process.env, false);
  const initialRoot = readFileSync('.env', 'utf8'),
    initialApi = readFileSync('api/.env', 'utf8');
  const settings = parseEnv(initialRoot);
  const userCount = () =>
    compose([
      'exec',
      '-T',
      '-e',
      'MYSQL_PWD=' + settings.MYSQL_ROOT_PASSWORD,
      'mysql',
      'mysql',
      '-u',
      'root',
      '-N',
      '-B',
      settings.MYSQL_DATABASE,
      '-e',
      'SELECT COUNT(*) FROM User',
    ]);
  assert.equal(userCount(), '0', 'Normal startup must not create demo accounts');
  const index = await request('/');
  assert.equal(index.status, 200);
  assert((await index.text()).includes('id="root"'));
  const config = JSON.parse(compose(['config', '--format', 'json']));
  for (const name of ['mysql', 'redis', 'minio', 'api', 'worker'])
    assert(!config.services[name].ports?.length, name + ' ports must remain private');
  assert.equal(config.services.web.ports.length, 1);
  const denied = await request('/api/v1/auth/me');
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).code, 'UNAUTHORIZED');
  const absent = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Leaseflow-Session': '1' },
    body: JSON.stringify({ email: 'admin@leaseflow.local', password: demoPassword }),
  });
  assert.equal(absent.status, 401);
  await startLocal(['up', '--demo']);
  environment = localEnvironment(undefined, process.env, true);
  assert.equal(readFileSync('.env', 'utf8'), initialRoot);
  assert.equal(readFileSync('api/.env', 'utf8'), initialApi);
  const session = await login(demoPassword);
  assert.equal(
    (
      await request('/api/v1/dashboard/admin', {
        headers: { Authorization: 'Bearer ' + session.body.accessToken },
      })
    ).status,
    200,
  );
  const changed = await request('/api/v1/auth/password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Leaseflow-Session': '1',
      Authorization: 'Bearer ' + session.body.accessToken,
    },
    body: JSON.stringify({ currentPassword: demoPassword, newPassword: changedPassword }),
  });
  assert.equal(changed.status, 204);
  const volumes = ['mysql-data', 'redis-data', 'minio-data'].map((name) => project + '_' + name);
  const before = volumes.map(
    (name) => JSON.parse(docker(['volume', 'inspect', name]))[0].CreatedAt,
  );
  docker([
    'run',
    '--rm',
    '-v',
    volumes[2] + ':/data',
    'node:22.19.0-alpine',
    'node',
    '-e',
    'require("fs").writeFileSync("/data/leaseflow-persistence-probe","preserved")',
  ]);
  compose(['down']);
  await startLocal(['up', '--demo']);
  environment = localEnvironment(undefined, process.env, true);
  const restored = await login(changedPassword);
  assert.equal(
    restored.body.userId,
    session.body.userId,
    'Startup must preserve administrator identity and changed password',
  );
  assert.deepEqual(
    volumes.map((name) => JSON.parse(docker(['volume', 'inspect', name]))[0].CreatedAt),
    before,
  );
  assert.equal(
    docker([
      'run',
      '--rm',
      '-v',
      volumes[2] + ':/data',
      'node:22.19.0-alpine',
      'node',
      '-e',
      'process.stdout.write(require("fs").readFileSync("/data/leaseflow-persistence-probe","utf8"))',
    ]),
    'preserved',
  );
  const csrf = await request('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { Cookie: restored.cookie },
  });
  assert.equal(csrf.status, 403);
  const refresh = await request('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { Cookie: restored.cookie, 'X-Leaseflow-Session': '1' },
  });
  assert.equal(refresh.status, 200);
  for (let index = 0; index < 6; index++) {
    const attempt = await request('/api/v1/auth/register/manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.' + index },
      body: '{}',
    });
    assert.equal(
      attempt.status,
      index < 5 ? 422 : 429,
      'Forged proxy headers must not bypass abuse controls',
    );
  }
  console.log(
    'PASS: fresh startup, disabled default demo, explicit demo, web proxy login, password-preserving restart, private ports, persistent volumes, refresh, CSRF, and proxy abuse controls.',
  );
} finally {
  environment ??= localEnvironment(undefined, process.env, false);
  compose(['down', '--volumes', '--remove-orphans']);
}
