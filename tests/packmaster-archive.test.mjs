import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const batch = require(path.resolve(__dirname, '../packmaster-batch.js'));

assert.equal(typeof batch.archiveBatchMeta, 'function', 'archiveBatchMeta must be exported');
assert.equal(typeof batch.restoreBatchMeta, 'function', 'restoreBatchMeta must be exported');
assert.equal(typeof batch.archiveBatch, 'function', 'archiveBatch must be exported');
assert.equal(typeof batch.restoreArchivedBatch, 'function', 'restoreArchivedBatch must be exported');
assert.equal(typeof batch.deleteArchivedBatches, 'function', 'deleteArchivedBatches must be exported');

const original = {
  id: 'batch-safe-1',
  name: '8 Aug / Batch #001',
  status: 'REVIEW',
  printedAt: null,
  reviewSkuCount: 1,
  reviewQtyCount: 0,
  unmappedCount: 0,
  createdAt: '2026-08-08T10:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z'
};

const archived = batch.archiveBatchMeta(original, '2026-08-08T13:00:00.000Z');
assert.equal(archived.status, 'REVIEW', 'archive must preserve operational status');
assert.equal(archived.archivedAt, '2026-08-08T13:00:00.000Z');
assert.equal(archived.updatedAt, '2026-08-08T13:00:00.000Z');
assert.equal(original.archivedAt, undefined, 'pure helper must not mutate source metadata');

const restored = batch.restoreBatchMeta(archived, '2026-08-08T14:00:00.000Z');
assert.equal(restored.status, 'REVIEW', 'restore must preserve operational status');
assert.equal(restored.archivedAt, null);
assert.equal(restored.updatedAt, '2026-08-08T14:00:00.000Z');

assert.throws(() => batch.archiveBatchMeta(null), /metadata/i);
assert.throws(() => batch.restoreBatchMeta({}), /metadata/i);

console.log('PackMaster Batch archive lifecycle tests passed');
