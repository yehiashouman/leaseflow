import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const decisions = JSON.parse(read('docs/decisions.json'));
test('every owner decision has an explicit pending owner and no implied approval', () => {
  const expected = [...read('requirements.md').matchAll(/^\| DEC-(\d{2})\s*\|/gm)].map(
    (match) => 'DEC-' + match[1],
  );
  assert.equal(expected.length, 26);
  assert.deepEqual(
    decisions.items.map((item) => item.id),
    expected,
  );
  assert.equal(decisions.itemDefaults.owner, 'PROJECT_OWNER');
  assert.equal(decisions.itemDefaults.status, 'PENDING');
  assert.equal(decisions.itemDefaults.resolution, null);
  assert.deepEqual(decisions.approvedDecisions, []);
});
test('the original product specification remains byte-for-byte unchanged', () => {
  assert.equal(
    createHash('sha256').update(read('SPECIFICATION.md')).digest('hex'),
    decisions.specificationSha256,
  );
});
test('the batch contains exactly thirty unique existing checklist items', () => {
  const batch = JSON.parse(read('docs/batch-30.json'));
  assert.equal(batch.items.length, 30);
  assert.equal(new Set(batch.items).size, 30);
  for (const id of batch.items) assert(read('checklist.md').includes('**' + id + '**'));
});
test('development forwarding and service exposure preserve the intended boundary', () => {
  const config = JSON.parse(read('.devcontainer/devcontainer.json'));
  assert.equal(config.portsAttributes['8080'].protocol, 'http');
  assert.deepEqual(config.forwardPorts, [8080]);
  assert.equal(config.otherPortsAttributes.visibility, 'private');
  assert(read('.dockerignore').split('\n').includes('**/.env*'));
  assert(read('docs/TECHNICAL-SELECTIONS.md').includes('not owner approval'));
});

test('the larger batch preserves one hundred stable requirements and honest completion counts', () => {
  const batch = JSON.parse(read('docs/batch-100.json'));
  const checklist = read('checklist.md');
  assert.equal(batch.target, 100);
  assert.equal(batch.items.length, 100);
  assert.equal(new Set(batch.items.map((item) => item.id)).size, 100);
  for (const item of batch.items) {
    assert(['PENDING_VERIFICATION', 'VERIFIED', 'PARTIAL', 'BLOCKED'].includes(item.status));
    const line = checklist.split('\n').find((line) => line.includes('**' + item.id + '**'));
    assert(line, 'Unknown checklist identifier: ' + item.id);
    assert.equal(line.startsWith('- [x]'), item.status === 'VERIFIED');
    assert(item.code.length && item.tests.length);
  }
  const checked = [...checklist.matchAll(/^- \[x\] /gm)].length;
  assert.equal(
    checked,
    batch.baselineCompleted + batch.items.filter((item) => item.status === 'VERIFIED').length,
  );
});
