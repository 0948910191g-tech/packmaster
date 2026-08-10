import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const duplicate = require(path.resolve(__dirname, '../packmaster-duplicate.js'));

assert.equal(duplicate.STORAGE_KEY, 'packmasterDuplicateFingerprintsV1');
assert.equal(typeof duplicate.getBatchFingerprints, 'function');
assert.equal(typeof duplicate.getKnownFingerprints, 'function');
assert.equal(typeof duplicate.appendBatchFingerprints, 'function');
assert.equal(typeof duplicate.clearBatchFingerprints, 'function');
assert.equal(typeof duplicate.exportFingerprintStore, 'function');
assert.equal(typeof duplicate.validateFingerprintStore, 'function');
assert.equal(typeof duplicate.replaceFingerprintStore, 'function');

const makeStorage = () => {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
};

const storage = makeStorage();
assert.deepEqual(duplicate.getBatchFingerprints('batch-1', storage), []);
const appended = duplicate.appendBatchFingerprints('batch-1', [
  { name: 'customer-order.pdf', size: 1234, hash: 'ABC123', addedAt: '2026-08-08T13:00:00.000Z' },
  { name: 'duplicate-name.pdf', size: 1234, hash: 'abc123', addedAt: '2026-08-08T13:01:00.000Z' },
  { size: 777, hash: 'DEF456', addedAt: '2026-08-08T13:02:00.000Z' }
], storage);
assert.equal(appended.length, 2);
assert.equal('name' in appended[0], false, 'source filename must not persist in sidecar');

const known = duplicate.getKnownFingerprints('batch-1', [
  { name: 'legacy.pdf', hash: 'LEGACY999', size: 9 },
  { name: 'legacy-copy.pdf', hash: 'abc123', size: 9 }
], storage);
assert.equal(known.length, 3);
assert.ok(known.some(row => String(row.hash).toUpperCase() === 'LEGACY999'));
assert.ok(known.some(row => String(row.hash).toUpperCase() === 'ABC123'));

const exported = duplicate.exportFingerprintStore(storage);
exported['batch-1'][0].hash = 'MUTATED';
assert.equal(duplicate.getBatchFingerprints('batch-1', storage)[0].hash, 'ABC123');

const restoreStorage = makeStorage();
duplicate.replaceFingerprintStore({
  'restored-batch': [{ hash: 'RESTORE1', size: 11, addedAt: '2026-08-08T14:00:00.000Z', name: 'drop.pdf' }]
}, restoreStorage);
const restored = duplicate.getBatchFingerprints('restored-batch', restoreStorage);
assert.equal(restored.length, 1);
assert.equal('name' in restored[0], false);
assert.throws(() => duplicate.replaceFingerprintStore({ bad: [{ hash: '' }] }, restoreStorage), /fingerprint/i);
assert.equal(duplicate.getBatchFingerprints('restored-batch', restoreStorage).length, 1);

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const markers = [
  'duplicateApi.getKnownFingerprints(activeBatchId, orders.length > 0 ? (activeBatch?.sourceFiles || []) : [])',
  'duplicateApi.appendBatchFingerprints(activeBatchId, acceptedSourceFiles)',
  'duplicateApi.clearBatchFingerprints(batch.id)',
  'duplicateApi.clearBatchFingerprints(activeBatchId)',
  'duplicateFingerprints: duplicateApi ? duplicateApi.exportFingerprintStore() : {}',
  'duplicateApi.validateFingerprintStore(backup.settings.duplicateFingerprints || {})',
  'duplicateApi.replaceFingerprintStore(backup.settings.duplicateFingerprints || {})'
];
markers.forEach(marker => assert.ok(html.includes(marker), `missing sidecar marker: ${marker}`));
assert.equal(html.includes('sourceFiles: [...(Array.isArray(activeBatch.sourceFiles)'), false);
assert.equal(html.includes("console.error('Save source fingerprint failed'"), false);
assert.ok(html.includes('for (let i = 0; i < ordersToExport.length; i++)'), 'duplicate sidecar must coexist with scoped PDF output');
assert.ok(html.includes('{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'duplicate sidecar must coexist with scoped browser print output');

console.log('PackMaster duplicate LocalStorage sidecar guardrail tests passed');
