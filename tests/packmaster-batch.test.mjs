import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterPath = path.resolve(__dirname, '../packmaster-batch.js');
const indexPath = path.resolve(__dirname, '../index.html');

assert.ok(fs.existsSync(adapterPath), 'packmaster-batch.js must exist');

const require = createRequire(import.meta.url);
const batch = require(adapterPath);

assert.equal(typeof batch.createBatchMeta, 'function', 'createBatchMeta must be exported');
assert.equal(typeof batch.deriveBatchStatus, 'function', 'deriveBatchStatus must be exported');
assert.equal(typeof batch.buildBatchMeta, 'function', 'buildBatchMeta must be exported');
assert.equal(typeof batch.listBatches, 'function', 'listBatches must be exported');
assert.equal(typeof batch.saveBatch, 'function', 'saveBatch must be exported');
assert.equal(typeof batch.loadBatch, 'function', 'loadBatch must be exported');
assert.equal(typeof batch.deleteBatch, 'function', 'deleteBatch must be exported');

const fixedNow = new Date('2026-08-08T11:00:00.000Z');
const created = batch.createBatchMeta([
  { id: 'a', name: '8 Aug / Batch #001' },
  { id: 'b', name: '8 Aug / Batch #002' },
  { id: 'c', name: '8 Aug / Batch #003' }
], fixedNow);

assert.equal(created.name, '8 Aug / Batch #004');
assert.equal(created.status, 'WAITING');
assert.equal(created.totalOrders, 0);
assert.equal(created.readyCount, 0);
assert.equal(created.reviewSkuCount, 0);
assert.equal(created.reviewQtyCount, 0);
assert.equal(created.unmappedCount, 0);
assert.equal(created.printedAt, null);
assert.ok(created.id.startsWith('batch-'));

const createdAfterDeletion = batch.createBatchMeta([
  { id: 'a', name: '8 Aug / Batch #001' },
  { id: 'c', name: '8 Aug / Batch #003' }
], fixedNow);
assert.equal(createdAfterDeletion.name, '8 Aug / Batch #004', 'deleting an older batch must not reuse an existing batch number');

assert.equal(batch.deriveBatchStatus({ total: 0, ready: 0, reviewSku: 0, reviewQty: 0, unmapped: 0 }, null), 'WAITING');
assert.equal(batch.deriveBatchStatus({ total: 10, ready: 10, reviewSku: 0, reviewQty: 0, unmapped: 0 }, null), 'READY');
assert.equal(batch.deriveBatchStatus({ total: 10, ready: 9, reviewSku: 1, reviewQty: 0, unmapped: 0 }, null), 'REVIEW');
assert.equal(batch.deriveBatchStatus({ total: 10, ready: 9, reviewSku: 0, reviewQty: 1, unmapped: 0 }, null), 'REVIEW');
assert.equal(batch.deriveBatchStatus({ total: 10, ready: 9, reviewSku: 0, reviewQty: 0, unmapped: 1 }, null), 'REVIEW');
assert.equal(batch.deriveBatchStatus({ total: 10, ready: 9, reviewSku: 1, reviewQty: 0, unmapped: 0 }, '2026-08-08T11:30:00.000Z'), 'COMPLETED');

const built = batch.buildBatchMeta(created, {
  total: 12,
  ready: 9,
  reviewSku: 1,
  reviewQty: 1,
  unmapped: 1
}, { now: new Date('2026-08-08T12:00:00.000Z') });

assert.equal(built.totalOrders, 12);
assert.equal(built.readyCount, 9);
assert.equal(built.reviewSkuCount, 1);
assert.equal(built.reviewQtyCount, 1);
assert.equal(built.unmappedCount, 1);
assert.equal(built.status, 'REVIEW');
assert.equal(built.updatedAt, '2026-08-08T12:00:00.000Z');

const html = fs.readFileSync(indexPath, 'utf8');
const requiredUiMarkers = [
  '<script src="./packmaster-batch.js"></script>',
  'const [batches, setBatches] = useState([]);',
  'const [activeBatchId, setActiveBatchId] = useState(null);',
  'const handleCreateBatch = async () => {',
  'const handleOpenBatch = async (batch) => {',
  'const handleBackToBatchList = async () => {',
  'const handleDeleteBatch = async (batch) => {',
  'const markActiveBatchPrinted = async () => {',
  "const handlePrint = async (mode = 'FULL_BATCH', override = false) => {",
  'เริ่มงานแพ็กใหม่',
  'กลับรายการ Batch'
];

requiredUiMarkers.forEach((marker) => {
  assert.ok(html.includes(marker), `index.html must include Phase 2 marker: ${marker}`);
});

assert.ok(html.includes('for (let i = 0; i < ordersToExport.length; i++)'), 'Save PDF must iterate the explicitly selected print/export scope');
assert.ok(html.includes('{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Browser print area must render the explicitly selected scope');
assert.ok(html.includes("mode === 'FULL_BATCH' && !printBlocked"), 'only a clean full-batch output may mark the Batch completed');

console.log('PackMaster local batch helper and scoped UI integration tests passed');
