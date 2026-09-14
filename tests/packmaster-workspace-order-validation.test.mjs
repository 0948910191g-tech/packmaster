import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const workspace = require('../packmaster-workspace.js');

const malformed = {
  schema: workspace.SCHEMA,
  version: workspace.VERSION,
  createdAt: '2026-09-14T06:00:00.000Z',
  appVersion: 'ticket-06',
  settings: {},
  skuRules: [],
  batches: [{ id: 'b1' }],
  batchOrders: [{ batchId: 'b1', orders: [{}] }]
};

assert.throws(
  () => workspace.validateBackup(malformed),
  /batchOrders\[b1\]\.orders\[0\].*(id|parsedItems)/i,
  'malformed orders must be rejected with an actionable path before restore'
);
const calls = [];
const fakeBatchApi = {
  async listBatches() { return [{ id: 'existing' }]; },
  async loadBatch() { return { meta: { id: 'existing' }, orders: [] }; },
  async deleteBatch(id) { calls.push(['delete', id]); },
  async saveBatch(meta) { calls.push(['save', meta.id]); return meta; }
};

await assert.rejects(
  () => workspace.replaceWorkspaceBatches(malformed, fakeBatchApi),
  /batchOrders\[b1\]\.orders\[0\].*(id|parsedItems)/i
);
assert.deepEqual(calls, [], 'malformed restore must not mutate current workspace');

const valid = { ...malformed,
  batchOrders: [{ batchId: 'b1', orders: [
    { id: 'o1', parsedItems: [{ text: 'SANITIZED SKU', qty: 2 }] },
    { id: 'o2', parsedItems: [], isContinuation: true }
  ] }]
};
assert.equal(workspace.validateBackup(valid), valid);
console.log('PackMaster workspace order validation tests passed');
