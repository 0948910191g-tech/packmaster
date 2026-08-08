import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const batchSource = fs.readFileSync(path.resolve(__dirname, '../packmaster-batch.js'), 'utf8');

const markers = [
  '<script src="./packmaster-archive.js"></script>',
  'const archiveApi = window.PackMasterArchive;',
  "const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');",
  'const getBatchArchivedAt = (batch) =>',
  'archiveApi.getArchivedAt(batch.id, batch.archivedAt || null)',
  'const handleArchiveBatch = async (batch) => {',
  'archiveApi.archiveBatch(batch.id, new Date())',
  'const handleRestoreArchivedBatch = async (batch) => {',
  'archiveApi.restoreBatch(batch.id, new Date())',
  'const handleDeleteSelectedArchived = async () => {',
  'await batchApi.deleteBatch(batchId)',
  'archiveState: archiveApi ? archiveApi.exportArchiveStore() : {}',
  'archiveApi.validateArchiveStore(backup.settings.archiveState || {})',
  'archiveApi.replaceArchiveStore(backup.settings.archiveState || {})',
  'Active', 'Archived', 'เก็บเข้าคลัง', 'นำกลับ', 'ลบที่เลือก'
];
markers.forEach((marker) => assert.ok(html.includes(marker), `missing Phase 3D sidecar UI marker: ${marker}`));

assert.ok(html.includes('visibleBatches.map((batch) =>'), 'Batch list must use archive filter derived view');
assert.equal(html.includes('batchApi.archiveBatch('), false);
assert.equal(html.includes('batchApi.restoreArchivedBatch('), false);
assert.equal(html.includes('batchApi.deleteArchivedBatches('), false);

for (const forbidden of ['archiveBatchMeta', 'restoreBatchMeta', 'archiveBatch = async', 'restoreArchivedBatch = async', 'deleteArchivedBatches = async', 'archivedAt: null']) {
  assert.equal(batchSource.includes(forbidden), false, `packmaster-batch.js must stay frozen; found ${forbidden}`);
}

assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'));
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'));
console.log('PackMaster Phase 3D archive sidecar UI guard passed');
