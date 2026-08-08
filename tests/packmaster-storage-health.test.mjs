import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const storage = require(path.resolve(__dirname, '../packmaster-storage-health.js'));

for (const method of ['estimateStorage','stripReprintPayload','cleanupArchivedReprintImages','formatBytes']) {
  assert.equal(typeof storage[method], 'function');
}

const unsupported = await storage.estimateStorage({});
assert.deepEqual(unsupported, { supported: false, usage: null, quota: null, percent: null });
const estimated = await storage.estimateStorage({ storage: { async estimate() { return { usage: 250, quota: 1000 }; } } });
assert.equal(estimated.percent, 25);

const source = {
  id: 'safe-order', pdfImage: 'data:image/jpeg;base64,HEAVY', platform: 'SHOPEE', tracking: 'SAFE-001',
  parsedItems: [{ text: 'Sample', qty: 1 }], displayItems: ['Sample 1'], parserWarning: false, qtyWarning: false
};
const stripped = storage.stripReprintPayload(source);
assert.equal(Object.prototype.hasOwnProperty.call(stripped, 'pdfImage'), false);
assert.equal(source.pdfImage.startsWith('data:image'), true);

const records = new Map([
  ['archived-sidecar', { meta: { id: 'archived-sidecar' }, orders: [source, { ...source, id: 'two', pdfImage: 'data:image/png;base64,TWO' }] }],
  ['legacy-archived', { meta: { id: 'legacy-archived', archivedAt: '2026-08-01T00:00:00.000Z' }, orders: [source] }],
  ['active-1', { meta: { id: 'active-1' }, orders: [source] }]
]);
const saves = [];
const fakeBatchApi = {
  async loadBatch(id) { return records.get(id) || { meta: null, orders: [] }; },
  async saveBatch(meta, orders) { saves.push({ meta, orders }); return meta; }
};
const archivedIds = new Set(['archived-sidecar', 'legacy-archived']);
const isArchived = (meta) => archivedIds.has(meta.id);

const cleanup = await storage.cleanupArchivedReprintImages(fakeBatchApi, ['archived-sidecar', 'legacy-archived', 'active-1', 'missing'], isArchived);
assert.equal(cleanup.cleanedBatches, 2);
assert.equal(cleanup.cleanedOrders, 3);
assert.equal(cleanup.skippedBatches, 2);
assert.equal(saves.length, 2);
assert.ok(saves.some(row => row.meta.id === 'archived-sidecar'));
assert.ok(saves.some(row => row.meta.id === 'legacy-archived'));
assert.equal(saves.every(row => row.orders.every(order => !Object.prototype.hasOwnProperty.call(order, 'pdfImage'))), true);

await assert.rejects(
  () => storage.cleanupArchivedReprintImages(fakeBatchApi, ['archived-sidecar']),
  /archive/i,
  'cleanup must require an explicit archive predicate instead of trusting IndexedDB metadata'
);

assert.equal(storage.formatBytes(0), '0 B');
assert.match(storage.formatBytes(1024), /1(\.0)? KB/);
console.log('PackMaster storage health sidecar-aware regression tests passed');
