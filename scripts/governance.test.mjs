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
  const continuation = JSON.parse(read('docs/batch-200.json'));
  const additional = new Set(
    continuation.items.filter((item) => item.status === 'VERIFIED').map((item) => item.id),
  );
  for (const item of batch.items) {
    assert(['PENDING_VERIFICATION', 'VERIFIED', 'PARTIAL', 'BLOCKED'].includes(item.status));
    const line = checklist.split('\n').find((line) => line.includes('**' + item.id + '**'));
    assert(line, 'Unknown checklist identifier: ' + item.id);
    assert.equal(line.startsWith('- [x]'), item.status === 'VERIFIED' || additional.has(item.id));
    assert(item.code.length && item.tests.length);
  }
  const checked = [...checklist.matchAll(/^- \[x\] /gm)].length;
  assert.equal(
    checked,
    batch.baselineCompleted +
      batch.items.filter((item) => item.status === 'VERIFIED').length +
      additional.size,
  );
});

test('the continuation preserves two hundred existing requirements and evidence-based completion', () => {
  const batch = JSON.parse(read('docs/batch-200.json'));
  const checklist = read('checklist.md');
  const rows = [...checklist.matchAll(/^- \[([ x])\] \*\*([^*]+)\*\*/gm)];
  const allIds = rows.map((row) => row[2]);
  const checkedIds = new Set(rows.filter((row) => row[1] === 'x').map((row) => row[2]));
  assert.equal(allIds.length, 764);
  assert.equal(new Set(allIds).size, 764);
  assert.equal(
    createHash('sha256').update(allIds.join('\n')).digest('hex'),
    batch.checklistIdentifierSha256,
  );
  assert.equal(batch.target, 200);
  assert.equal(batch.items.length, 200);
  assert.equal(new Set(batch.items.map((item) => item.id)).size, 200);
  assert.equal(batch.baselineCompleted, 162);
  assert.equal(batch.baselineCompletedIds.length, 162);
  assert.equal(new Set(batch.baselineCompletedIds).size, 162);
  for (const id of batch.baselineCompletedIds)
    assert(checkedIds.has(id), 'Lost baseline closure: ' + id);
  for (const item of batch.items) {
    assert(allIds.includes(item.id), 'Unknown identifier: ' + item.id);
    assert(!batch.baselineCompletedIds.includes(item.id), 'Duplicate baseline credit: ' + item.id);
    assert(['PENDING_VERIFICATION', 'VERIFIED', 'PARTIAL', 'BLOCKED'].includes(item.status));
    assert.equal(checkedIds.has(item.id), item.status === 'VERIFIED');
    assert(item.code.length && item.tests.length && item.note.length);
    for (const path of [...item.code, ...item.tests]) read(path);
    if (item.status === 'VERIFIED') {
      assert.match(item.commit, /^[0-9a-f]{40}$/);
      assert.match(
        item.evidence,
        /^https:\/\/github\.com\/yehiashouman\/leaseflow\/actions\/runs\/\d+$/,
      );
      assert.equal(item.verified, '2026-11-09');
    }
    if (item.status === 'BLOCKED') assert(item.decisions.length);
  }
  const progress = read('docs/PROGRESS.md');
  const completion = /\| Completed tasks with evidence\s*\|\s*(\d+)/.exec(progress);
  assert.equal(Number(completion?.[1]), checkedIds.size);
  const tableTotal = /\| Total\s*\|\s*764\s*\|\s*(\d+)/.exec(progress);
  assert.equal(Number(tableTotal?.[1]), checkedIds.size);
  assert.equal(
    checkedIds.size,
    162 + batch.items.filter((item) => item.status === 'VERIFIED').length,
  );
});
