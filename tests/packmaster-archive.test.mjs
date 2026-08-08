import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const archivePath = path.resolve(__dirname, '../packmaster-archive.js');
assert.ok(fs.existsSync(archivePath), 'packmaster-archive.js must exist');

const require = createRequire(import.meta.url);
const archive = require(archivePath);

assert.equal(archive.STORAGE_KEY, 'packmasterBatchArchiveV1');
for (const method of ['getArchiveRecord','getArchivedAt','isArchived','archiveBatch','restoreBatch','clearBatchArchive','exportArchiveStore','validateArchiveStore','replaceArchiveStore']) {
  assert.equal(typeof archive[method], 'function', `${method} must be exported`);
}

const makeStorage = () => {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
};

const storage = makeStorage();
const legacyArchivedAt = '2026-08-08T12:00:00.000Z';
assert.equal(archive.getArchiveRecord('batch-1', storage), null);
assert.equal(archive.getArchivedAt('batch-1', legacyArchivedAt, storage), legacyArchivedAt);
assert.equal(archive.isArchived('batch-1', legacyArchivedAt, storage), true);

const archived = archive.archiveBatch('batch-1', new Date('2026-08-08T13:00:00.000Z'), storage);
assert.deepEqual(archived, { archivedAt: '2026-08-08T13:00:00.000Z', touchedAt: '2026-08-08T13:00:00.000Z' });
assert.equal(archive.isArchived('batch-1', null, storage), true);

const restored = archive.restoreBatch('batch-1', new Date('2026-08-08T14:00:00.000Z'), storage);
assert.deepEqual(restored, { archivedAt: null, touchedAt: '2026-08-08T14:00:00.000Z' });
assert.equal(archive.getArchivedAt('batch-1', legacyArchivedAt, storage), null, 'explicit restore sidecar overrides legacy metadata');

const exported = archive.exportArchiveStore(storage);
exported['batch-1'].archivedAt = 'MUTATED';
assert.equal(archive.getArchiveRecord('batch-1', storage).archivedAt, null);

const validated = archive.validateArchiveStore({
  'batch-a': { archivedAt: '2026-08-08T15:00:00.000Z', touchedAt: '2026-08-08T15:00:00.000Z' },
  'batch-b': { archivedAt: null, touchedAt: '2026-08-08T15:01:00.000Z' }
});
assert.equal(validated['batch-a'].archivedAt, '2026-08-08T15:00:00.000Z');
assert.equal(validated['batch-b'].archivedAt, null);

const restoreStorage = makeStorage();
archive.replaceArchiveStore(validated, restoreStorage);
assert.equal(archive.isArchived('batch-a', null, restoreStorage), true);
assert.equal(archive.isArchived('batch-b', legacyArchivedAt, restoreStorage), false);

const beforeInvalid = archive.exportArchiveStore(restoreStorage);
assert.throws(() => archive.replaceArchiveStore({ bad: { archivedAt: 'not-a-date', touchedAt: 'also-bad' } }, restoreStorage), /archive/i);
assert.deepEqual(archive.exportArchiveStore(restoreStorage), beforeInvalid);

assert.equal(archive.clearBatchArchive('batch-1', storage), true);
assert.equal(archive.getArchiveRecord('batch-1', storage), null);
assert.equal(archive.getArchivedAt('batch-1', legacyArchivedAt, storage), legacyArchivedAt);

console.log('PackMaster archive LocalStorage sidecar tests passed');
