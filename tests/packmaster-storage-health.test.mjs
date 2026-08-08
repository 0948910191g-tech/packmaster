import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const storage = require(path.resolve(__dirname, '../packmaster-storage-health.js'));

assert.equal(typeof storage.estimateStorage, 'function');
assert.equal(typeof storage.stripReprintPayload, 'function');
assert.equal(typeof storage.cleanupArchivedReprintImages, 'function');
assert.equal(typeof storage.formatBytes, 'function');

const unsupported = await storage.estimateStorage({});
assert.deepEqual(unsupported, { supported: false, usage: null, quota: null, percent: null });

const estimated = await storage.estimateStorage({ storage: { async estimate() { return { usage: 250, quota: 1000 }; } } });
assert.equal(estimated.supported, true);
assert.equal(estimated.usage, 250);
assert.equal(estimated.quota, 1000);
assert.equal(estimated.percent, 25);

const source = {
  id: 'safe-order',
  pdfImage: 'data:image/jpeg;base64,HEAVY',
  platform: 'SHOPEE',
  tracking: 'SAFE-001',
  parsedItems: [{ text: 'Sample', qty: 1 }],
  displayItems: ['Sample 1'],
  parserWarning: false,
  qtyWarning: false
};
const stripped = storage.stripReprintPayload(source);
assert.equal(Object.prototype.hasOwnProperty.call(stripped, 'pdfImage'), false);
assert.equal(stripped.platform, 'SHOPEE');
assert.deepEqual(stripped.parsedItems, source.parsedItems);
assert.deepEqual(stripped.displayItems, source.displayItems);
assert.equal(source.pdfImage.startsWith('data:image'), true, 'source order must not be mutated');

const records = new Map([
  ['archived-1', { meta: { id: 'archived-1', archivedAt: '2026-08-01T00:00:00.000Z' }, orders: [source, { ...source, id: 'two', pdfImage: 'data:image/png;base64,TWO' }] }],
  ['active-1', { meta: { id: 'active-1', archivedAt: null }, orders: [source] }]
]);
const saves = [];
const fakeBatchApi = {
  async loadBatch(id) { return records.get(id) || { meta: null, orders: [] }; },
  async saveBatch(meta, orders) { saves.push({ meta, orders }); return meta; }
};

const cleanup = await storage.cleanupArchivedReprintImages(fakeBatchApi, ['archived-1', 'active-1', 'missing']);
assert.equal(cleanup.cleanedBatches, 1);
assert.equal(cleanup.cleanedOrders, 2);
assert.equal(cleanup.skippedBatches, 2, 'active or missing batches must be skipped');
assert.equal(saves.length, 1);
assert.equal(saves[0].meta.id, 'archived-1');
assert.equal(saves[0].orders.every((order) => !Object.prototype.hasOwnProperty.call(order, 'pdfImage')), true);
assert.equal(records.get('archived-1').orders[0].pdfImage.startsWith('data:image'), true, 'stored source fixture must not be mutated in place');

assert.equal(storage.formatBytes(0), '0 B');
assert.match(storage.formatBytes(1024), /1(\.0)? KB/);

console.log('PackMaster storage health regression tests passed');
