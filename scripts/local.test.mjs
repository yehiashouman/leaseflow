import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ensureEnvironment, localEnvironment, resetConfirmation, startLocal } from './local.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'leaseflow-setup-'));
  mkdirSync(join(root, 'api'));
  writeFileSync(
    join(root, '.env.example'),
    'COMPOSE_PROJECT_NAME=leaseflow-test\nNODE_ENV=development\nMYSQL_USER=leaseflow\nMYSQL_DATABASE=leaseflow\nMYSQL_PASSWORD=placeholder\n',
  );
  writeFileSync(
    join(root, 'api/.env.example'),
    'NODE_ENV=development\nJWT_ACCESS_SECRET=placeholder\nJWT_REFRESH_SECRET=placeholder\nDEMO_MODE=false\n',
  );
  return root;
}
test('environment initialization creates independent secrets, private files, and never overwrites edits', () => {
  const root = fixture();
  try {
    ensureEnvironment(root);
    const initial = readFileSync(join(root, 'api/.env'), 'utf8');
    const values = parseEnv(initial);
    assert.equal(values.JWT_ACCESS_SECRET.length, 64);
    assert.notEqual(values.JWT_ACCESS_SECRET, values.JWT_REFRESH_SECRET);
    assert.equal(values.DEMO_MODE, 'false');
    assert.equal(statSync(join(root, 'api/.env')).mode & 0o777, 0o600);
    writeFileSync(join(root, 'api/.env'), initial + 'CUSTOM_VALUE="$(not-a-shell-command)"\n');
    ensureEnvironment(root);
    assert.equal(
      readFileSync(join(root, 'api/.env'), 'utf8'),
      initial + 'CUSTOM_VALUE="$(not-a-shell-command)"\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('startup orders migrations and seeding before API readiness and never removes volumes', async () => {
  const root = fixture();
  const calls = [];
  try {
    await startLocal(['up'], root, (args, options) => {
      calls.push(args);
      assert.equal(options.env.DEMO_MODE, 'false');
    });
    assert.deepEqual(calls[0], ['compose', 'config', '--quiet']);
    assert.equal(calls[2].at(-1), 'migrate');
    assert.equal(calls[3].at(-1), 'demo-seed');
    assert.equal(calls[4].at(-1), 'api');
    assert(!calls.flat().includes('--volumes'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('demo mode is explicit and reset refuses absent confirmation before Docker commands', async () => {
  const root = fixture();
  const calls = [];
  try {
    await assert.rejects(
      startLocal(['reset', '--demo'], root, (args) => calls.push(args)),
      /confirm/,
    );
    assert.equal(calls.length, 0);
    await startLocal(['up', '--demo'], root, (_args, options) =>
      assert.equal(options.env.DEMO_MODE, 'true'),
    );
    await startLocal(['reset', '--demo', resetConfirmation], root, (args) => calls.push(args));
    assert(calls.some((args) => args.includes('--volumes')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('local startup and reset refuse every production configuration source', async () => {
  const root = fixture();
  try {
    ensureEnvironment(root);
    writeFileSync(join(root, 'api/.env'), 'NODE_ENV=production\n');
    await assert.rejects(
      startLocal(['up', '--demo'], root, () => assert.fail('Docker must not run')),
      /production/,
    );
    await assert.rejects(
      startLocal(['reset', '--demo', resetConfirmation], root, () =>
        assert.fail('Docker must not run'),
      ),
      /production/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('connection construction escapes credentials without shell evaluation', () => {
  const root = fixture();
  try {
    ensureEnvironment(root);
    writeFileSync(
      join(root, '.env'),
      'MYSQL_USER=leaseflow\nMYSQL_PASSWORD="secret@with#symbols"\nMYSQL_DATABASE=leaseflow\n',
    );
    const values = localEnvironment(root, {});
    const url = new URL(values.MYSQL_CONNECTION_URL);
    assert.equal(decodeURIComponent(url.password), 'secret@with#symbols');
    assert.equal(url.hostname, 'mysql');
    const override = new URL(
      localEnvironment(root, {
        MYSQL_USER: 'override-user',
        MYSQL_PASSWORD: 'override@password',
        MYSQL_DATABASE: 'override_database',
      }).MYSQL_CONNECTION_URL,
    );
    assert.equal(override.username, 'override-user');
    assert.equal(decodeURIComponent(override.password), 'override@password');
    assert.equal(override.pathname, '/override_database');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('startup stops after the first failed migration without a success report', async () => {
  const root = fixture();
  const calls = [];
  try {
    await assert.rejects(
      startLocal(['up'], root, (args) => {
        calls.push(args);
        if (args.at(-1) === 'migrate') throw new Error('migration failure');
      }),
      /migration failure/,
    );
    assert.equal(calls.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
