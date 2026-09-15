import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const duplicate = require(path.resolve(__dirname, '../packmaster-duplicate.js'));
const archive = require(path.resolve(__dirname, '../packmaster-archive.js'));
const sourceFiles = require(path.resolve(__dirname, '../packmaster-batch-source-files.js'));
const health = require(path.resolve(__dirname, '../packmaster-storage-health.js'));

const makeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    raw(key) { return map.get(key); }
  };
};const corruptRaw = '{not-json';
for (const api of [duplicate, archive, sourceFiles]) {
  assert.equal(typeof api.getStoreHealth, 'function', 'sidecar must expose health');
  assert.equal(typeof api.resetStore, 'function', 'sidecar must expose explicit reset');
}

const dupStorage = makeStorage({ [duplicate.STORAGE_KEY]: corruptRaw });
assert.equal(duplicate.getStoreHealth(dupStorage).status, 'corrupt');
assert.deepEqual(duplicate.getBatchFingerprints('b1', dupStorage), [], 'read path may fail safe for UI');
assert.throws(() => duplicate.appendBatchFingerprints('b1', [{ hash: 'A', size: 1 }], dupStorage), /corrupt|unreadable/i);
assert.equal(dupStorage.raw(duplicate.STORAGE_KEY), corruptRaw, 'append must not overwrite recovery evidence');
assert.throws(() => duplicate.clearBatchFingerprints('b1', dupStorage), /corrupt|unreadable/i);
assert.equal(dupStorage.raw(duplicate.STORAGE_KEY), corruptRaw, 'clear must not overwrite recovery evidence');
duplicate.resetStore(dupStorage);
assert.equal(duplicate.getStoreHealth(dupStorage).status, 'empty');

const archiveStorage = makeStorage({ [archive.STORAGE_KEY]: corruptRaw });
assert.equal(archive.getStoreHealth(archiveStorage).status, 'corrupt');
assert.throws(() => archive.archiveBatch('b1', new Date('2026-09-15T00:00:00Z'), archiveStorage), /corrupt|unreadable/i);
assert.equal(archiveStorage.raw(archive.STORAGE_KEY), corruptRaw);
archive.resetStore(archiveStorage);
assert.equal(archive.getStoreHealth(archiveStorage).status, 'empty');const sourceStorage = makeStorage({ [sourceFiles.STORAGE_KEY]: corruptRaw });
assert.equal(sourceFiles.getStoreHealth(sourceStorage).status, 'corrupt');
assert.equal(sourceFiles.getBatchSourceFileNames('b1', sourceStorage), null, 'read path stays usable but degraded');
assert.throws(() => sourceFiles.rememberBatchSourceFiles('b1', [{ sourceFileName: 'safe.pdf' }], sourceStorage), /corrupt|unreadable/i);
assert.equal(sourceStorage.raw(sourceFiles.STORAGE_KEY), corruptRaw);
sourceFiles.resetStore(sourceStorage);
assert.equal(sourceFiles.getStoreHealth(sourceStorage).status, 'empty');

const summary = health.inspectLocalSafetyMetadata({ duplicateApi: duplicate, archiveApi: archive, batchSourceFilesApi: sourceFiles }, {
  duplicate: makeStorage({ [duplicate.STORAGE_KEY]: '{bad' }),
  archive: makeStorage(),
  sourceFiles: makeStorage()
});
assert.equal(summary.status, 'degraded');
assert.deepEqual(summary.issues.map(row => row.kind), ['duplicate']);

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
assert.ok(html.includes('data-pm-local-metadata-warning'), 'UI must surface degraded local metadata');
assert.ok(html.includes('handleResetCorruptSafetyMetadata'), 'UI must require explicit reset action');
for (const marker of ['batchSourceFilesApi.forgetBatchSourceFiles(batch.id)', 'duplicateApi.clearBatchFingerprints(batch.id)', 'archiveApi.clearBatchArchive(batch.id)']) {
  assert.ok(html.includes(marker), `delete cleanup missing: ${marker}`);
}
console.log('PackMaster local safety metadata health tests passed');assert.ok(html.includes('batchSourceFilesApi.forgetBatchSourceFiles(batchId)'), 'bulk archived delete must clean source-file metadata');
assert.ok(html.includes("localMetadataHealth.status === 'degraded'"), 'destructive cleanup/delete must gate on degraded metadata health');